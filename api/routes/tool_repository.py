"""Tool Repository API — browse, enable/disable tools for agents."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.db import get_sb

router = APIRouter(prefix="/tools", tags=["tools"])


# -- Models --

class BulkEnableRequest(BaseModel):
    tool_ids: list[str]


# -- Endpoints --

@router.get("")
async def list_tools(category: str | None = None):
    """List all tools in the repository, optionally filtered by category."""
    sb = get_sb()
    query = sb.table("tool_repository").select("*").order("category").order("name")
    if category:
        query = query.eq("category", category)
    result = query.execute()
    return result.data or []


@router.get("/categories")
async def list_categories():
    """List all categories with tool counts."""
    sb = get_sb()
    result = sb.table("tool_repository").select("category").execute()
    counts: dict[str, int] = {}
    for row in (result.data or []):
        cat = row["category"]
        counts[cat] = counts.get(cat, 0) + 1
    return [{"category": k, "count": v} for k, v in sorted(counts.items())]


@router.get("/{tool_id}")
async def get_tool(tool_id: str):
    """Get a single tool's details."""
    sb = get_sb()
    result = sb.table("tool_repository").select("*").eq("id", tool_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Tool not found")
    return result.data[0]


@router.get("/agent/{agent_id}")
async def get_agent_tools(agent_id: str):
    """List tools enabled for a specific agent."""
    sb = get_sb()
    # Join through agent_tools to get full tool data
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

    # Add enabled_at to each tool
    result = []
    for tool in (tools.data or []):
        tool["enabled_at"] = enabled_map.get(tool["id"])
        result.append(tool)

    return result


@router.post("/agent/{agent_id}/{tool_id}")
async def enable_tool(agent_id: str, tool_id: str):
    """Enable a tool for an agent."""
    sb = get_sb()

    # Verify agent exists
    agent = sb.table("agent_profiles").select("id").eq("id", agent_id).execute()
    if not agent.data:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Verify tool exists
    tool = sb.table("tool_repository").select("id").eq("id", tool_id).execute()
    if not tool.data:
        raise HTTPException(status_code=404, detail="Tool not found")

    # Upsert (idempotent enable)
    sb.table("agent_tools").upsert({
        "agent_id": agent_id,
        "tool_id": tool_id,
    }).execute()

    return {"status": "enabled"}


@router.delete("/agent/{agent_id}/{tool_id}")
async def disable_tool(agent_id: str, tool_id: str):
    """Disable a tool for an agent."""
    sb = get_sb()
    sb.table("agent_tools").delete().eq("agent_id", agent_id).eq("tool_id", tool_id).execute()
    return {"status": "disabled"}


@router.post("/agent/{agent_id}/bulk")
async def bulk_enable_tools(agent_id: str, body: BulkEnableRequest):
    """Enable multiple tools at once for an agent."""
    sb = get_sb()

    # Verify agent exists
    agent = sb.table("agent_profiles").select("id").eq("id", agent_id).execute()
    if not agent.data:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Verify all tools exist
    tools = sb.table("tool_repository").select("id").in_("id", body.tool_ids).execute()
    found_ids = {t["id"] for t in (tools.data or [])}
    missing = set(body.tool_ids) - found_ids
    if missing:
        raise HTTPException(status_code=404, detail=f"Tools not found: {missing}")

    # Upsert all
    rows = [{"agent_id": agent_id, "tool_id": tid} for tid in body.tool_ids]
    sb.table("agent_tools").upsert(rows).execute()

    return {"status": "enabled", "count": len(body.tool_ids)}


