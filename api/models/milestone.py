from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class MilestoneCreate(BaseModel):
    title: str
    description: str | None = None
    due_date: datetime | None = None
    status: str = "pending"
    assigned_agents: list[UUID] = Field(default_factory=list)


class MilestoneUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    due_date: datetime | None = None
    status: str | None = None
    assigned_agents: list[UUID] | None = None


class Milestone(BaseModel):
    id: UUID
    workspace_id: UUID
    title: str
    description: str | None
    due_date: datetime | None
    status: str
    assigned_agents: list[UUID]
    created_at: datetime
    updated_at: datetime


class AgentTaskCreate(BaseModel):
    title: str
    description: str | None = None
    workspace_id: UUID | None = None
    status: str = "queued"


class AgentTaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    result: dict | None = None


class AgentTask(BaseModel):
    id: UUID
    agent_id: UUID
    workspace_id: UUID | None
    title: str
    description: str | None
    status: str
    result: dict
    created_at: datetime
    updated_at: datetime
