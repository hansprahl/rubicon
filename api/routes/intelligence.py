"""Intelligence endpoints — suggestions, digest, trends, and checks."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from api.auth import assert_is_caller, get_current_user
from api.db import get_sb
from api.runtime.rubicon_intelligence import (
    generate_user_suggestions,
    generate_cohort_digest,
    get_cohort_trends,
    check_and_notify,
)

router = APIRouter(prefix="/intelligence", tags=["intelligence"])


@router.get("/suggestions/{user_id}")
async def get_suggestions(
    user_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Get personalized suggestions for the caller."""
    assert_is_caller(user_id, current_user)
    sb = get_sb()
    uid = current_user

    result = (
        sb.table("intelligence_suggestions")
        .select("*")
        .eq("dismissed", False)
        .or_(f"user_id.eq.{uid},user_id.is.null")
        .order("priority", desc=True)
        .limit(5)
        .execute()
    )

    suggestions = result.data or []

    if not suggestions:
        generated = await generate_user_suggestions(uid)
        for s in generated:
            sb.table("intelligence_suggestions").insert({
                "user_id": uid,
                "suggestion_type": s["type"],
                "title": s["title"],
                "body": s["body"],
                "action_url": s["action_url"],
                "priority": s["priority"],
            }).execute()

        result = (
            sb.table("intelligence_suggestions")
            .select("*")
            .eq("dismissed", False)
            .or_(f"user_id.eq.{uid},user_id.is.null")
            .order("priority", desc=True)
            .limit(5)
            .execute()
        )
        suggestions = result.data or []

    return suggestions


@router.post("/suggestions/{suggestion_id}/dismiss")
async def dismiss_suggestion(
    suggestion_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Dismiss a suggestion. Caller must own it (or it must be a cohort-wide one)."""
    sb = get_sb()
    existing = (
        sb.table("intelligence_suggestions")
        .select("user_id")
        .eq("id", str(suggestion_id))
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    owner = existing.data[0]["user_id"]
    # Allow dismissal if the user owns it, or if it's a cohort-wide (null) suggestion.
    if owner is not None and owner != current_user:
        raise HTTPException(status_code=403, detail="Not your suggestion")

    result = (
        sb.table("intelligence_suggestions")
        .update({"dismissed": True})
        .eq("id", str(suggestion_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    return {"status": "dismissed"}


@router.get("/digest")
async def get_digest(current_user: str = Depends(get_current_user)):
    """Get the latest What's New digest for the cohort."""
    return await generate_cohort_digest()


@router.get("/trends")
async def get_trends(current_user: str = Depends(get_current_user)):
    """Get cohort-wide trends."""
    return await get_cohort_trends()


@router.post("/check/{user_id}")
async def trigger_user_check(
    user_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Trigger intelligence check for the caller."""
    assert_is_caller(user_id, current_user)
    result = await check_and_notify(current_user)
    return result
