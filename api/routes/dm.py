"""Direct messaging between users."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth import get_current_user
from api.db import get_sb

router = APIRouter(prefix="/dm", tags=["direct-messages"])


class DMMessageCreate(BaseModel):
    content: str


def _assert_matches_caller(claimed: UUID | None, caller: str) -> None:
    if claimed is not None and str(claimed) != caller:
        raise HTTPException(status_code=403, detail="user_id does not match authenticated caller")


def _require_participant(sb, conversation_id: UUID, user_id: str) -> dict:
    conv = (
        sb.table("dm_conversations")
        .select("*")
        .eq("id", str(conversation_id))
        .execute()
    )
    if not conv.data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    c = conv.data[0]
    if user_id not in (c["participant_1"], c["participant_2"]):
        raise HTTPException(status_code=403, detail="Not a participant")
    return c


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------


@router.get("/conversations")
async def list_dm_conversations(
    user_id: UUID | None = None,
    current_user: str = Depends(get_current_user),
):
    """List all DM conversations for the authenticated user, newest first."""
    _assert_matches_caller(user_id, current_user)
    sb = get_sb()

    result = (
        sb.table("dm_conversations")
        .select("*")
        .or_(f"participant_1.eq.{current_user},participant_2.eq.{current_user}")
        .order("updated_at", desc=True)
        .execute()
    )

    # Collect all participant IDs to look up names
    user_ids: set[str] = set()
    for conv in result.data or []:
        user_ids.add(conv["participant_1"])
        user_ids.add(conv["participant_2"])

    # Fetch display names
    name_map: dict[str, str] = {}
    if user_ids:
        users = (
            sb.table("users")
            .select("id, display_name, email")
            .in_("id", list(user_ids))
            .execute()
        )
        for u in users.data or []:
            name_map[u["id"]] = u["display_name"] or u["email"] or "Unknown"

    # Build response with last message preview
    conversations = []
    for conv in result.data or []:
        other_id = (
            conv["participant_2"]
            if conv["participant_1"] == current_user
            else conv["participant_1"]
        )

        last_msg = (
            sb.table("dm_messages")
            .select("content, sender_id, created_at")
            .eq("conversation_id", conv["id"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        unread = (
            sb.table("dm_messages")
            .select("id", count="exact")
            .eq("conversation_id", conv["id"])
            .neq("sender_id", current_user)
            .is_("read_at", "null")
            .execute()
        )

        msg_count = (
            sb.table("dm_messages")
            .select("id", count="exact")
            .eq("conversation_id", conv["id"])
            .execute()
        )

        conversations.append({
            "id": conv["id"],
            "other_user_id": other_id,
            "other_user_name": name_map.get(other_id, "Unknown"),
            "last_message": last_msg.data[0]["content"][:80] if last_msg.data else None,
            "last_message_at": last_msg.data[0]["created_at"] if last_msg.data else conv["updated_at"],
            "unread_count": unread.count or 0,
            "message_count": msg_count.count or 0,
            "created_at": conv["created_at"],
            "updated_at": conv["updated_at"],
        })

    return conversations


@router.post("/conversations")
async def get_or_create_dm(
    other_user_id: UUID,
    user_id: UUID | None = None,
    current_user: str = Depends(get_current_user),
):
    """Get or create a DM conversation between the caller and another user."""
    _assert_matches_caller(user_id, current_user)
    if current_user == str(other_user_id):
        raise HTTPException(status_code=400, detail="Cannot DM yourself")

    sb = get_sb()

    # Normalize order so unique constraint works
    p1 = min(current_user, str(other_user_id))
    p2 = max(current_user, str(other_user_id))

    existing = (
        sb.table("dm_conversations")
        .select("*")
        .eq("participant_1", p1)
        .eq("participant_2", p2)
        .execute()
    )
    if existing.data:
        return existing.data[0]

    result = (
        sb.table("dm_conversations")
        .insert({"participant_1": p1, "participant_2": p2})
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create conversation")
    return result.data[0]


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------


@router.get("/conversations/{conversation_id}/messages")
async def get_dm_messages(
    conversation_id: UUID,
    limit: int = 50,
    offset: int = 0,
    current_user: str = Depends(get_current_user),
):
    """Get messages in a DM conversation. Caller must be a participant."""
    sb = get_sb()
    _require_participant(sb, conversation_id, current_user)

    result = (
        sb.table("dm_messages")
        .select("*")
        .eq("conversation_id", str(conversation_id))
        .order("created_at", desc=False)
        .range(offset, offset + limit - 1)
        .execute()
    )

    sender_ids = list({m["sender_id"] for m in result.data or []})
    name_map: dict[str, str] = {}
    if sender_ids:
        users = (
            sb.table("users")
            .select("id, display_name")
            .in_("id", sender_ids)
            .execute()
        )
        for u in users.data or []:
            name_map[u["id"]] = u["display_name"] or "Unknown"

    messages = []
    for m in result.data or []:
        messages.append({
            **m,
            "sender_name": name_map.get(m["sender_id"], "Unknown"),
        })
    return messages


@router.post("/conversations/{conversation_id}/messages")
async def send_dm(
    conversation_id: UUID,
    body: DMMessageCreate,
    user_id: UUID | None = None,
    current_user: str = Depends(get_current_user),
):
    """Send a direct message. Caller must be a participant."""
    _assert_matches_caller(user_id, current_user)
    sb = get_sb()
    c = _require_participant(sb, conversation_id, current_user)

    result = (
        sb.table("dm_messages")
        .insert({
            "conversation_id": str(conversation_id),
            "sender_id": current_user,
            "content": body.content,
        })
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to send message")

    sb.table("dm_conversations").update({
        "updated_at": result.data[0]["created_at"],
    }).eq("id", str(conversation_id)).execute()

    other_id = c["participant_2"] if c["participant_1"] == current_user else c["participant_1"]
    sender_name_result = sb.table("users").select("display_name").eq("id", current_user).execute()
    sender_name = sender_name_result.data[0]["display_name"] if sender_name_result.data else "Someone"

    try:
        sb.table("notifications").insert({
            "user_id": other_id,
            "title": f"Message from {sender_name}",
            "body": body.content[:100],
            "category": "info",
            "link": "/chat",
        }).execute()
    except Exception:
        pass  # Notification is nice-to-have

    return {**result.data[0], "sender_name": sender_name}


@router.post("/conversations/{conversation_id}/read")
async def mark_dm_read(
    conversation_id: UUID,
    user_id: UUID | None = None,
    current_user: str = Depends(get_current_user),
):
    """Mark all messages in a conversation as read for the caller."""
    _assert_matches_caller(user_id, current_user)
    sb = get_sb()
    _require_participant(sb, conversation_id, current_user)

    sb.table("dm_messages").update({
        "read_at": "now()",
    }).eq("conversation_id", str(conversation_id)).neq(
        "sender_id", current_user
    ).is_("read_at", "null").execute()

    return {"status": "ok"}
