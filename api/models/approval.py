from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ApprovalCreate(BaseModel):
    user_id: UUID
    agent_id: UUID
    workspace_id: UUID | None = None
    action_type: str
    payload: dict


class ApprovalResolve(BaseModel):
    human_note: str | None = None


class ApprovalEditAndApprove(BaseModel):
    payload: dict
    human_note: str | None = None


class Approval(BaseModel):
    id: UUID
    user_id: UUID
    agent_id: UUID
    workspace_id: UUID | None
    action_type: str
    payload: dict
    status: str
    human_note: str | None
    created_at: datetime
    resolved_at: datetime | None


class ApprovalWithAgent(Approval):
    agent_name: str | None = None
    confidence_score: float | None = Field(default=None, ge=0.0, le=1.0)
    confidence_reasoning: str | None = None
