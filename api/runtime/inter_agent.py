"""Inter-agent messaging and collaboration via the event bus.

When an agent publishes a finding to the shared knowledge graph, other agents
in the same workspace are notified via the event bus. Each receiving agent
evaluates the finding against its own values, expertise, and goals, then
creates a SUPPORTS or CONTRADICTS relationship with a confidence score.

If two agents contradict each other, a disagreement is flagged for human review.
"""

from __future__ import annotations

import logging
from uuid import UUID

import anthropic

from api.config import settings
from api.doctrine.confidence import parse_confidence
from api.doctrine.events import event_bus
from api.doctrine.store import (
    create_relationship,
    mark_disputed,
)
from api.models.agent import ConfidenceScore
from api.runtime.agent_worker import MODEL, MAX_TOKENS

logger = logging.getLogger(__name__)


def _supabase():
    from supabase import create_client

    return create_client(settings.supabase_url, settings.supabase_service_role_key)


async def _get_workspace_agents(workspace_id: UUID) -> list[dict]:
    """Get all agent profiles for members of a workspace."""
    sb = _supabase()
    members = (
        sb.table("workspace_members")
        .select("user_id")
        .eq("workspace_id", str(workspace_id))
        .execute()
    )
    if not members.data:
        return []

    user_ids = [m["user_id"] for m in members.data]
    agents = (
        sb.table("agent_profiles")
        .select("*")
        .in_("user_id", user_ids)
        .execute()
    )
    return agents.data or []


async def evaluate_entity(
    evaluating_agent: dict,
    entity: dict,
    workspace_id: UUID,
) -> dict | None:
    """Have an agent evaluate another agent's published entity.

    The evaluating agent uses its own values/expertise to assess whether it
    SUPPORTS or CONTRADICTS the entity. Returns the created relationship or
    None if the agent abstains.
    """
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    agent_name = evaluating_agent["agent_name"]
    expertise = evaluating_agent.get("expertise", [])
    values = evaluating_agent.get("values", [])
    goals = evaluating_agent.get("goals", [])

    system = (
        f"You are {agent_name}, evaluating a finding published by another agent "
        f"in your shared workspace.\n\n"
        f"Your expertise: {', '.join(expertise) if expertise else 'general'}\n"
        f"Your values: {', '.join(values) if values else 'not specified'}\n"
        f"Your goals: {', '.join(goals) if goals else 'not specified'}\n\n"
        f"Evaluate the finding below. You MUST respond with exactly one of:\n"
        f"- SUPPORTS — if you agree based on your expertise/values\n"
        f"- CONTRADICTS — if you disagree based on your expertise/values\n"
        f"- ABSTAIN — if this is outside your expertise or you have no opinion\n\n"
        f"Format your response as:\n"
        f"VERDICT: <SUPPORTS|CONTRADICTS|ABSTAIN>\n"
        f"REASONING: <1-2 sentence explanation>\n"
        f'[CONFIDENCE: {{"score": <0.0-1.0>, "reasoning": "<brief>"}}]'
    )

    entity_description = (
        f"Entity: {entity['name']}\n"
        f"Type: {entity['entity_type']}\n"
        f"Author confidence: {entity.get('confidence_score', 'unknown')}\n"
        f"Properties: {entity.get('properties', {})}"
    )

    response = await client.messages.create(
        model=MODEL,
        max_tokens=512,
        system=system,
        messages=[{"role": "user", "content": entity_description}],
    )

    raw_text = response.content[0].text
    clean_text, confidence = parse_confidence(raw_text)

    # Parse verdict
    verdict = _parse_verdict(clean_text)
    if verdict == "ABSTAIN" or verdict is None:
        return None

    relationship_type = verdict  # SUPPORTS or CONTRADICTS
    agent_id = UUID(evaluating_agent["id"])

    # Create the entity that represents this agent's assessment
    rel = await create_relationship(
        workspace_id=workspace_id,
        agent_id=agent_id,
        source_entity_id=UUID(evaluating_agent["id"]),
        target_entity_id=UUID(entity["id"]),
        relationship_type=relationship_type,
        confidence=confidence,
        metadata={
            "reasoning": clean_text,
            "evaluating_agent_name": agent_name,
        },
    )

    # Publish the relationship event
    await event_bus.publish(
        workspace_id=workspace_id,
        source_agent_id=agent_id,
        event_type="relationship_created",
        payload={
            "relationship_id": rel.get("id"),
            "relationship_type": relationship_type,
            "target_entity_id": str(entity["id"]),
            "target_entity_name": entity["name"],
            "reasoning": clean_text,
            "confidence": confidence.model_dump(),
        },
    )

    return rel


def _parse_verdict(text: str) -> str | None:
    """Extract SUPPORTS, CONTRADICTS, or ABSTAIN from agent response."""
    upper = text.upper()
    for line in upper.split("\n"):
        if "VERDICT:" in line:
            if "SUPPORTS" in line:
                return "SUPPORTS"
            if "CONTRADICTS" in line:
                return "CONTRADICTS"
            if "ABSTAIN" in line:
                return "ABSTAIN"
    # Fallback: check raw text
    if "SUPPORTS" in upper:
        return "SUPPORTS"
    if "CONTRADICTS" in upper:
        return "CONTRADICTS"
    if "ABSTAIN" in upper:
        return "ABSTAIN"
    return None


async def detect_disagreements(
    workspace_id: UUID,
    entity_id: UUID,
) -> list[dict]:
    """Check if an entity has CONTRADICTS relationships and flag disagreements.

    Returns a list of disagreement records. If contradictions are found,
    the entity is marked as disputed and a disagreement_flagged event is
    published for human review.
    """
    sb = _supabase()
    eid = str(entity_id)

    contradictions = (
        sb.table("shared_relationships")
        .select("*")
        .eq("target_entity_id", eid)
        .eq("relationship_type", "CONTRADICTS")
        .execute()
    )
    if not contradictions.data:
        return []

    supports = (
        sb.table("shared_relationships")
        .select("*")
        .eq("target_entity_id", eid)
        .eq("relationship_type", "SUPPORTS")
        .execute()
    )

    # Get the entity details
    entity_result = (
        sb.table("shared_entities").select("*").eq("id", eid).execute()
    )
    entity = entity_result.data[0] if entity_result.data else {}

    # Mark entity as disputed
    await mark_disputed(entity_id)

    disagreements = []
    for contradiction in contradictions.data:
        disagreement = {
            "entity_id": eid,
            "entity_name": entity.get("name", "Unknown"),
            "contradicting_agent_id": contradiction.get("created_by_agent"),
            "contradiction_reasoning": contradiction.get("metadata", {}).get(
                "reasoning", ""
            ),
            "contradiction_confidence": contradiction.get("confidence_score", 0),
            "support_count": len(supports.data) if supports.data else 0,
            "contradict_count": len(contradictions.data),
        }
        disagreements.append(disagreement)

    # Publish disagreement event for human review
    ws_id = UUID(entity.get("workspace_id", str(workspace_id)))
    await event_bus.publish(
        workspace_id=ws_id,
        source_agent_id=UUID(entity.get("author_agent_id"))
        if entity.get("author_agent_id")
        else UUID("00000000-0000-0000-0000-000000000000"),
        event_type="disagreement_flagged",
        payload={
            "entity_id": eid,
            "entity_name": entity.get("name", "Unknown"),
            "support_count": len(supports.data) if supports.data else 0,
            "contradict_count": len(contradictions.data),
            "contradictions": [
                {
                    "agent_id": c.get("created_by_agent"),
                    "confidence": c.get("confidence_score"),
                    "reasoning": c.get("metadata", {}).get("reasoning", ""),
                }
                for c in contradictions.data
            ],
        },
    )

    # Post to workspace feed
    feed_content = (
        f"Disagreement detected on \"{entity.get('name', 'Unknown')}\": "
        f"{len(contradictions.data)} agent(s) contradict, "
        f"{len(supports.data) if supports.data else 0} agent(s) support. "
        f"Flagged for human review."
    )
    sb.table("messages").insert(
        {
            "workspace_id": str(workspace_id),
            "sender_type": "agent",
            "content": feed_content,
            "confidence": {},
            "metadata": {
                "event_type": "disagreement_flagged",
                "entity_id": eid,
            },
        }
    ).execute()

    return disagreements


async def handle_finding_published(event: dict) -> None:
    """Event handler: when an agent publishes a finding, other agents evaluate it.

    This is the core inter-agent collaboration loop:
    1. Agent A publishes an entity
    2. All other agents in the workspace evaluate it
    3. Each creates a SUPPORTS or CONTRADICTS relationship
    4. If contradictions exist, flag for human review
    """
    payload = event.get("payload", {})
    workspace_id = UUID(event["workspace_id"])
    source_agent_id = event.get("source_agent_id")
    entity_id = payload.get("entity_id")

    if not entity_id:
        logger.warning("finding_published event missing entity_id")
        return

    # Get the published entity
    sb = _supabase()
    entity_result = (
        sb.table("shared_entities").select("*").eq("id", entity_id).execute()
    )
    if not entity_result.data:
        logger.warning(f"Entity {entity_id} not found for evaluation")
        return
    entity = entity_result.data[0]

    # Get all agents in this workspace except the author
    agents = await _get_workspace_agents(workspace_id)
    other_agents = [a for a in agents if a["id"] != source_agent_id]

    if not other_agents:
        return

    # Each other agent evaluates the finding
    for agent in other_agents:
        try:
            await evaluate_entity(agent, entity, workspace_id)
        except Exception:
            logger.exception(
                f"Agent {agent['agent_name']} failed to evaluate entity {entity_id}"
            )

    # Check for disagreements after all evaluations
    await detect_disagreements(workspace_id, UUID(entity_id))


async def post_event_to_feed(event: dict) -> None:
    """Event handler: post inter-agent events to the workspace feed."""
    event_type = event.get("event_type", "")
    payload = event.get("payload", {})
    workspace_id = event.get("workspace_id")

    if not workspace_id:
        return

    # Build human-readable feed message based on event type
    content = _format_event_for_feed(event_type, payload)
    if not content:
        return

    sb = _supabase()
    sb.table("messages").insert(
        {
            "workspace_id": str(workspace_id),
            "agent_id": event.get("source_agent_id"),
            "sender_type": "agent",
            "content": content,
            "confidence": payload.get("confidence", {}),
            "metadata": {
                "event_type": event_type,
                "event_id": event.get("id"),
            },
        }
    ).execute()


def _format_event_for_feed(event_type: str, payload: dict) -> str | None:
    """Format an event into a human-readable feed message."""
    match event_type:
        case "finding_published":
            name = payload.get("entity_name", "a finding")
            etype = payload.get("entity_type", "entity")
            conf = payload.get("confidence", {}).get("score", "?")
            return f"Published new {etype}: \"{name}\" (confidence: {conf})"

        case "relationship_created":
            rel_type = payload.get("relationship_type", "RELATES_TO")
            target = payload.get("target_entity_name", "an entity")
            agent_name = payload.get("reasoning", "")[:100]
            return f"{rel_type} \"{target}\": {agent_name}"

        case "confidence_updated":
            name = payload.get("entity_name", "an entity")
            old = payload.get("old_score", "?")
            new = payload.get("new_score", "?")
            return f"Updated confidence on \"{name}\": {old} → {new}"

        case _:
            return None


def register_default_handlers() -> None:
    """Register the default inter-agent event handlers on the global event bus."""
    event_bus.subscribe("finding_published", handle_finding_published)
    # Post all event types (except disagreement, which has its own feed logic)
    event_bus.subscribe("finding_published", post_event_to_feed)
    event_bus.subscribe("relationship_created", post_event_to_feed)
    event_bus.subscribe("confidence_updated", post_event_to_feed)
