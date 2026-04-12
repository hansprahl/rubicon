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
