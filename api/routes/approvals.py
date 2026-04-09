"""Approval queue endpoints — list, detail, approve, reject, edit-and-approve."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException
from supabase import create_client

from api.config import settings
from api.models.approval import (
    Approval,
    ApprovalCreate,
    ApprovalEditAndApprove,
    ApprovalResolve,
    ApprovalWithAgent,
)

router = APIRouter(prefix="/approvals", tags=["approvals"])


def _supabase():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


@router.get("/user/{user_id}", response_model=list[ApprovalWithAgent])
async def list_approvals(user_id: UUID, status: str = "pending"):
    """List approvals for a user, optionally filtered by status."""
    sb = _supabase()
    result = (
        sb.table("approvals")
        .select("*, agent_profiles(agent_name)")
        .eq("user_id", str(user_id))
        .eq("status", status)
        .order("created_at", desc=True)
        .execute()
    )
    approvals = []
    for row in result.data:
        agent_info = row.pop("agent_profiles", None) or {}
        # Extract confidence from payload if present
        confidence = row.get("payload", {}).get("confidence", {})
        approvals.append(
            ApprovalWithAgent(
                **row,
                agent_name=agent_info.get("agent_name"),
                confidence_score=confidence.get("score"),
                confidence_reasoning=confidence.get("reasoning"),
            )
        )
    return approvals


@router.get("/user/{user_id}/count")
async def approval_count(user_id: UUID):
    """Get the count of pending approvals for a user."""
    sb = _supabase()
    result = (
        sb.table("approvals")
        .select("id", count="exact")
        .eq("user_id", str(user_id))
        .eq("status", "pending")
        .execute()
    )
    return {"count": result.count or 0}


@router.get("/{approval_id}", response_model=ApprovalWithAgent)
async def get_approval(approval_id: UUID):
    """Get a single approval by ID."""
    sb = _supabase()
    result = (
        sb.table("approvals")
        .select("*, agent_profiles(agent_name)")
        .eq("id", str(approval_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Approval not found")
    row = result.data[0]
    agent_info = row.pop("agent_profiles", None) or {}
    confidence = row.get("payload", {}).get("confidence", {})
    return ApprovalWithAgent(
        **row,
        agent_name=agent_info.get("agent_name"),
        confidence_score=confidence.get("score"),
        confidence_reasoning=confidence.get("reasoning"),
    )


@router.post("/{approval_id}/approve", response_model=Approval)
async def approve_action(approval_id: UUID, body: ApprovalResolve | None = None):
    """Approve a pending action."""
    sb = _supabase()
    update = {
        "status": "approved",
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }
    if body and body.human_note:
        update["human_note"] = body.human_note
    result = (
        sb.table("approvals")
        .update(update)
        .eq("id", str(approval_id))
        .eq("status", "pending")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Approval not found or already resolved")
    return result.data[0]


@router.post("/{approval_id}/reject", response_model=Approval)
async def reject_action(approval_id: UUID, body: ApprovalResolve | None = None):
    """Reject a pending action."""
    sb = _supabase()
    update = {
        "status": "rejected",
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }
    if body and body.human_note:
        update["human_note"] = body.human_note
    result = (
        sb.table("approvals")
        .update(update)
        .eq("id", str(approval_id))
        .eq("status", "pending")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Approval not found or already resolved")
    return result.data[0]


@router.post("/{approval_id}/edit-approve", response_model=Approval)
async def edit_and_approve(approval_id: UUID, body: ApprovalEditAndApprove):
    """Edit the payload and approve in one step."""
    sb = _supabase()
    update = {
        "payload": body.payload,
        "status": "approved",
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }
    if body.human_note:
        update["human_note"] = body.human_note
    result = (
        sb.table("approvals")
        .update(update)
        .eq("id", str(approval_id))
        .eq("status", "pending")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Approval not found or already resolved")
    return result.data[0]


@router.post("/", response_model=Approval, status_code=201)
async def create_approval(body: ApprovalCreate):
    """Create a new approval request (called by agent worker)."""
    sb = _supabase()
    data = body.model_dump(mode="json")
    result = sb.table("approvals").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create approval")
    return result.data[0]
