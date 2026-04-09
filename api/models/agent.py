from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AgentProfileCreate(BaseModel):
    agent_name: str
    expertise: list[str] = Field(default_factory=list)
    goals: list[str] = Field(default_factory=list)
    values: list[str] = Field(default_factory=list)
    personality: dict = Field(default_factory=dict)
    communication_style: str | None = None
    system_prompt: str | None = None
    autonomy_level: int = Field(default=2, ge=1, le=5)


class AgentProfileUpdate(BaseModel):
    agent_name: str | None = None
    expertise: list[str] | None = None
    goals: list[str] | None = None
    values: list[str] | None = None
    personality: dict | None = None
    communication_style: str | None = None
    system_prompt: str | None = None
    autonomy_level: int | None = Field(default=None, ge=1, le=5)


class AgentProfile(BaseModel):
    id: UUID
    user_id: UUID
    agent_name: str
    expertise: list[str]
    goals: list[str]
    values: list[str]
    personality: dict
    communication_style: str | None
    system_prompt: str | None
    autonomy_level: int
    status: str
    created_at: datetime
    updated_at: datetime


class ChatMessage(BaseModel):
    content: str
    conversation_id: str | None = None


class ChatResponse(BaseModel):
    id: UUID
    agent_id: UUID
    sender_type: str
    content: str
    confidence: ConfidenceScore
    created_at: datetime
    conversation_id: UUID | None = None


class ConfidenceScore(BaseModel):
    score: float = Field(ge=0.0, le=1.0)
    reasoning: str


class Conversation(BaseModel):
    id: UUID
    agent_id: UUID
    user_id: UUID
    title: str
    status: str
    created_at: datetime
    updated_at: datetime
    last_message: str | None = None
    message_count: int = 0


# Rebuild ChatResponse now that ConfidenceScore is defined
ChatResponse.model_rebuild()
