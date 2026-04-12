"""Feedback and bug reporting endpoints."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from api.db import get_sb

router = APIRouter(prefix="/feedback", tags=["feedback"])


class CreateFeedbackRequest(BaseModel):
    type: str
    title: str
    body: str
    page_url: Optional[str] = None


class UpdateFeedbackRequest(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None


@router.get("")
async def list_feedback(
    type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    sort: str = Query("newest"),
    limit: int = Query(50),
    offset: int = Query(0),
    user_id: Optional[str] = Query(None),
):
    """List all feedback with optional filters. sort: newest | upvotes | status"""
    sb = get_sb()

    query = sb.table("feedback").select("*, users(display_name)")

    if type:
        query = query.eq("type", type)
    if status:
        query = query.eq("status", status)

    if sort == "upvotes":
        query = query.order("upvotes", desc=True).order("created_at", desc=True)
    elif sort == "status":
        query = query.order("status").order("created_at", desc=True)
    else:
        query = query.order("created_at", desc=True)

    result = query.range(offset, offset + limit - 1).execute()
    items = result.data or []

    # If user_id provided, annotate which ones the user has upvoted
    if user_id and items:
        feedback_ids = [item["id"] for item in items]
        upvotes_result = (
            sb.table("feedback_upvotes")
            .select("feedback_id")
            .eq("user_id", user_id)
            .in_("feedback_id", feedback_ids)
            .execute()
        )
        upvoted_ids = {r["feedback_id"] for r in (upvotes_result.data or [])}
        for item in items:
            item["user_upvoted"] = item["id"] in upvoted_ids

    return items


@router.get("/stats")
async def get_feedback_stats():
    """Summary stats: open bugs, feature requests, etc."""
    sb = get_sb()

    result = sb.table("feedback").select("type, status").execute()
    rows = result.data or []

    stats = {
        "total": len(rows),
        "open_bugs": sum(1 for r in rows if r["type"] == "bug" and r["status"] == "open"),
        "open_features": sum(1 for r in rows if r["type"] == "feature" and r["status"] == "open"),
        "open_improvements": sum(1 for r in rows if r["type"] == "improvement" and r["status"] == "open"),
        "by_status": {},
        "by_type": {},
    }

    for r in rows:
        stats["by_status"][r["status"]] = stats["by_status"].get(r["status"], 0) + 1
        stats["by_type"][r["type"]] = stats["by_type"].get(r["type"], 0) + 1

    return stats


@router.get("/{feedback_id}")
async def get_feedback(feedback_id: UUID, user_id: Optional[str] = Query(None)):
    """Get a single feedback item."""
    sb = get_sb()
    result = (
        sb.table("feedback")
        .select("*, users(display_name)")
        .eq("id", str(feedback_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Feedback not found")

    item = result.data[0]

    if user_id:
        upvote = (
            sb.table("feedback_upvotes")
            .select("feedback_id")
            .eq("user_id", user_id)
            .eq("feedback_id", str(feedback_id))
            .execute()
        )
        item["user_upvoted"] = len(upvote.data or []) > 0

    return item


@router.post("")
async def create_feedback(data: CreateFeedbackRequest, user_id: str = Query(...)):
    """Create a new feedback item."""
    sb = get_sb()

    if data.type not in ("bug", "feature", "improvement", "general"):
        raise HTTPException(status_code=400, detail="Invalid feedback type")

    result = sb.table("feedback").insert({
        "user_id": user_id,
        "type": data.type,
        "title": data.title,
        "body": data.body,
        "page_url": data.page_url,
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create feedback")

    return result.data[0]


@router.patch("/{feedback_id}")
async def update_feedback(
    feedback_id: UUID,
    data: UpdateFeedbackRequest,
    user_id: str = Query(...),
):
    """Update feedback. Owner can edit title/body; admin can change status/priority."""
    sb = get_sb()

    existing = (
        sb.table("feedback")
        .select("user_id")
        .eq("id", str(feedback_id))
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Feedback not found")

    is_owner = existing.data[0]["user_id"] == user_id
    updates: dict = {"updated_at": "now()"}

    if is_owner:
        if data.title is not None:
            updates["title"] = data.title
        if data.body is not None:
            updates["body"] = data.body

    # Status and priority are admin-level changes (allowed here for simplicity)
    if data.status is not None:
        updates["status"] = data.status
    if data.priority is not None:
        updates["priority"] = data.priority

    if len(updates) == 1:
        raise HTTPException(status_code=403, detail="No permitted fields to update")

    result = (
        sb.table("feedback")
        .update(updates)
        .eq("id", str(feedback_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Update failed")

    return result.data[0]


@router.post("/{feedback_id}/upvote")
async def toggle_upvote(feedback_id: UUID, user_id: str = Query(...)):
    """Toggle upvote on a feedback item. Returns updated upvote count and state."""
    sb = get_sb()

    # Check if already upvoted
    existing = (
        sb.table("feedback_upvotes")
        .select("feedback_id")
        .eq("user_id", user_id)
        .eq("feedback_id", str(feedback_id))
        .execute()
    )

    if existing.data:
        # Remove upvote
        sb.table("feedback_upvotes").delete().eq("user_id", user_id).eq(
            "feedback_id", str(feedback_id)
        ).execute()
        sb.rpc("decrement_feedback_upvotes", {"fid": str(feedback_id)}).execute()
        upvoted = False
    else:
        # Add upvote
        sb.table("feedback_upvotes").insert({
            "user_id": user_id,
            "feedback_id": str(feedback_id),
        }).execute()
        sb.rpc("increment_feedback_upvotes", {"fid": str(feedback_id)}).execute()
        upvoted = True

    # Return updated count
    result = (
        sb.table("feedback")
        .select("upvotes")
        .eq("id", str(feedback_id))
        .execute()
    )
    upvotes = result.data[0]["upvotes"] if result.data else 0

    return {"upvoted": upvoted, "upvotes": upvotes}
