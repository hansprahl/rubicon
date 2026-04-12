"""Milestone CRUD and agent task endpoints for workspace battle tracking."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from supabase import create_client

from api.config import settings
from api.models.milestone import (
    AgentTask,
    AgentTaskCreate,
    AgentTaskUpdate,
    Milestone,
    MilestoneCreate,
    MilestoneUpdate,
)

router = APIRouter(prefix="/milestones", tags=["milestones"])


def _supabase():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# ---------------------------------------------------------------------------
# Milestones
# ---------------------------------------------------------------------------


@router.post(
    "/workspaces/{workspace_id}",
    response_model=Milestone,
    status_code=201,
)
async def create_milestone(workspace_id: UUID, body: MilestoneCreate):
    sb = _supabase()
    data = body.model_dump(mode="json")
    data["workspace_id"] = str(workspace_id)
    result = sb.table("milestones").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create milestone")
    return result.data[0]


@router.get(
    "/workspaces/{workspace_id}",
    response_model=list[Milestone],
)
async def list_milestones(
    workspace_id: UUID,
    status: str | None = None,
    limit: int = 50,
):
    sb = _supabase()
    query = (
        sb.table("milestones")
        .select("*")
        .eq("workspace_id", str(workspace_id))
    )
    if status:
        query = query.eq("status", status)
    result = query.order("due_date", desc=False).limit(limit).execute()
    return result.data


@router.get("/{milestone_id}", response_model=Milestone)
async def get_milestone(milestone_id: UUID):
    sb = _supabase()
    result = (
        sb.table("milestones").select("*").eq("id", str(milestone_id)).execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Milestone not found")
    return result.data[0]


@router.patch("/{milestone_id}", response_model=Milestone)
async def update_milestone(milestone_id: UUID, body: MilestoneUpdate):
    sb = _supabase()
    data = body.model_dump(exclude_none=True, mode="json")
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = (
        sb.table("milestones")
        .update(data)
        .eq("id", str(milestone_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Milestone not found")
    return result.data[0]


@router.delete("/{milestone_id}")
async def delete_milestone(milestone_id: UUID):
    sb = _supabase()
    result = (
        sb.table("milestones").delete().eq("id", str(milestone_id)).execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Milestone not found")
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Agent Tasks
# ---------------------------------------------------------------------------


@router.post(
    "/tasks/{agent_id}",
    response_model=AgentTask,
    status_code=201,
)
async def create_task(agent_id: UUID, body: AgentTaskCreate):
    sb = _supabase()
    data = body.model_dump(mode="json")
    data["agent_id"] = str(agent_id)
    result = sb.table("agent_tasks").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create task")
    return result.data[0]


@router.get(
    "/tasks/workspace/{workspace_id}",
    response_model=list[AgentTask],
)
async def list_workspace_tasks(
    workspace_id: UUID,
    status: str | None = None,
    limit: int = 100,
):
    sb = _supabase()
    query = (
        sb.table("agent_tasks")
        .select("*")
        .eq("workspace_id", str(workspace_id))
    )
    if status:
        query = query.eq("status", status)
    result = query.order("created_at", desc=True).limit(limit).execute()
    return result.data


@router.patch("/tasks/{task_id}", response_model=AgentTask)
async def update_task(task_id: UUID, body: AgentTaskUpdate):
    sb = _supabase()
    data = body.model_dump(exclude_none=True, mode="json")
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = (
        sb.table("agent_tasks")
        .update(data)
        .eq("id", str(task_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Task not found")
    return result.data[0]


