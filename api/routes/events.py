"""Event bus API endpoints — event history, subscriptions, and disagreements."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from supabase import create_client

from api.config import settings
from api.doctrine.events import event_bus, get_event, get_events
from api.models.event import (
    AgentEvent,
    Disagreement,
    EventCreate,
    EventSubscription,
    EventSubscriptionCreate,
)
from api.runtime.inter_agent import detect_disagreements

router = APIRouter(prefix="/events", tags=["events"])


def _supabase():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# ---------------------------------------------------------------------------
# Event history
# ---------------------------------------------------------------------------


@router.get("/workspace/{workspace_id}", response_model=list[AgentEvent])
async def list_events(
    workspace_id: UUID,
    event_type: str | None = None,
    source_agent_id: UUID | None = None,
    limit: int = 50,
    offset: int = 0,
):
    """List events for a workspace with optional filters."""
    events = await get_events(
        workspace_id=workspace_id,
        event_type=event_type,
        source_agent_id=source_agent_id,
        limit=limit,
        offset=offset,
    )
    return events


@router.get("/{event_id}", response_model=AgentEvent)
async def get_event_by_id(event_id: UUID):
    """Get a single event by ID."""
    event = await get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


# ---------------------------------------------------------------------------
# Publish events (used by agents or manually)
# ---------------------------------------------------------------------------


@router.post(
    "/workspace/{workspace_id}/publish",
    response_model=AgentEvent,
    status_code=201,
)
async def publish_event(
    workspace_id: UUID,
    agent_id: UUID,
    body: EventCreate,
):
    """Publish an event to the workspace event bus.

    This persists the event and triggers all registered handlers (including
    inter-agent evaluation for finding_published events).
    """
    event = await event_bus.publish(
        workspace_id=workspace_id,
        source_agent_id=agent_id,
        event_type=body.event_type,
        payload=body.payload,
    )
    return event


# ---------------------------------------------------------------------------
# Subscriptions (persistent — stored in DB)
# ---------------------------------------------------------------------------


@router.get(
    "/workspace/{workspace_id}/subscriptions",
    response_model=list[EventSubscription],
)
async def list_subscriptions(workspace_id: UUID, agent_id: UUID | None = None):
    """List event subscriptions for a workspace."""
    sb = _supabase()
    query = (
        sb.table("event_subscriptions")
        .select("*")
        .eq("workspace_id", str(workspace_id))
        .eq("active", True)
    )
    if agent_id:
        query = query.eq("agent_id", str(agent_id))
    result = query.order("created_at", desc=True).execute()
    return result.data


@router.post(
    "/workspace/{workspace_id}/subscriptions",
    response_model=EventSubscription,
    status_code=201,
)
async def create_subscription(
    workspace_id: UUID,
    agent_id: UUID,
    body: EventSubscriptionCreate,
):
    """Subscribe an agent to an event type in a workspace."""
    sb = _supabase()

    # Check for existing subscription
    existing = (
        sb.table("event_subscriptions")
        .select("id")
        .eq("workspace_id", str(workspace_id))
        .eq("agent_id", str(agent_id))
        .eq("event_type", body.event_type)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="Subscription already exists")

    result = sb.table("event_subscriptions").insert(
        {
            "workspace_id": str(workspace_id),
            "agent_id": str(agent_id),
            "event_type": body.event_type,
            "active": True,
        }
    ).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create subscription")
    return result.data[0]


@router.delete("/subscriptions/{subscription_id}")
async def delete_subscription(subscription_id: UUID):
    """Deactivate an event subscription."""
    sb = _supabase()
    result = (
        sb.table("event_subscriptions")
        .update({"active": False})
        .eq("id", str(subscription_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return {"status": "deactivated"}


# ---------------------------------------------------------------------------
# Disagreements
# ---------------------------------------------------------------------------


@router.get(
    "/workspace/{workspace_id}/disagreements",
    response_model=list[Disagreement],
)
async def list_disagreements(workspace_id: UUID):
    """List all disputed entities in a workspace with contradiction details."""
    sb = _supabase()

    # Get all disputed entities in this workspace
    disputed = (
        sb.table("shared_entities")
        .select("*")
        .eq("workspace_id", str(workspace_id))
        .eq("status", "disputed")
        .order("updated_at", desc=True)
        .execute()
    )
    if not disputed.data:
        return []

    disagreements = []
    for entity in disputed.data:
        eid = entity["id"]
        # Get contradictions
        contradictions = (
            sb.table("shared_relationships")
            .select("*")
            .eq("target_entity_id", eid)
            .eq("relationship_type", "CONTRADICTS")
            .execute()
        )
        supports = (
            sb.table("shared_relationships")
            .select("*")
            .eq("target_entity_id", eid)
            .eq("relationship_type", "SUPPORTS")
            .execute()
        )
        for c in contradictions.data or []:
            disagreements.append(
                Disagreement(
                    entity_id=eid,
                    entity_name=entity.get("name", "Unknown"),
                    contradicting_agent_id=c.get("created_by_agent"),
                    contradiction_reasoning=c.get("metadata", {}).get(
                        "reasoning", ""
                    ),
                    contradiction_confidence=c.get("confidence_score", 0),
                    support_count=len(supports.data) if supports.data else 0,
                    contradict_count=len(contradictions.data)
                    if contradictions.data
                    else 0,
                )
            )
    return disagreements


@router.post("/workspace/{workspace_id}/check-disagreements/{entity_id}")
async def check_disagreements(workspace_id: UUID, entity_id: UUID):
    """Manually trigger disagreement detection for an entity."""
    result = await detect_disagreements(workspace_id, entity_id)
    return {
        "entity_id": str(entity_id),
        "disagreements_found": len(result),
        "details": result,
    }
