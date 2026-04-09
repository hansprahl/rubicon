"""Workspace CRUD, membership, invitations, and feed endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from supabase import create_client

from api.config import settings
from api.models.workspace import (
    FeedMessage,
    FeedMessageCreate,
    Workspace,
    WorkspaceCreate,
    WorkspaceInvite,
    WorkspaceMember,
    WorkspaceUpdate,
    WorkspaceWithMembers,
)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


def _supabase():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# ---------------------------------------------------------------------------
# Workspace CRUD
# ---------------------------------------------------------------------------


@router.post("/", response_model=Workspace, status_code=201)
async def create_workspace(user_id: UUID, body: WorkspaceCreate):
    """Create a workspace and add the creator as owner."""
    sb = _supabase()
    data = body.model_dump()
    data["created_by"] = str(user_id)
    result = sb.table("workspaces").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create workspace")
    workspace = result.data[0]

    # Add creator as owner
    sb.table("workspace_members").insert(
        {
            "workspace_id": workspace["id"],
            "user_id": str(user_id),
            "role": "owner",
        }
    ).execute()

    return workspace


@router.get("/user/{user_id}", response_model=list[WorkspaceWithMembers])
async def list_workspaces(user_id: UUID):
    """List all workspaces the user is a member of."""
    sb = _supabase()
    # Get workspace IDs for this user
    memberships = (
        sb.table("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", str(user_id))
        .execute()
    )
    if not memberships.data:
        return []

    ws_roles = {m["workspace_id"]: m["role"] for m in memberships.data}
    ws_ids = list(ws_roles.keys())

    # Fetch workspaces
    workspaces = (
        sb.table("workspaces")
        .select("*")
        .in_("id", ws_ids)
        .order("updated_at", desc=True)
        .execute()
    )

    # Count members per workspace
    result = []
    for ws in workspaces.data:
        count_result = (
            sb.table("workspace_members")
            .select("user_id", count="exact")
            .eq("workspace_id", ws["id"])
            .execute()
        )
        result.append(
            WorkspaceWithMembers(
                **ws,
                member_count=count_result.count or 0,
                role=ws_roles.get(ws["id"]),
            )
        )

    return result


@router.get("/{workspace_id}", response_model=WorkspaceWithMembers)
async def get_workspace(workspace_id: UUID, user_id: UUID | None = None):
    """Get workspace details."""
    sb = _supabase()
    result = (
        sb.table("workspaces").select("*").eq("id", str(workspace_id)).execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Workspace not found")

    ws = result.data[0]
    count_result = (
        sb.table("workspace_members")
        .select("user_id", count="exact")
        .eq("workspace_id", str(workspace_id))
        .execute()
    )

    role = None
    if user_id:
        membership = (
            sb.table("workspace_members")
            .select("role")
            .eq("workspace_id", str(workspace_id))
            .eq("user_id", str(user_id))
            .execute()
        )
        if membership.data:
            role = membership.data[0]["role"]

    return WorkspaceWithMembers(
        **ws,
        member_count=count_result.count or 0,
        role=role,
    )


@router.patch("/{workspace_id}", response_model=Workspace)
async def update_workspace(workspace_id: UUID, body: WorkspaceUpdate):
    """Update workspace details."""
    sb = _supabase()
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = (
        sb.table("workspaces")
        .update(data)
        .eq("id", str(workspace_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return result.data[0]


# ---------------------------------------------------------------------------
# Membership
# ---------------------------------------------------------------------------


@router.get("/{workspace_id}/members", response_model=list[WorkspaceMember])
async def list_members(workspace_id: UUID):
    """List members of a workspace."""
    sb = _supabase()
    result = (
        sb.table("workspace_members")
        .select("*, users(display_name)")
        .eq("workspace_id", str(workspace_id))
        .order("joined_at")
        .execute()
    )
    members = []
    for row in result.data:
        user_info = row.pop("users", None) or {}
        members.append(
            WorkspaceMember(**row, display_name=user_info.get("display_name"))
        )
    return members


@router.post("/{workspace_id}/join", response_model=WorkspaceMember)
async def join_workspace(workspace_id: UUID, user_id: UUID):
    """Join a workspace as a member."""
    sb = _supabase()
    # Check workspace exists
    ws = sb.table("workspaces").select("id").eq("id", str(workspace_id)).execute()
    if not ws.data:
        raise HTTPException(status_code=404, detail="Workspace not found")

    # Check not already a member
    existing = (
        sb.table("workspace_members")
        .select("user_id")
        .eq("workspace_id", str(workspace_id))
        .eq("user_id", str(user_id))
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="Already a member")

    result = sb.table("workspace_members").insert(
        {
            "workspace_id": str(workspace_id),
            "user_id": str(user_id),
            "role": "member",
        }
    ).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to join workspace")
    return WorkspaceMember(**result.data[0])


@router.delete("/{workspace_id}/leave")
async def leave_workspace(workspace_id: UUID, user_id: UUID):
    """Leave a workspace."""
    sb = _supabase()
    result = (
        sb.table("workspace_members")
        .delete()
        .eq("workspace_id", str(workspace_id))
        .eq("user_id", str(user_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Membership not found")
    return {"status": "left"}


@router.post("/{workspace_id}/invite", response_model=WorkspaceMember)
async def invite_member(workspace_id: UUID, body: WorkspaceInvite):
    """Invite a user to a workspace."""
    sb = _supabase()
    # Check workspace exists
    ws = sb.table("workspaces").select("id").eq("id", str(workspace_id)).execute()
    if not ws.data:
        raise HTTPException(status_code=404, detail="Workspace not found")

    # Check not already a member
    existing = (
        sb.table("workspace_members")
        .select("user_id")
        .eq("workspace_id", str(workspace_id))
        .eq("user_id", str(body.user_id))
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="User is already a member")

    result = sb.table("workspace_members").insert(
        {
            "workspace_id": str(workspace_id),
            "user_id": str(body.user_id),
            "role": body.role,
        }
    ).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to invite member")
    return WorkspaceMember(**result.data[0])


# ---------------------------------------------------------------------------
# Feed (workspace messages)
# ---------------------------------------------------------------------------


@router.get("/{workspace_id}/feed", response_model=list[FeedMessage])
async def get_feed(workspace_id: UUID, limit: int = 50, offset: int = 0):
    """Get workspace feed messages (chronological)."""
    sb = _supabase()
    result = (
        sb.table("messages")
        .select("*, users(display_name), agent_profiles(agent_name)")
        .eq("workspace_id", str(workspace_id))
        .order("created_at", desc=False)
        .range(offset, offset + limit - 1)
        .execute()
    )
    messages = []
    for row in result.data:
        user_info = row.pop("users", None) or {}
        agent_info = row.pop("agent_profiles", None) or {}
        messages.append(
            FeedMessage(
                **row,
                display_name=user_info.get("display_name"),
                agent_name=agent_info.get("agent_name"),
            )
        )
    return messages


@router.post("/{workspace_id}/feed", response_model=FeedMessage, status_code=201)
async def post_to_feed(
    workspace_id: UUID, user_id: UUID, body: FeedMessageCreate
):
    """Post a message to the workspace feed (human sender)."""
    sb = _supabase()
    data = {
        "workspace_id": str(workspace_id),
        "user_id": str(user_id),
        "sender_type": "human",
        "content": body.content,
        "confidence": {},
        "metadata": {},
    }
    if body.confidence_score is not None:
        data["confidence"] = {
            "score": body.confidence_score,
            "reasoning": body.confidence_reasoning or "",
        }
    result = sb.table("messages").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to post message")

    # War room: trigger all workspace member agents to respond
    try:
        members = (
            sb.table("workspace_members")
            .select("user_id")
            .eq("workspace_id", str(workspace_id))
            .execute()
        )
        ws_result = sb.table("workspaces").select("name").eq("id", str(workspace_id)).execute()
        ws_name = ws_result.data[0]["name"] if ws_result.data else "workspace"

        for member in (members.data or []):
            if member["user_id"] == str(user_id):
                continue  # Don't trigger the poster's own agent
            agent_result = (
                sb.table("agent_profiles")
                .select("id")
                .eq("user_id", member["user_id"])
                .execute()
            )
            if agent_result.data:
                sb.table("agent_tasks").insert({
                    "agent_id": agent_result.data[0]["id"],
                    "workspace_id": str(workspace_id),
                    "title": f"Respond in {ws_name}",
                    "description": f"A human posted in workspace '{ws_name}':\n\n{body.content}\n\nRespond with your perspective as a digital twin. Use your workspace tools to post your response to the feed.",
                    "status": "queued",
                    "priority": 10,
                }).execute()
    except Exception:
        pass  # Agent triggering is best-effort

    return FeedMessage(**result.data[0])
