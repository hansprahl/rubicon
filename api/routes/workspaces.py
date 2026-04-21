"""Workspace CRUD, membership, invitations, and feed endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from api.auth import (
    assert_is_caller,
    get_current_user,
    get_workspace_role,
    require_workspace_member,
    require_workspace_owner,
)
from api.db import get_sb
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


# ---------------------------------------------------------------------------
# User directory (for mentions / collaboration)
# ---------------------------------------------------------------------------


@router.get("/directory/users")
async def list_approved_users(current_user: str = Depends(get_current_user)):
    """List all approved users with their agent info. Used for @ mentions."""
    sb = get_sb()
    users = (
        sb.table("users")
        .select("id, display_name, email, avatar_url")
        .eq("status", "approved")
        .order("display_name")
        .execute()
    )
    agents = sb.table("agent_profiles").select("user_id, agent_name").execute()
    agent_map = {a["user_id"]: a["agent_name"] for a in (agents.data or [])}

    result = []
    for u in users.data or []:
        result.append({
            "id": u["id"],
            "display_name": u["display_name"],
            "email": u["email"],
            "avatar_url": u.get("avatar_url"),
            "agent_name": agent_map.get(u["id"]),
        })
    return result


# ---------------------------------------------------------------------------
# Workspace CRUD
# ---------------------------------------------------------------------------


@router.post("/", response_model=Workspace, status_code=201)
async def create_workspace(
    user_id: UUID,
    body: WorkspaceCreate,
    current_user: str = Depends(get_current_user),
):
    """Create a workspace; creator becomes owner."""
    assert_is_caller(user_id, current_user)
    sb = get_sb()
    data = body.model_dump()
    data["created_by"] = current_user
    result = sb.table("workspaces").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create workspace")
    workspace = result.data[0]

    sb.table("workspace_members").insert(
        {
            "workspace_id": workspace["id"],
            "user_id": current_user,
            "role": "owner",
        }
    ).execute()

    return workspace


@router.get("/user/{user_id}", response_model=list[WorkspaceWithMembers])
async def list_workspaces(
    user_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """List all workspaces the caller is a member of."""
    assert_is_caller(user_id, current_user)
    sb = get_sb()
    memberships = (
        sb.table("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", current_user)
        .execute()
    )
    if not memberships.data:
        return []

    ws_roles = {m["workspace_id"]: m["role"] for m in memberships.data}
    ws_ids = list(ws_roles.keys())

    workspaces = (
        sb.table("workspaces")
        .select("*")
        .in_("id", ws_ids)
        .order("updated_at", desc=True)
        .execute()
    )

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
async def get_workspace(
    workspace_id: UUID,
    user_id: UUID | None = None,
    current_user: str = Depends(get_current_user),
):
    """Get workspace details. Caller must be a member."""
    if user_id is not None:
        assert_is_caller(user_id, current_user)
    sb = get_sb()
    require_workspace_member(sb, str(workspace_id), current_user)

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

    role = get_workspace_role(sb, str(workspace_id), current_user)

    return WorkspaceWithMembers(
        **ws,
        member_count=count_result.count or 0,
        role=role,
    )


@router.patch("/{workspace_id}", response_model=Workspace)
async def update_workspace(
    workspace_id: UUID,
    body: WorkspaceUpdate,
    current_user: str = Depends(get_current_user),
):
    """Update workspace details. Owner only."""
    sb = get_sb()
    require_workspace_owner(sb, str(workspace_id), current_user)
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
async def list_members(
    workspace_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """List members of a workspace. Member only."""
    sb = get_sb()
    require_workspace_member(sb, str(workspace_id), current_user)
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
async def join_workspace(
    workspace_id: UUID,
    user_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Join a workspace. Caller must join as themselves."""
    assert_is_caller(user_id, current_user)
    sb = get_sb()
    ws = sb.table("workspaces").select("id").eq("id", str(workspace_id)).execute()
    if not ws.data:
        raise HTTPException(status_code=404, detail="Workspace not found")

    existing = (
        sb.table("workspace_members")
        .select("user_id")
        .eq("workspace_id", str(workspace_id))
        .eq("user_id", current_user)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="Already a member")

    result = sb.table("workspace_members").insert(
        {
            "workspace_id": str(workspace_id),
            "user_id": current_user,
            "role": "member",
        }
    ).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to join workspace")
    return WorkspaceMember(**result.data[0])


@router.delete("/{workspace_id}")
async def delete_workspace(
    workspace_id: UUID,
    user_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Delete a workspace and all its data. Owner only."""
    assert_is_caller(user_id, current_user)
    sb = get_sb()
    require_workspace_owner(sb, str(workspace_id), current_user)

    sb.table("messages").delete().eq("workspace_id", str(workspace_id)).execute()
    sb.table("shared_relationships").delete().eq("workspace_id", str(workspace_id)).execute()
    sb.table("shared_entities").delete().eq("workspace_id", str(workspace_id)).execute()
    sb.table("milestones").delete().eq("workspace_id", str(workspace_id)).execute()
    sb.table("workspace_members").delete().eq("workspace_id", str(workspace_id)).execute()
    sb.table("workspaces").delete().eq("id", str(workspace_id)).execute()

    return {"status": "deleted"}


@router.delete("/{workspace_id}/leave")
async def leave_workspace(
    workspace_id: UUID,
    user_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Leave a workspace. Caller must leave as themselves."""
    assert_is_caller(user_id, current_user)
    sb = get_sb()
    result = (
        sb.table("workspace_members")
        .delete()
        .eq("workspace_id", str(workspace_id))
        .eq("user_id", current_user)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Membership not found")
    return {"status": "left"}


@router.post("/{workspace_id}/invite", response_model=WorkspaceMember)
async def invite_member(
    workspace_id: UUID,
    body: WorkspaceInvite,
    current_user: str = Depends(get_current_user),
):
    """Invite a user to a workspace. Member only."""
    sb = get_sb()
    require_workspace_member(sb, str(workspace_id), current_user)
    ws = sb.table("workspaces").select("id").eq("id", str(workspace_id)).execute()
    if not ws.data:
        raise HTTPException(status_code=404, detail="Workspace not found")

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
async def get_feed(
    workspace_id: UUID,
    limit: int = 50,
    offset: int = 0,
    current_user: str = Depends(get_current_user),
):
    """Get workspace feed messages (chronological). Member only."""
    sb = get_sb()
    require_workspace_member(sb, str(workspace_id), current_user)
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
    workspace_id: UUID,
    user_id: UUID,
    body: FeedMessageCreate,
    current_user: str = Depends(get_current_user),
):
    """Post a message to the workspace feed. Member only; posts as self."""
    assert_is_caller(user_id, current_user)
    sb = get_sb()
    require_workspace_member(sb, str(workspace_id), current_user)

    data = {
        "workspace_id": str(workspace_id),
        "user_id": current_user,
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

    # Collaborative response: trigger all workspace member agents to share their perspective
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
            if member["user_id"] == current_user:
                continue
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
                    "description": f"Someone shared a message in '{ws_name}':\n\n{body.content}\n\nShare your unique perspective on this. Use the post_message tool with the workspace_id to contribute your thoughts to the conversation.",
                    "status": "queued",
                    "priority": 10,
                }).execute()
    except Exception:
        pass

    return FeedMessage(**result.data[0])
