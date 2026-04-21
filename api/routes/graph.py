"""Shared knowledge graph endpoints — entities and relationships.

Every endpoint requires workspace membership.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from api.auth import get_current_user, require_workspace_member
from api.db import get_sb
from api.models.workspace import (
    Entity,
    EntityCreate,
    EntityUpdate,
    Relationship,
    RelationshipCreate,
)

router = APIRouter(prefix="/graph", tags=["graph"])


def _require_entity_access(sb, entity_id: str, user_id: str) -> dict:
    """Fetch entity and verify caller is a member of its workspace."""
    result = sb.table("shared_entities").select("*").eq("id", entity_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Entity not found")
    require_workspace_member(sb, result.data[0]["workspace_id"], user_id)
    return result.data[0]


def _require_relationship_access(sb, relationship_id: str, user_id: str) -> dict:
    """Fetch relationship and verify caller is a member of its workspace."""
    result = sb.table("shared_relationships").select("*").eq("id", relationship_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Relationship not found")
    require_workspace_member(sb, result.data[0]["workspace_id"], user_id)
    return result.data[0]


# ---------------------------------------------------------------------------
# Entities
# ---------------------------------------------------------------------------


@router.post(
    "/workspaces/{workspace_id}/entities",
    response_model=Entity,
    status_code=201,
)
async def create_entity(
    workspace_id: UUID,
    body: EntityCreate,
    agent_id: UUID | None = None,
    current_user: str = Depends(get_current_user),
):
    """Create a shared entity in a workspace. Member only."""
    sb = get_sb()
    require_workspace_member(sb, str(workspace_id), current_user)
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
    current_user: str = Depends(get_current_user),
):
    """Query entities in a workspace. Member only."""
    sb = get_sb()
    require_workspace_member(sb, str(workspace_id), current_user)
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
async def get_entity(
    entity_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Get a single entity by ID. Workspace member only."""
    sb = get_sb()
    return _require_entity_access(sb, str(entity_id), current_user)


@router.patch("/entities/{entity_id}", response_model=Entity)
async def update_entity(
    entity_id: UUID,
    body: EntityUpdate,
    current_user: str = Depends(get_current_user),
):
    """Update an entity. Workspace member only."""
    sb = get_sb()
    _require_entity_access(sb, str(entity_id), current_user)
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
async def delete_entity(
    entity_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Delete an entity (cascades to relationships). Workspace member only."""
    sb = get_sb()
    _require_entity_access(sb, str(entity_id), current_user)
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
async def create_relationship(
    workspace_id: UUID,
    body: RelationshipCreate,
    current_user: str = Depends(get_current_user),
):
    """Create a relationship between two entities. Workspace member only."""
    sb = get_sb()
    require_workspace_member(sb, str(workspace_id), current_user)
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
    current_user: str = Depends(get_current_user),
):
    """Query relationships in a workspace. Member only."""
    sb = get_sb()
    require_workspace_member(sb, str(workspace_id), current_user)
    query = (
        sb.table("shared_relationships")
        .select("*")
        .eq("workspace_id", str(workspace_id))
    )
    if relationship_type:
        query = query.eq("relationship_type", relationship_type)
    if entity_id:
        eid = str(entity_id)
        query = query.or_(f"source_entity_id.eq.{eid},target_entity_id.eq.{eid}")
    result = query.order("created_at", desc=True).limit(limit).execute()
    return result.data


@router.delete("/relationships/{relationship_id}")
async def delete_relationship(
    relationship_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Delete a relationship. Workspace member only."""
    sb = get_sb()
    _require_relationship_access(sb, str(relationship_id), current_user)
    result = (
        sb.table("shared_relationships")
        .delete()
        .eq("id", str(relationship_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Relationship not found")
    return {"status": "deleted"}
