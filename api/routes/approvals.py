"""Approval queue endpoints — list, detail, approve, reject, edit-and-approve."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from api.auth import get_current_user
from api.db import get_sb
from api.models.approval import (
    Approval,
    ApprovalCreate,
    ApprovalEditAndApprove,
    ApprovalResolve,
    ApprovalWithAgent,
)

router = APIRouter(prefix="/approvals", tags=["approvals"])


def _require_owner(sb, approval_id: UUID, user_id: str) -> dict:
    """Fetch an approval and raise 403 unless user_id owns it."""
    res = sb.table("approvals").select("*").eq("id", str(approval_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Approval not found")
    row = res.data[0]
    if row["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not your approval")
    return row


@router.get("/user/{user_id}", response_model=list[ApprovalWithAgent])
async def list_approvals(
    user_id: UUID,
    status: str = "pending",
    current_user: str = Depends(get_current_user),
):
    """List approvals for a user. Caller must be that user."""
    if str(user_id) != current_user:
        raise HTTPException(status_code=403, detail="Cannot read another user's approvals")
    sb = get_sb()
    result = (
        sb.table("approvals")
        .select("*, agent_profiles(agent_name)")
        .eq("user_id", current_user)
        .eq("status", status)
        .order("created_at", desc=True)
        .execute()
    )
    approvals = []
    for row in result.data:
        agent_info = row.pop("agent_profiles", None) or {}
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
async def approval_count(
    user_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Get the count of pending approvals for a user. Caller must be that user."""
    if str(user_id) != current_user:
        raise HTTPException(status_code=403, detail="Cannot read another user's approvals")
    sb = get_sb()
    result = (
        sb.table("approvals")
        .select("id", count="exact")
        .eq("user_id", current_user)
        .eq("status", "pending")
        .execute()
    )
    return {"count": result.count or 0}


@router.get("/{approval_id}", response_model=ApprovalWithAgent)
async def get_approval(
    approval_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Get a single approval by ID. Caller must own it."""
    sb = get_sb()
    _require_owner(sb, approval_id, current_user)
    result = (
        sb.table("approvals")
        .select("*, agent_profiles(agent_name)")
        .eq("id", str(approval_id))
        .execute()
    )
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
async def approve_action(
    approval_id: UUID,
    body: ApprovalResolve | None = None,
    current_user: str = Depends(get_current_user),
):
    """Approve a pending action. Caller must own it."""
    sb = get_sb()
    _require_owner(sb, approval_id, current_user)
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
async def reject_action(
    approval_id: UUID,
    body: ApprovalResolve | None = None,
    current_user: str = Depends(get_current_user),
):
    """Reject a pending action. Caller must own it."""
    sb = get_sb()
    _require_owner(sb, approval_id, current_user)
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
async def edit_and_approve(
    approval_id: UUID,
    body: ApprovalEditAndApprove,
    current_user: str = Depends(get_current_user),
):
    """Edit the payload and approve in one step. Caller must own it."""
    sb = get_sb()
    _require_owner(sb, approval_id, current_user)
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
async def create_approval(
    body: ApprovalCreate,
    current_user: str = Depends(get_current_user),
):
    """Create a new approval request.

    JWT-gated; caller may only create approvals attached to themselves.
    The in-process agent worker inserts directly into the DB via the Supabase
    client rather than calling this endpoint, so gating this does not break
    the queue.
    """
    if str(body.user_id) != current_user:
        raise HTTPException(status_code=403, detail="Cannot create approvals for another user")
    sb = get_sb()
    data = body.model_dump(mode="json")
    result = sb.table("approvals").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create approval")
    return result.data[0]
