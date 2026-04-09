"""Agent profile CRUD and chat endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from supabase import create_client

from api.config import settings
from api.doctrine.orchestrator import handle_chat
from api.models.agent import (
    AgentProfile,
    AgentProfileCreate,
    AgentProfileUpdate,
    ChatMessage,
    ChatResponse,
)

router = APIRouter(prefix="/agents", tags=["agents"])


def _supabase():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@router.post("/", response_model=AgentProfile, status_code=201)
async def create_agent(user_id: UUID, body: AgentProfileCreate):
    """Create an agent profile for a user."""
    sb = _supabase()
    data = body.model_dump()
    data["user_id"] = str(user_id)
    result = sb.table("agent_profiles").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create agent profile")
    return result.data[0]


@router.get("/{agent_id}", response_model=AgentProfile)
async def get_agent(agent_id: UUID):
    """Get an agent profile by ID."""
    sb = _supabase()
    result = sb.table("agent_profiles").select("*").eq("id", str(agent_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Agent not found")
    return result.data[0]


@router.get("/user/{user_id}", response_model=AgentProfile)
async def get_agent_by_user(user_id: UUID):
    """Get the agent profile for a specific user."""
    sb = _supabase()
    result = (
        sb.table("agent_profiles").select("*").eq("user_id", str(user_id)).execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="No agent found for this user")
    return result.data[0]


@router.patch("/{agent_id}", response_model=AgentProfile)
async def update_agent(agent_id: UUID, body: AgentProfileUpdate):
    """Update an agent profile."""
    sb = _supabase()
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = (
        sb.table("agent_profiles").update(data).eq("id", str(agent_id)).execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Agent not found")
    return result.data[0]


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


@router.post("/{agent_id}/chat", response_model=ChatResponse)
async def chat_with_agent(agent_id: UUID, body: ChatMessage):
    """Send a message to an agent and get a response with confidence scoring."""
    sb = _supabase()

    # Fetch agent profile
    agent_result = (
        sb.table("agent_profiles").select("*").eq("id", str(agent_id)).execute()
    )
    if not agent_result.data:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent = agent_result.data[0]

    # Mark agent as thinking
    sb.table("agent_profiles").update({"status": "thinking"}).eq(
        "id", str(agent_id)
    ).execute()

    try:
        # Save user message
        user_msg = {
            "user_id": agent["user_id"],
            "agent_id": str(agent_id),
            "sender_type": "human",
            "content": body.content,
            "confidence": {},
            "metadata": {},
        }
        sb.table("messages").insert(user_msg).execute()

        # Run through Doctrine orchestrator
        response_text, confidence = await handle_chat(
            agent_id=agent_id,
            agent_name=agent["agent_name"],
            expertise=agent.get("expertise", []),
            goals=agent.get("goals", []),
            values=agent.get("values", []),
            communication_style=agent.get("communication_style"),
            system_prompt=agent.get("system_prompt"),
            user_message=body.content,
        )

        # Save agent response
        agent_msg = {
            "agent_id": str(agent_id),
            "sender_type": "agent",
            "content": response_text,
            "confidence": confidence.model_dump(),
            "metadata": {},
        }
        result = sb.table("messages").insert(agent_msg).execute()

        return ChatResponse(
            id=result.data[0]["id"],
            agent_id=agent_id,
            sender_type="agent",
            content=response_text,
            confidence=confidence,
            created_at=result.data[0]["created_at"],
        )
    finally:
        # Reset agent status
        sb.table("agent_profiles").update({"status": "idle"}).eq(
            "id", str(agent_id)
        ).execute()


@router.get("/{agent_id}/messages")
async def get_messages(agent_id: UUID, limit: int = 50):
    """Get recent chat messages for an agent."""
    sb = _supabase()
    result = (
        sb.table("messages")
        .select("*")
        .eq("agent_id", str(agent_id))
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    return result.data
