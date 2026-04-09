from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class WorkspaceCreate(BaseModel):
    name: str
    description: str | None = None
    settings: dict = Field(default_factory=dict)


class WorkspaceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    settings: dict | None = None


class Workspace(BaseModel):
    id: UUID
    name: str
    description: str | None
    created_by: UUID
    settings: dict
    created_at: datetime
    updated_at: datetime


class WorkspaceWithMembers(Workspace):
    member_count: int = 0
    role: str | None = None  # current user's role


class WorkspaceMember(BaseModel):
    workspace_id: UUID
    user_id: UUID
    role: str
    joined_at: datetime
    display_name: str | None = None


class WorkspaceInvite(BaseModel):
    user_id: UUID
    role: str = "member"


# --- Feed Messages ---


class FeedMessageCreate(BaseModel):
    content: str
    confidence_score: float | None = Field(default=None, ge=0.0, le=1.0)
    confidence_reasoning: str | None = None


class FeedMessage(BaseModel):
    id: UUID
    workspace_id: UUID
    user_id: UUID | None
    agent_id: UUID | None
    sender_type: str
    content: str
    confidence: dict
    metadata: dict
    created_at: datetime
    # joined fields
    display_name: str | None = None
    agent_name: str | None = None


# --- Shared Knowledge Graph ---


class EntityCreate(BaseModel):
    name: str
    entity_type: str
    properties: dict = Field(default_factory=dict)
    confidence_score: float = Field(default=0.5, ge=0.0, le=1.0)
    status: str = "draft"


class EntityUpdate(BaseModel):
    name: str | None = None
    entity_type: str | None = None
    properties: dict | None = None
    confidence_score: float | None = Field(default=None, ge=0.0, le=1.0)
    status: str | None = None


class Entity(BaseModel):
    id: UUID
    workspace_id: UUID
    author_agent_id: UUID | None
    name: str
    entity_type: str
    properties: dict
    confidence_score: float
    status: str
    created_at: datetime
    updated_at: datetime


class RelationshipCreate(BaseModel):
    source_entity_id: UUID
    target_entity_id: UUID
    relationship_type: str
    confidence_score: float = Field(default=0.5, ge=0.0, le=1.0)
    metadata: dict = Field(default_factory=dict)
    created_by_agent: UUID | None = None


class Relationship(BaseModel):
    id: UUID
    workspace_id: UUID
    source_entity_id: UUID
    target_entity_id: UUID
    relationship_type: str
    confidence_score: float
    metadata: dict
    created_by_agent: UUID | None
    created_at: datetime
