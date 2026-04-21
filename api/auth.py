"""Authentication dependency for FastAPI routes.

Extracts user_id from Supabase JWT in Authorization header, plus helpers
for common authorization checks (workspace membership, agent ownership,
caller-matches-path).
"""

from __future__ import annotations

from fastapi import Header, HTTPException
from supabase import create_client

from api.config import settings
from api.db import get_sb


async def get_current_user(
    authorization: str | None = Header(None),
) -> str:
    """Extract authenticated user_id from Supabase JWT."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ")
        try:
            sb = create_client(settings.supabase_url, settings.supabase_anon_key)
            user_response = sb.auth.get_user(token)
            if user_response and user_response.user:
                return user_response.user.id
        except Exception:
            pass
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    raise HTTPException(status_code=401, detail="Authentication required")


def require_admin(user_id: str) -> None:
    """Raise 403 if user is not an admin."""
    sb = get_sb()
    result = sb.table("users").select("is_admin").eq("id", user_id).execute()
    if not result.data or not result.data[0].get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")


def assert_is_caller(path_user_id, caller: str) -> None:
    """Raise 403 unless path_user_id matches the authenticated caller.

    Use when an endpoint takes a user_id in the path or query string and
    is strictly self-service (notifications, onboarding, north star, etc.).
    """
    if str(path_user_id) != caller:
        raise HTTPException(
            status_code=403,
            detail="Cannot act on behalf of another user",
        )


def get_workspace_role(sb, workspace_id: str, user_id: str) -> str | None:
    """Return the caller's role in a workspace, or None if not a member."""
    result = (
        sb.table("workspace_members")
        .select("role")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        return None
    return result.data[0]["role"]


def require_workspace_member(sb, workspace_id: str, user_id: str) -> str:
    """Raise 403 unless user_id is a member of workspace_id. Returns role."""
    role = get_workspace_role(sb, workspace_id, user_id)
    if role is None:
        raise HTTPException(status_code=403, detail="Not a workspace member")
    return role


def require_workspace_owner(sb, workspace_id: str, user_id: str) -> str:
    """Raise 403 unless user_id is owner of workspace_id."""
    role = get_workspace_role(sb, workspace_id, user_id)
    if role != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only the workspace owner can do this",
        )
    return role


def require_agent_owner(sb, agent_id: str, user_id: str) -> dict:
    """Raise 403 unless the agent is owned by user_id. Returns the agent row."""
    result = sb.table("agent_profiles").select("*").eq("id", agent_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Agent not found")
    if result.data[0]["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not your agent")
    return result.data[0]
