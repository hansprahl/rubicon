"""Pydantic models for inter-agent events."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AgentEvent(BaseModel):
    id: UUID
    workspace_id: UUID | None
    source_agent_id: UUID | None
    event_type: str
    payload: dict
    created_at: datetime


class EventCreate(BaseModel):
    event_type: str
    payload: dict = Field(default_factory=dict)


class Disagreement(BaseModel):
    entity_id: str
    entity_name: str
    contradicting_agent_id: str | None
    contradiction_reasoning: str
    contradiction_confidence: float
    support_count: int
    contradict_count: int


class EventSubscription(BaseModel):
    id: UUID
    workspace_id: UUID
    agent_id: UUID
    event_type: str
    active: bool = True
    created_at: datetime


class EventSubscriptionCreate(BaseModel):
    event_type: str
