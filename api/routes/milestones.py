"""Milestone CRUD and agent task endpoints for workspace battle tracking."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from api.auth import (
    get_current_user,
    require_agent_owner,
    require_workspace_member,
)
from api.db import get_sb
from api.models.milestone import (
    AgentTask,
    AgentTaskCreate,
    AgentTaskUpdate,
    Milestone,
    MilestoneCreate,
    MilestoneUpdate,
)

router = APIRouter(prefix="/milestones", tags=["milestones"])


def _require_milestone_access(sb, milestone_id: str, user_id: str) -> dict:
    """Fetch milestone and verify caller is a member of its workspace."""
    result = sb.table("milestones").select("*").eq("id", milestone_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Milestone not found")
    require_workspace_member(sb, result.data[0]["workspace_id"], user_id)
    return result.data[0]


def _require_task_access(sb, task_id: str, user_id: str) -> dict:
    """Fetch agent task and verify caller owns the agent OR is a workspace member."""
    result = sb.table("agent_tasks").select("*").eq("id", task_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Task not found")
    task = result.data[0]
    # Owner of the agent can always act. Otherwise must be a workspace member.
    agent_result = (
        sb.table("agent_profiles")
        .select("user_id")
        .eq("id", task["agent_id"])
        .execute()
    )
    if agent_result.data and agent_result.data[0]["user_id"] == user_id:
        return task
    if task.get("workspace_id"):
        require_workspace_member(sb, task["workspace_id"], user_id)
        return task
    raise HTTPException(status_code=403, detail="Not your task")


# ---------------------------------------------------------------------------
# Milestones
# ---------------------------------------------------------------------------


@router.post(
    "/workspaces/{workspace_id}",
    response_model=Milestone,
    status_code=201,
)
async def create_milestone(
    workspace_id: UUID,
    body: MilestoneCreate,
    current_user: str = Depends(get_current_user),
):
    sb = get_sb()
    require_workspace_member(sb, str(workspace_id), current_user)
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
    current_user: str = Depends(get_current_user),
):
    sb = get_sb()
    require_workspace_member(sb, str(workspace_id), current_user)
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
async def get_milestone(
    milestone_id: UUID,
    current_user: str = Depends(get_current_user),
):
    sb = get_sb()
    return _require_milestone_access(sb, str(milestone_id), current_user)


@router.patch("/{milestone_id}", response_model=Milestone)
async def update_milestone(
    milestone_id: UUID,
    body: MilestoneUpdate,
    current_user: str = Depends(get_current_user),
):
    sb = get_sb()
    _require_milestone_access(sb, str(milestone_id), current_user)
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
async def delete_milestone(
    milestone_id: UUID,
    current_user: str = Depends(get_current_user),
):
    sb = get_sb()
    _require_milestone_access(sb, str(milestone_id), current_user)
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
async def create_task(
    agent_id: UUID,
    body: AgentTaskCreate,
    current_user: str = Depends(get_current_user),
):
    """Create a task for an agent. Caller must own the agent."""
    sb = get_sb()
    require_agent_owner(sb, str(agent_id), current_user)
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
    current_user: str = Depends(get_current_user),
):
    sb = get_sb()
    require_workspace_member(sb, str(workspace_id), current_user)
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
async def update_task(
    task_id: UUID,
    body: AgentTaskUpdate,
    current_user: str = Depends(get_current_user),
):
    """Update a task. Agent owner OR workspace member may update."""
    sb = get_sb()
    _require_task_access(sb, str(task_id), current_user)
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
