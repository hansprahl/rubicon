"""Intelligence endpoints — suggestions, digest, trends, and checks."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from supabase import create_client

from api.config import settings
from api.runtime.rubicon_intelligence import (
    generate_user_suggestions,
    generate_cohort_digest,
    get_cohort_trends,
    check_and_notify,
)

router = APIRouter(prefix="/intelligence", tags=["intelligence"])


def _supabase():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


@router.get("/suggestions/{user_id}")
async def get_suggestions(user_id: UUID):
    """Get personalized suggestions for a user (from DB + generated if needed)."""
    sb = _supabase()
    uid = str(user_id)

    # Fetch existing non-dismissed suggestions
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

    # If no suggestions, generate them on the fly
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

        # Re-fetch from DB
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
async def dismiss_suggestion(suggestion_id: UUID):
    """Dismiss a suggestion."""
    sb = _supabase()
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
async def get_digest():
    """Get the latest What's New digest for the cohort."""
    return await generate_cohort_digest()


@router.get("/trends")
async def get_trends():
    """Get cohort-wide trends."""
    return await get_cohort_trends()


@router.post("/check/{user_id}")
async def trigger_user_check(user_id: UUID):
    """Trigger intelligence check for a specific user."""
    result = await check_and_notify(str(user_id))
    return result


