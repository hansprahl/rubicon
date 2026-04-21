"""Agent profile CRUD and chat endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from api.auth import assert_is_caller, get_current_user, require_agent_owner
from api.db import get_sb
from api.doctrine.orchestrator import handle_chat
from api.models.agent import (
    AgentProfile,
    AgentProfileUpdate,
    ChatMessage,
    ChatResponse,
)
from api.runtime.prompt_builder import get_template_prompt

router = APIRouter(prefix="/agents", tags=["agents"])


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@router.post("/ensure/{user_id}")
async def ensure_agent(
    user_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Ensure a user and template agent exist for the caller. Idempotent."""
    assert_is_caller(user_id, current_user)
    sb = get_sb()

    existing = sb.table("agent_profiles").select("id").eq("user_id", current_user).execute()
    if existing.data:
        return {"status": "exists", "agent_id": existing.data[0]["id"]}

    try:
        auth_user = sb.auth.admin.get_user_by_id(current_user)
    except Exception:
        raise HTTPException(status_code=404, detail="Auth user not found")
    if not auth_user or not auth_user.user:
        raise HTTPException(status_code=404, detail="Auth user not found")
    email = auth_user.user.email or ""
    meta = auth_user.user.user_metadata or {}
    display_name = meta.get("full_name") or meta.get("name") or email.split("@")[0]
    avatar_url = meta.get("avatar_url") or meta.get("picture") or ""

    user_exists = sb.table("users").select("id").eq("id", current_user).execute()
    if not user_exists.data:
        sb.table("users").insert({
            "id": current_user,
            "display_name": display_name,
            "email": email,
            "avatar_url": avatar_url,
            "status": "pending",
        }).execute()

        try:
            admins = sb.table("users").select("id").eq("is_admin", True).execute()
            for admin in (admins.data or []):
                sb.table("notifications").insert({
                    "user_id": admin["id"],
                    "title": "New user signup",
                    "body": f"{display_name} ({email}) is waiting for approval.",
                    "category": "info",
                    "link": "/admin/users",
                }).execute()
        except Exception:
            pass

    agent_name = f"{display_name}'s Agent"
    system_prompt = get_template_prompt(display_name, agent_name)

    try:
        result = sb.table("agent_profiles").insert({
            "user_id": current_user,
            "agent_name": agent_name,
            "expertise": [],
            "goals": [],
            "values": [],
            "personality": {},
            "communication_style": None,
            "system_prompt": system_prompt,
            "autonomy_level": 2,
            "fidelity": 0.2,
        }).execute()
    except Exception:
        existing = sb.table("agent_profiles").select("id").eq("user_id", current_user).execute()
        if existing.data:
            return {"status": "exists", "agent_id": existing.data[0]["id"]}
        return {"status": "error", "detail": "Failed to create template agent"}

    if not result.data:
        return {"status": "error", "detail": "Failed to create template agent"}

    return {"status": "created", "agent_id": result.data[0]["id"]}


@router.get("/{agent_id}", response_model=AgentProfile)
async def get_agent(
    agent_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Get an agent profile by ID. Any authenticated cohort member can view."""
    sb = get_sb()
    result = sb.table("agent_profiles").select("*").eq("id", str(agent_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Agent not found")
    return result.data[0]


@router.get("/user/{user_id}", response_model=AgentProfile)
async def get_agent_by_user(
    user_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Get the agent profile for a specific user. Any authenticated cohort member can view."""
    sb = get_sb()
    result = (
        sb.table("agent_profiles").select("*").eq("user_id", str(user_id)).execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="No agent found for this user")
    return result.data[0]


@router.patch("/{agent_id}", response_model=AgentProfile)
async def update_agent(
    agent_id: UUID,
    body: AgentProfileUpdate,
    current_user: str = Depends(get_current_user),
):
    """Update an agent profile. Owner only."""
    sb = get_sb()
    require_agent_owner(sb, str(agent_id), current_user)
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
async def chat_with_agent(
    agent_id: UUID,
    body: ChatMessage,
    current_user: str = Depends(get_current_user),
):
    """Send a message to an agent. Owner only."""
    sb = get_sb()
    agent = require_agent_owner(sb, str(agent_id), current_user)

    user_result = sb.table("users").select("status").eq("id", agent["user_id"]).execute()
    if user_result.data and user_result.data[0].get("status") != "approved":
        raise HTTPException(status_code=403, detail="Account pending approval")

    conversation_id = body.conversation_id
    if not conversation_id:
        conv_result = sb.table("conversations").insert({
            "agent_id": str(agent_id),
            "user_id": agent["user_id"],
            "title": body.content[:50] + ("..." if len(body.content) > 50 else ""),
        }).execute()
        if conv_result.data:
            conversation_id = conv_result.data[0]["id"]

    sb.table("agent_profiles").update({"status": "thinking"}).eq(
        "id", str(agent_id)
    ).execute()

    try:
        user_msg = {
            "user_id": agent["user_id"],
            "agent_id": str(agent_id),
            "sender_type": "human",
            "content": body.content,
            "confidence": {},
            "metadata": {},
        }
        if conversation_id:
            user_msg["conversation_id"] = str(conversation_id)
        sb.table("messages").insert(user_msg).execute()

        response_text, confidence = await handle_chat(
            agent_id=agent_id,
            agent_name=agent["agent_name"],
            expertise=agent.get("expertise", []),
            goals=agent.get("goals", []),
            values=agent.get("values", []),
            communication_style=agent.get("communication_style"),
            system_prompt=agent.get("system_prompt"),
            user_message=body.content,
            user_id=agent["user_id"],
        )

        agent_msg = {
            "agent_id": str(agent_id),
            "sender_type": "agent",
            "content": response_text,
            "confidence": confidence.model_dump(),
            "metadata": {},
        }
        if conversation_id:
            agent_msg["conversation_id"] = str(conversation_id)
        result = sb.table("messages").insert(agent_msg).execute()

        if conversation_id:
            sb.table("conversations").update({
                "updated_at": result.data[0]["created_at"],
            }).eq("id", str(conversation_id)).execute()

        return ChatResponse(
            id=result.data[0]["id"],
            agent_id=agent_id,
            sender_type="agent",
            content=response_text,
            confidence=confidence,
            created_at=result.data[0]["created_at"],
            conversation_id=conversation_id,
        )
    finally:
        sb.table("agent_profiles").update({"status": "idle"}).eq(
            "id", str(agent_id)
        ).execute()


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------


@router.get("/{agent_id}/conversations")
async def list_conversations(
    agent_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """List all conversations for the caller's agent, newest first."""
    sb = get_sb()
    require_agent_owner(sb, str(agent_id), current_user)
    result = (
        sb.table("conversations")
        .select("*")
        .eq("agent_id", str(agent_id))
        .eq("status", "active")
        .order("updated_at", desc=True)
        .execute()
    )
    conversations = []
    for conv in (result.data or []):
        msgs = (
            sb.table("messages")
            .select("content")
            .eq("conversation_id", conv["id"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        count = (
            sb.table("messages")
            .select("id", count="exact")
            .eq("conversation_id", conv["id"])
            .execute()
        )
        conv["last_message"] = msgs.data[0]["content"][:80] if msgs.data else None
        conv["message_count"] = count.count if count.count else 0
        conversations.append(conv)
    return conversations


@router.post("/{agent_id}/conversations")
async def create_conversation(
    agent_id: UUID,
    title: str = "New chat",
    current_user: str = Depends(get_current_user),
):
    """Create a new conversation for the caller's agent."""
    sb = get_sb()
    agent = require_agent_owner(sb, str(agent_id), current_user)

    result = sb.table("conversations").insert({
        "agent_id": str(agent_id),
        "user_id": agent["user_id"],
        "title": title,
    }).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create conversation")
    return result.data[0]


@router.patch("/{agent_id}/conversations/{conversation_id}")
async def update_conversation(
    agent_id: UUID,
    conversation_id: UUID,
    title: str | None = None,
    status: str | None = None,
    current_user: str = Depends(get_current_user),
):
    """Update a conversation. Owner only."""
    sb = get_sb()
    require_agent_owner(sb, str(agent_id), current_user)
    data = {}
    if title is not None:
        data["title"] = title
    if status is not None:
        data["status"] = status
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = (
        sb.table("conversations")
        .update(data)
        .eq("id", str(conversation_id))
        .eq("agent_id", str(agent_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return result.data[0]


@router.delete("/{agent_id}/conversations/{conversation_id}")
async def delete_conversation(
    agent_id: UUID,
    conversation_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Delete a conversation and its messages. Owner only."""
    sb = get_sb()
    require_agent_owner(sb, str(agent_id), current_user)
    sb.table("messages").delete().eq("conversation_id", str(conversation_id)).execute()
    sb.table("conversations").delete().eq("id", str(conversation_id)).eq("agent_id", str(agent_id)).execute()
    return {"status": "deleted"}


@router.get("/{agent_id}/messages")
async def get_messages(
    agent_id: UUID,
    conversation_id: str | None = None,
    limit: int = 50,
    current_user: str = Depends(get_current_user),
):
    """Get messages for the caller's agent."""
    sb = get_sb()
    require_agent_owner(sb, str(agent_id), current_user)
    query = sb.table("messages").select("*").eq("agent_id", str(agent_id))
    if conversation_id:
        query = query.eq("conversation_id", conversation_id)
    else:
        query = query.is_("conversation_id", "null")
    result = query.order("created_at", desc=False).limit(limit).execute()
    return result.data
