"""Notification endpoints — list, mark read, count unread."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from supabase import create_client

from api.config import settings

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _supabase():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


@router.get("/user/{user_id}")
async def list_notifications(
    user_id: UUID,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
):
    """List notifications for a user, newest first."""
    sb = _supabase()
    query = (
        sb.table("notifications")
        .select("*")
        .eq("user_id", str(user_id))
        .order("created_at", desc=True)
    )
    if unread_only:
        query = query.eq("read", False)
    result = query.range(offset, offset + limit - 1).execute()
    return result.data


@router.get("/user/{user_id}/count")
async def unread_count(user_id: UUID):
    """Get count of unread notifications."""
    sb = _supabase()
    result = (
        sb.table("notifications")
        .select("id", count="exact")
        .eq("user_id", str(user_id))
        .eq("read", False)
        .execute()
    )
    return {"count": result.count or 0}


@router.post("/{notification_id}/read")
async def mark_read(notification_id: UUID):
    """Mark a single notification as read."""
    sb = _supabase()
    result = (
        sb.table("notifications")
        .update({"read": True})
        .eq("id", str(notification_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Notification not found")
    return result.data[0]


@router.post("/user/{user_id}/read-all")
async def mark_all_read(user_id: UUID):
    """Mark all notifications as read for a user."""
    sb = _supabase()
    sb.table("notifications").update({"read": True}).eq(
        "user_id", str(user_id)
    ).eq("read", False).execute()
    return {"status": "ok"}
