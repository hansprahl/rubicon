"""Shared knowledge graph endpoints — entities and relationships."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException

from api.db import get_sb
from api.models.workspace import (
    Entity,
    EntityCreate,
    EntityUpdate,
    Relationship,
    RelationshipCreate,
)

router = APIRouter(prefix="/graph", tags=["graph"])


# ---------------------------------------------------------------------------
# Entities
# ---------------------------------------------------------------------------


@router.post(
    "/workspaces/{workspace_id}/entities",
    response_model=Entity,
    status_code=201,
)
async def create_entity(
    workspace_id: UUID, body: EntityCreate, agent_id: UUID | None = None
):
    """Create a shared entity in a workspace."""
    sb = get_sb()
    data = body.model_dump()
    data["workspace_id"] = str(workspace_id)
    if agent_id:
        data["author_agent_id"] = str(agent_id)
    result = sb.table("shared_entities").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create entity")
    return result.data[0]


@router.get(
    "/workspaces/{workspace_id}/entities", response_model=list[Entity]
)
async def list_entities(
    workspace_id: UUID,
    entity_type: str | None = None,
    status: str | None = None,
    min_confidence: float | None = None,
    limit: int = 100,
):
    """Query entities in a workspace with optional filters."""
    sb = get_sb()
    query = (
        sb.table("shared_entities")
        .select("*")
        .eq("workspace_id", str(workspace_id))
    )
    if entity_type:
        query = query.eq("entity_type", entity_type)
    if status:
        query = query.eq("status", status)
    if min_confidence is not None:
        query = query.gte("confidence_score", min_confidence)
    result = query.order("created_at", desc=True).limit(limit).execute()
    return result.data


@router.get("/entities/{entity_id}", response_model=Entity)
async def get_entity(entity_id: UUID):
    """Get a single entity by ID."""
    sb = get_sb()
    result = (
        sb.table("shared_entities").select("*").eq("id", str(entity_id)).execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Entity not found")
    return result.data[0]


@router.patch("/entities/{entity_id}", response_model=Entity)
async def update_entity(entity_id: UUID, body: EntityUpdate):
    """Update an entity."""
    sb = get_sb()
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = (
        sb.table("shared_entities")
        .update(data)
        .eq("id", str(entity_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Entity not found")
    return result.data[0]


@router.delete("/entities/{entity_id}")
async def delete_entity(entity_id: UUID):
    """Delete an entity (cascades to relationships)."""
    sb = get_sb()
    result = (
        sb.table("shared_entities").delete().eq("id", str(entity_id)).execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Entity not found")
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Relationships
# ---------------------------------------------------------------------------


@router.post(
    "/workspaces/{workspace_id}/relationships",
    response_model=Relationship,
    status_code=201,
)
async def create_relationship(workspace_id: UUID, body: RelationshipCreate):
    """Create a relationship between two entities."""
    sb = get_sb()
    data = body.model_dump(mode="json")
    data["workspace_id"] = str(workspace_id)
    result = sb.table("shared_relationships").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create relationship")
    return result.data[0]


@router.get(
    "/workspaces/{workspace_id}/relationships",
    response_model=list[Relationship],
)
async def list_relationships(
    workspace_id: UUID,
    relationship_type: str | None = None,
    entity_id: UUID | None = None,
    limit: int = 100,
):
    """Query relationships in a workspace."""
    sb = get_sb()
    query = (
        sb.table("shared_relationships")
        .select("*")
        .eq("workspace_id", str(workspace_id))
    )
    if relationship_type:
        query = query.eq("relationship_type", relationship_type)
    if entity_id:
        eid = str(entity_id)
        # Filter by either source or target — use or filter
        query = query.or_(f"source_entity_id.eq.{eid},target_entity_id.eq.{eid}")
    result = query.order("created_at", desc=True).limit(limit).execute()
    return result.data


@router.delete("/relationships/{relationship_id}")
async def delete_relationship(relationship_id: UUID):
    """Delete a relationship."""
    sb = get_sb()
    result = (
        sb.table("shared_relationships")
        .delete()
        .eq("id", str(relationship_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Relationship not found")
    return {"status": "deleted"}
