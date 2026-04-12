from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class OnboardingDoc(BaseModel):
    id: UUID
    user_id: UUID
    doc_type: str
    file_name: str
    storage_path: str
    parsed_data: dict = Field(default_factory=dict)
    uploaded_at: datetime


class IDPParsed(BaseModel):
    goals: list[str] = Field(default_factory=list)
    development_areas: list[str] = Field(default_factory=list)
    leadership_priorities: list[str] = Field(default_factory=list)
    expertise: list[str] = Field(default_factory=list)
    action_plans: list[str] = Field(default_factory=list)


class EthicsParsed(BaseModel):
    values: list[str] = Field(default_factory=list)
    ethical_framework: str = ""
    worldview: str = ""
    key_principles: list[str] = Field(default_factory=list)


class InsightsParsed(BaseModel):
    primary_color: str = ""
    secondary_color: str = ""
    color_scores: dict = Field(default_factory=dict)
    strengths: list[str] = Field(default_factory=list)
    communication_style: str = ""
    personality_summary: str = ""


class SynthesizedProfile(BaseModel):
    agent_name: str
    expertise: list[str] = Field(default_factory=list)
    goals: list[str] = Field(default_factory=list)
    values: list[str] = Field(default_factory=list)
    personality: dict = Field(default_factory=dict)
    communication_style: str = ""
    system_prompt: str = ""
    autonomy_level: int = Field(default=2, ge=1, le=5)


class OnboardingProfileRequest(BaseModel):
    display_name: str
    avatar_url: str | None = None


class OnboardingSynthesizeRequest(BaseModel):
    agent_name: str
    autonomy_level: int = Field(default=2, ge=1, le=5)
    enrichment_answers: dict[str, str] | None = None
