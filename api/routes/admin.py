"""Admin routes — user approval, platform management."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import create_client

from api.auth import get_current_user, require_admin
from api.config import settings

router = APIRouter(prefix="/admin", tags=["admin"])


def _supabase():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------


@router.get("/users")
async def list_users(current_user: str = Depends(get_current_user)):
    """List all users with their status. Admin only."""
    sb = _supabase()
    require_admin(current_user)

    result = (
        sb.table("users")
        .select("id, display_name, email, avatar_url, status, is_admin, cohort, created_at")
        .order("created_at", desc=True)
        .execute()
    )

    # Also get agent info for each user
    agents_result = sb.table("agent_profiles").select("user_id, agent_name, fidelity").execute()
    agent_map = {a["user_id"]: a for a in (agents_result.data or [])}

    users = []
    for u in result.data or []:
        agent = agent_map.get(u["id"])
        users.append({
            **u,
            "agent_name": agent["agent_name"] if agent else None,
            "fidelity": agent["fidelity"] if agent else None,
        })

    return users


class UserStatusUpdate(BaseModel):
    status: str  # "approved" or "rejected"


@router.post("/users/{user_id}/status")
async def update_user_status(
    user_id: UUID,
    body: UserStatusUpdate,
    current_user: str = Depends(get_current_user),
):
    """Approve or reject a user. Admin only."""
    sb = _supabase()
    require_admin(current_user)

    if body.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Status must be 'approved' or 'rejected'")

    result = (
        sb.table("users")
        .update({"status": body.status})
        .eq("id", str(user_id))
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")

    # If approving, create a notification for the user
    if body.status == "approved":
        try:
            sb.table("notifications").insert({
                "user_id": str(user_id),
                "title": "Welcome to Rubicon!",
                "body": "Your account has been approved. Start by uploading your documents to build your digital twin.",
                "category": "info",
                "link": "/profile",
            }).execute()
        except Exception:
            pass  # Notification is nice-to-have

    return {"status": "ok", "user_id": str(user_id), "new_status": body.status}


@router.post("/users/{user_id}/admin")
async def toggle_admin(
    user_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Toggle admin status for a user. Admin only."""
    sb = _supabase()
    require_admin(current_user)

    # Get current admin status
    user_result = sb.table("users").select("is_admin").eq("id", str(user_id)).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")

    new_admin = not user_result.data[0].get("is_admin", False)
    sb.table("users").update({"is_admin": new_admin}).eq("id", str(user_id)).execute()

    return {"status": "ok", "user_id": str(user_id), "is_admin": new_admin}


@router.get("/users/{user_id}/check")
async def check_user_status(user_id: UUID):
    """Check a user's approval status. Used by middleware — intentionally public.

    Only returns status and is_admin — no sensitive data exposed.
    """
    sb = _supabase()
    result = sb.table("users").select("status, is_admin").eq("id", str(user_id)).execute()

    if not result.data:
        return {"status": "not_found", "is_admin": False}

    return {
        "status": result.data[0]["status"],
        "is_admin": result.data[0].get("is_admin", False),
    }
