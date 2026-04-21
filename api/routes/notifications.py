"""Notification endpoints — list, mark read, count unread."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from api.auth import assert_is_caller, get_current_user
from api.db import get_sb

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/user/{user_id}")
async def list_notifications(
    user_id: UUID,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    current_user: str = Depends(get_current_user),
):
    """List notifications for the caller, newest first."""
    assert_is_caller(user_id, current_user)
    sb = get_sb()
    query = (
        sb.table("notifications")
        .select("*")
        .eq("user_id", current_user)
        .order("created_at", desc=True)
    )
    if unread_only:
        query = query.eq("read", False)
    result = query.range(offset, offset + limit - 1).execute()
    return result.data


@router.get("/user/{user_id}/count")
async def unread_count(
    user_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Get count of unread notifications for the caller."""
    assert_is_caller(user_id, current_user)
    sb = get_sb()
    result = (
        sb.table("notifications")
        .select("id", count="exact")
        .eq("user_id", current_user)
        .eq("read", False)
        .execute()
    )
    return {"count": result.count or 0}


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Mark a single notification as read. Caller must own it."""
    sb = get_sb()
    existing = (
        sb.table("notifications")
        .select("user_id")
        .eq("id", str(notification_id))
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Notification not found")
    if existing.data[0]["user_id"] != current_user:
        raise HTTPException(status_code=403, detail="Not your notification")

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
async def mark_all_read(
    user_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Mark all notifications as read for the caller."""
    assert_is_caller(user_id, current_user)
    sb = get_sb()
    sb.table("notifications").update({"read": True}).eq(
        "user_id", current_user
    ).eq("read", False).execute()
    return {"status": "ok"}
