"""Shared knowledge graph operations — Doctrine component.

Provides higher-level operations on the shared knowledge graph that agents use
to publish findings, create relationships, and query the graph with confidence
scoring. This module wraps the Supabase-backed shared_entities and
shared_relationships tables with Doctrine-aware logic.
"""

from __future__ import annotations

from uuid import UUID

from supabase import create_client

from api.config import settings
from api.models.agent import ConfidenceScore


def _supabase():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


async def publish_entity(
    workspace_id: UUID,
    agent_id: UUID,
    name: str,
    entity_type: str,
    properties: dict,
    confidence: ConfidenceScore,
) -> dict:
    """Publish a confidence-scored entity to the shared workspace graph.

    The entity is created with the agent as author and the confidence score
    attached. Status is set to 'published' (agents publish through the
    approval queue, so by the time this is called the action is approved).
    """
    sb = _supabase()
    data = {
        "workspace_id": str(workspace_id),
        "author_agent_id": str(agent_id),
        "name": name,
        "entity_type": entity_type,
        "properties": {
            **properties,
            "confidence_reasoning": confidence.reasoning,
        },
        "confidence_score": confidence.score,
        "status": "published",
    }
    result = sb.table("shared_entities").insert(data).execute()
    return result.data[0] if result.data else {}


async def create_relationship(
    workspace_id: UUID,
    agent_id: UUID,
    source_entity_id: UUID,
    target_entity_id: UUID,
    relationship_type: str,
    confidence: ConfidenceScore,
    metadata: dict | None = None,
) -> dict:
    """Create a confidence-scored relationship between two entities."""
    sb = _supabase()
    data = {
        "workspace_id": str(workspace_id),
        "source_entity_id": str(source_entity_id),
        "target_entity_id": str(target_entity_id),
        "relationship_type": relationship_type,
        "confidence_score": confidence.score,
        "metadata": {
            **(metadata or {}),
            "confidence_reasoning": confidence.reasoning,
        },
        "created_by_agent": str(agent_id),
    }
    result = sb.table("shared_relationships").insert(data).execute()
    return result.data[0] if result.data else {}


async def query_entities(
    workspace_id: UUID,
    entity_type: str | None = None,
    min_confidence: float = 0.0,
    status: str | None = "published",
    limit: int = 50,
) -> list[dict]:
    """Query entities from the shared graph with optional filters."""
    sb = _supabase()
    query = (
        sb.table("shared_entities")
        .select("*")
        .eq("workspace_id", str(workspace_id))
        .gte("confidence_score", min_confidence)
    )
    if entity_type:
        query = query.eq("entity_type", entity_type)
    if status:
        query = query.eq("status", status)
    result = query.order("confidence_score", desc=True).limit(limit).execute()
    return result.data


async def query_relationships(
    workspace_id: UUID,
    entity_id: UUID | None = None,
    relationship_type: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """Query relationships from the shared graph."""
    sb = _supabase()
    query = (
        sb.table("shared_relationships")
        .select("*")
        .eq("workspace_id", str(workspace_id))
    )
    if entity_id:
        eid = str(entity_id)
        query = query.or_(f"source_entity_id.eq.{eid},target_entity_id.eq.{eid}")
    if relationship_type:
        query = query.eq("relationship_type", relationship_type)
    result = query.order("created_at", desc=True).limit(limit).execute()
    return result.data


async def get_entity_with_relationships(entity_id: UUID) -> dict:
    """Get an entity with all its relationships and connected entities."""
    sb = _supabase()
    entity_result = (
        sb.table("shared_entities").select("*").eq("id", str(entity_id)).execute()
    )
    if not entity_result.data:
        return {}

    entity = entity_result.data[0]
    eid = str(entity_id)

    # Get all relationships involving this entity
    rels = (
        sb.table("shared_relationships")
        .select("*")
        .or_(f"source_entity_id.eq.{eid},target_entity_id.eq.{eid}")
        .execute()
    )

    # Collect connected entity IDs
    connected_ids = set()
    for rel in rels.data:
        connected_ids.add(rel["source_entity_id"])
        connected_ids.add(rel["target_entity_id"])
    connected_ids.discard(eid)

    # Fetch connected entities
    connected = []
    if connected_ids:
        connected_result = (
            sb.table("shared_entities")
            .select("*")
            .in_("id", list(connected_ids))
            .execute()
        )
        connected = connected_result.data

    return {
        "entity": entity,
        "relationships": rels.data,
        "connected_entities": connected,
    }


async def update_entity_confidence(
    entity_id: UUID,
    confidence: ConfidenceScore,
) -> dict:
    """Update the confidence score of an existing entity."""
    sb = _supabase()
    result = (
        sb.table("shared_entities")
        .update(
            {
                "confidence_score": confidence.score,
                "properties": {
                    "confidence_reasoning": confidence.reasoning,
                },
            }
        )
        .eq("id", str(entity_id))
        .execute()
    )
    return result.data[0] if result.data else {}


async def mark_disputed(entity_id: UUID) -> dict:
    """Mark an entity as disputed (when agents disagree)."""
    sb = _supabase()
    result = (
        sb.table("shared_entities")
        .update({"status": "disputed"})
        .eq("id", str(entity_id))
        .execute()
    )
    return result.data[0] if result.data else {}
