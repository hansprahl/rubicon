"""Authentication dependency for FastAPI routes.

Extracts user_id from Supabase JWT in Authorization header.
Falls back to query parameter for backwards compatibility during transition.
"""

from __future__ import annotations

from fastapi import Header, HTTPException, Query
from supabase import create_client

from api.config import settings


def _supabase():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


async def get_current_user(
    authorization: str | None = Header(None),
    admin_id: str | None = Query(None),
) -> str:
    """Extract authenticated user_id from Supabase JWT or fallback to query param.

    Priority: Authorization header > admin_id query param.
    The query param fallback exists because the frontend currently passes user IDs
    as query params. This should be migrated to JWT-only auth.
    """
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ")
        try:
            sb = create_client(settings.supabase_url, settings.supabase_anon_key)
            user_response = sb.auth.get_user(token)
            if user_response and user_response.user:
                return user_response.user.id
        except Exception:
            pass
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # Fallback: accept admin_id from query param (transition period)
    if admin_id:
        return admin_id

    raise HTTPException(status_code=401, detail="Authentication required")


def require_admin(user_id: str) -> None:
    """Raise 403 if user is not an admin."""
    sb = _supabase()
    result = sb.table("users").select("is_admin").eq("id", user_id).execute()
    if not result.data or not result.data[0].get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
