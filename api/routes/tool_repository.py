"""Tool Repository API — browse, enable/disable tools for agents."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth import get_current_user, require_agent_owner
from api.db import get_sb

router = APIRouter(prefix="/tools", tags=["tools"])


# -- Models --

class BulkEnableRequest(BaseModel):
    tool_ids: list[str]


# -- Endpoints --

@router.get("")
async def list_tools(
    category: str | None = None,
    current_user: str = Depends(get_current_user),
):
    """List all tools in the repository. Any authenticated cohort member."""
    sb = get_sb()
    query = sb.table("tool_repository").select("*").order("category").order("name")
    if category:
        query = query.eq("category", category)
    result = query.execute()
    return result.data or []


@router.get("/categories")
async def list_categories(current_user: str = Depends(get_current_user)):
    """List all categories with tool counts."""
    sb = get_sb()
    result = sb.table("tool_repository").select("category").execute()
    counts: dict[str, int] = {}
    for row in (result.data or []):
        cat = row["category"]
        counts[cat] = counts.get(cat, 0) + 1
    return [{"category": k, "count": v} for k, v in sorted(counts.items())]


@router.get("/{tool_id}")
async def get_tool(
    tool_id: str,
    current_user: str = Depends(get_current_user),
):
    """Get a single tool's details."""
    sb = get_sb()
    result = sb.table("tool_repository").select("*").eq("id", tool_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Tool not found")
    return result.data[0]


@router.get("/agent/{agent_id}")
async def get_agent_tools(
    agent_id: str,
    current_user: str = Depends(get_current_user),
):
    """List tools enabled for an agent. Owner only."""
    sb = get_sb()
    require_agent_owner(sb, agent_id, current_user)
    enabled = (
        sb.table("agent_tools")
        .select("tool_id,enabled_at")
        .eq("agent_id", agent_id)
        .execute()
    )
    if not enabled.data:
        return []

    tool_ids = [row["tool_id"] for row in enabled.data]
    enabled_map = {row["tool_id"]: row["enabled_at"] for row in enabled.data}

    tools = (
        sb.table("tool_repository")
        .select("*")
        .in_("id", tool_ids)
        .execute()
    )

    result = []
    for tool in (tools.data or []):
        tool["enabled_at"] = enabled_map.get(tool["id"])
        result.append(tool)

    return result


@router.post("/agent/{agent_id}/{tool_id}")
async def enable_tool(
    agent_id: str,
    tool_id: str,
    current_user: str = Depends(get_current_user),
):
    """Enable a tool for an agent. Owner only."""
    sb = get_sb()
    require_agent_owner(sb, agent_id, current_user)

    tool = sb.table("tool_repository").select("id").eq("id", tool_id).execute()
    if not tool.data:
        raise HTTPException(status_code=404, detail="Tool not found")

    sb.table("agent_tools").upsert({
        "agent_id": agent_id,
        "tool_id": tool_id,
    }).execute()

    return {"status": "enabled"}


@router.delete("/agent/{agent_id}/{tool_id}")
async def disable_tool(
    agent_id: str,
    tool_id: str,
    current_user: str = Depends(get_current_user),
):
    """Disable a tool for an agent. Owner only."""
    sb = get_sb()
    require_agent_owner(sb, agent_id, current_user)
    sb.table("agent_tools").delete().eq("agent_id", agent_id).eq("tool_id", tool_id).execute()
    return {"status": "disabled"}


@router.post("/agent/{agent_id}/bulk")
async def bulk_enable_tools(
    agent_id: str,
    body: BulkEnableRequest,
    current_user: str = Depends(get_current_user),
):
    """Enable multiple tools at once for an agent. Owner only."""
    sb = get_sb()
    require_agent_owner(sb, agent_id, current_user)

    tools = sb.table("tool_repository").select("id").in_("id", body.tool_ids).execute()
    found_ids = {t["id"] for t in (tools.data or [])}
    missing = set(body.tool_ids) - found_ids
    if missing:
        raise HTTPException(status_code=404, detail=f"Tools not found: {missing}")

    rows = [{"agent_id": agent_id, "tool_id": tid} for tid in body.tool_ids]
    sb.table("agent_tools").upsert(rows).execute()

    return {"status": "enabled", "count": len(body.tool_ids)}
