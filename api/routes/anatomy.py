"""Anatomy API endpoints — agent body-system health."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from supabase import create_client

from api.config import settings
from api.runtime.anatomy import get_anatomy, get_heartbeat_status

router = APIRouter(prefix="/anatomy", tags=["anatomy"])


def _supabase():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def _serialize_anatomy(anatomy):
    """Convert AgentAnatomy dataclass to a JSON-serializable dict."""
    def _sys(s):
        return {
            "name": s.name,
            "status": s.status,
            "health": s.health,
            "detail": s.detail,
        }

    return {
        "soul": _sys(anatomy.soul),
        "brain": _sys(anatomy.brain),
        "heart": _sys(anatomy.heart),
        "voice": _sys(anatomy.voice),
        "gut": _sys(anatomy.gut),
        "hands": _sys(anatomy.hands),
        "muscle": _sys(anatomy.muscle),
        "connective_tissue": _sys(anatomy.connective_tissue),
        "skin": _sys(anatomy.skin),
        "blood": _sys(anatomy.blood),
        "heartbeat": {
            "status": anatomy.heartbeat.status,
            "bpm": anatomy.heartbeat.bpm,
            "health": anatomy.heartbeat.health,
        },
        "overall_health": anatomy.overall_health,
    }


@router.get("/{user_id}")
async def get_user_anatomy(user_id: UUID):
    """Get full anatomy for a user's agent."""
    sb = _supabase()

    # Look up agent for this user
    result = sb.table("agent_profiles").select("id").eq("user_id", str(user_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="No agent found for this user")

    agent_id = result.data[0]["id"]

    try:
        anatomy = await get_anatomy(str(user_id), agent_id)
        return _serialize_anatomy(anatomy)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{user_id}/heartbeat")
async def get_user_heartbeat(user_id: UUID):
    """Quick health check — just the heartbeat."""
    sb = _supabase()

    result = sb.table("agent_profiles").select("id").eq("user_id", str(user_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="No agent found for this user")

    agent_id = result.data[0]["id"]

    try:
        anatomy = await get_anatomy(str(user_id), agent_id)
        return {
            "heartbeat": {
                "status": anatomy.heartbeat.status,
                "bpm": anatomy.heartbeat.bpm,
                "health": anatomy.heartbeat.health,
            },
            "overall_health": anatomy.overall_health,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
