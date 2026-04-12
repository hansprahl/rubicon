"""Agent Repository API — build, browse, clone, and rate custom agents."""

from __future__ import annotations

from uuid import UUID

from anthropic import AsyncAnthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.config import settings
from api.db import get_sb

router = APIRouter(prefix="/agent-repo", tags=["agent-repo"])


# ── Pydantic Models ──


class CreateAgentRequest(BaseModel):
    name: str
    description: str
    purpose: str
    expertise: list[str] = []
    tools: list[str] = []
    category: str
    icon: str = "🤖"
    visibility: str = "cohort"
    workspace_id: str | None = None
    doctrine_components: dict = {}


class BuildAgentRequest(BaseModel):
    """Guided builder wizard payload."""
    name: str
    purpose: str
    category: str
    expertise: list[str] = []
    tools: list[str] = []
    visibility: str = "cohort"
    workspace_id: str | None = None
    doctrine_config: dict = {}
    icon: str = "🤖"


class UpdateAgentRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    purpose: str | None = None
    expertise: list[str] | None = None
    tools: list[str] | None = None
    category: str | None = None
    icon: str | None = None
    visibility: str | None = None
    workspace_id: str | None = None
    status: str | None = None
    doctrine_components: dict | None = None


class RateAgentRequest(BaseModel):
    rating: int
    review: str | None = None


# ── Helpers ──


def _get_creator_context(sb, user_id: str) -> str:
    """Fetch the creator's agent profile values/expertise to influence the custom agent."""
    try:
        agent = (
            sb.table("agent_profiles")
            .select("expertise,values,goals,communication_style")
            .eq("user_id", user_id)
            .execute()
        )
        if agent.data:
            profile = agent.data[0]
            parts = []
            if profile.get("values"):
                parts.append(f"Creator's values: {', '.join(profile['values'])}")
            if profile.get("expertise"):
                parts.append(f"Creator's expertise: {', '.join(profile['expertise'])}")
            if profile.get("communication_style"):
                parts.append(f"Creator's communication style: {profile['communication_style']}")
            return "\n".join(parts) if parts else ""
    except Exception:
        pass
    return ""


async def _synthesize_system_prompt(
    name: str,
    purpose: str,
    expertise: list[str],
    tools: list[str],
    category: str,
    doctrine_config: dict,
    creator_context: str,
) -> str:
    """Use Claude to synthesize a professional system prompt for the custom agent."""
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    doctrine_parts = []
    if doctrine_config.get("confidence_scoring"):
        doctrine_parts.append("- Always report confidence scores (0-1) with reasoning for key claims.")
    if doctrine_config.get("knowledge_graph"):
        doctrine_parts.append("- You can publish findings to the shared knowledge graph for others to see.")
    if doctrine_config.get("approval_required"):
        doctrine_parts.append("- All significant actions must go through human approval before execution.")
    if doctrine_config.get("proactive"):
        doctrine_parts.append("- You may proactively suggest actions and insights without being directly asked.")

    doctrine_block = "\n".join(doctrine_parts) if doctrine_parts else "No special Doctrine behaviors configured."

    synthesis_prompt = f"""You are building a system prompt for a custom AI agent on the Rubicon platform (a collaborative digital twin platform for EMBA Cohort 84).

Agent name: {name}
Purpose: {purpose}
Category: {category}
Areas of expertise: {', '.join(expertise) if expertise else 'General'}
Available tools: {', '.join(tools) if tools else 'None specified'}

Doctrine configuration:
{doctrine_block}

{f"Creator context (use to subtly influence the agent's personality):{chr(10)}{creator_context}" if creator_context else ""}

Write a professional, detailed system prompt for this agent. The prompt should:
1. Clearly define the agent's role and purpose
2. Specify its areas of expertise
3. Describe how it should interact with users (professional, helpful, expert)
4. Include any Doctrine behaviors (confidence scoring, knowledge graph, approval, proactivity)
5. Be specific about what the agent CAN and CANNOT do
6. Include guidance on when to recommend escalation to human experts

Keep the prompt under 800 words. Write ONLY the system prompt text, no preamble or explanation."""

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1200,
        messages=[{"role": "user", "content": synthesis_prompt}],
    )
    return response.content[0].text


def _notify_cohort(sb, agent_id: str, agent_name: str, description: str, creator_id: str):
    """Send a What's New notification to all cohort members."""
    try:
        # Get creator's display name
        creator = sb.table("users").select("display_name").eq("id", creator_id).execute()
        creator_name = creator.data[0]["display_name"] if creator.data else "A cohort member"

        # Get all user IDs except the creator
        users = sb.table("users").select("id").neq("id", creator_id).execute()
        if not users.data:
            return

        notifications = [
            {
                "user_id": u["id"],
                "title": f"New Agent: {agent_name}",
                "body": f"{creator_name} created a new agent: {description}",
                "category": "info",
                "link": f"/agent-repo/{agent_id}",
            }
            for u in users.data
        ]

        # Batch insert notifications
        sb.table("notifications").insert(notifications).execute()
    except Exception:
        # Don't fail the agent creation if notifications fail
        pass


# ── Endpoints ──


@router.get("")
async def list_agents(
    category: str | None = None,
    visibility: str | None = None,
    search: str | None = None,
    sort: str = "newest",
    user_id: str | None = None,
):
    """List custom agents with filtering and sorting."""
    sb = get_sb()
    query = sb.table("custom_agents").select("*, users!custom_agents_created_by_fkey(display_name)")

    # Only show active agents by default
    query = query.eq("status", "active")

    if category:
        query = query.eq("category", category)

    if visibility:
        query = query.eq("visibility", visibility)

    if search:
        query = query.or_(f"name.ilike.%{search}%,description.ilike.%{search}%,purpose.ilike.%{search}%")

    # Sorting
    if sort == "newest":
        query = query.order("created_at", desc=True)
    elif sort == "most_cloned":
        query = query.order("clone_count", desc=True)
    elif sort == "highest_rated":
        query = query.order("rating_sum", desc=True)  # Rough proxy; real avg computed client-side

    result = query.execute()

    # Enrich with creator display name
    agents = []
    for row in (result.data or []):
        users_data = row.pop("users", None)
        row["creator_name"] = users_data.get("display_name", "Unknown") if users_data else "Unknown"
        agents.append(row)

    return agents


@router.get("/categories")
async def list_categories():
    """List categories with counts."""
    sb = get_sb()
    result = sb.table("custom_agents").select("category").eq("status", "active").execute()
    counts: dict[str, int] = {}
    for row in (result.data or []):
        cat = row["category"]
        counts[cat] = counts.get(cat, 0) + 1
    return [{"category": k, "count": v} for k, v in sorted(counts.items())]


@router.get("/my-agents")
async def my_agents(user_id: str):
    """List agents created by the current user (all statuses)."""
    sb = get_sb()
    result = (
        sb.table("custom_agents")
        .select("*")
        .eq("created_by", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.get("/my-enabled")
async def my_enabled_agents(user_id: str):
    """List agents the user has enabled/cloned."""
    sb = get_sb()
    # Get the junction table entries
    enabled = (
        sb.table("user_custom_agents")
        .select("custom_agent_id,enabled_at")
        .eq("user_id", user_id)
        .execute()
    )
    if not enabled.data:
        return []

    agent_ids = [row["custom_agent_id"] for row in enabled.data]
    enabled_map = {row["custom_agent_id"]: row["enabled_at"] for row in enabled.data}

    agents = (
        sb.table("custom_agents")
        .select("*, users!custom_agents_created_by_fkey(display_name)")
        .in_("id", agent_ids)
        .execute()
    )

    result = []
    for row in (agents.data or []):
        users_data = row.pop("users", None)
        row["creator_name"] = users_data.get("display_name", "Unknown") if users_data else "Unknown"
        row["enabled_at"] = enabled_map.get(row["id"])
        result.append(row)

    return result


@router.get("/{agent_id}")
async def get_agent(agent_id: str):
    """Get a single custom agent with full details."""
    sb = get_sb()
    result = (
        sb.table("custom_agents")
        .select("*, users!custom_agents_created_by_fkey(display_name)")
        .eq("id", agent_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Custom agent not found")

    agent = result.data[0]
    users_data = agent.pop("users", None)
    agent["creator_name"] = users_data.get("display_name", "Unknown") if users_data else "Unknown"

    # Get ratings
    ratings = (
        sb.table("agent_ratings")
        .select("*, users!agent_ratings_user_id_fkey(display_name)")
        .eq("custom_agent_id", agent_id)
        .order("created_at", desc=True)
        .execute()
    )
    reviews = []
    for r in (ratings.data or []):
        r_users = r.pop("users", None)
        r["reviewer_name"] = r_users.get("display_name", "Unknown") if r_users else "Unknown"
        reviews.append(r)

    agent["reviews"] = reviews

    return agent


@router.post("")
async def create_agent(body: CreateAgentRequest, user_id: str):
    """Create a new custom agent."""
    sb = get_sb()

    # Get creator context for prompt personalization
    creator_context = _get_creator_context(sb, user_id)

    # Synthesize system prompt using Claude
    system_prompt = await _synthesize_system_prompt(
        name=body.name,
        purpose=body.purpose,
        expertise=body.expertise,
        tools=body.tools,
        category=body.category,
        doctrine_config=body.doctrine_components,
        creator_context=creator_context,
    )

    # Insert the agent
    row = {
        "created_by": user_id,
        "name": body.name,
        "description": body.description,
        "purpose": body.purpose,
        "expertise": body.expertise,
        "system_prompt": system_prompt,
        "tools": body.tools,
        "category": body.category,
        "icon": body.icon,
        "visibility": body.visibility,
        "workspace_id": body.workspace_id,
        "doctrine_components": body.doctrine_components,
    }

    result = sb.table("custom_agents").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create custom agent")

    agent = result.data[0]

    # Send What's New notification if cohort-visible
    if body.visibility == "cohort":
        _notify_cohort(sb, agent["id"], body.name, body.description, user_id)

    return agent


@router.post("/build")
async def build_agent(body: BuildAgentRequest, user_id: str):
    """Guided builder endpoint — synthesizes description + system prompt from wizard data."""
    sb = get_sb()

    # Get creator context
    creator_context = _get_creator_context(sb, user_id)

    # Generate description from purpose
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    desc_response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=200,
        messages=[{
            "role": "user",
            "content": f"Write a concise 1-2 sentence description for an AI agent named '{body.name}' whose purpose is: {body.purpose}. Category: {body.category}. Write ONLY the description, no preamble.",
        }],
    )
    description = desc_response.content[0].text.strip()

    # Map doctrine_config to doctrine_components format
    doctrine_components = {}
    for key in ("confidence_scoring", "knowledge_graph", "approval_required", "proactive"):
        if body.doctrine_config.get(key):
            doctrine_components[key] = True

    # Synthesize system prompt
    system_prompt = await _synthesize_system_prompt(
        name=body.name,
        purpose=body.purpose,
        expertise=body.expertise,
        tools=body.tools,
        category=body.category,
        doctrine_config=body.doctrine_config,
        creator_context=creator_context,
    )

    # Insert
    row = {
        "created_by": user_id,
        "name": body.name,
        "description": description,
        "purpose": body.purpose,
        "expertise": body.expertise,
        "system_prompt": system_prompt,
        "tools": body.tools,
        "category": body.category,
        "icon": body.icon,
        "visibility": body.visibility,
        "workspace_id": body.workspace_id,
        "doctrine_components": doctrine_components,
    }

    result = sb.table("custom_agents").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create custom agent")

    agent = result.data[0]

    # What's New notifications
    if body.visibility == "cohort":
        _notify_cohort(sb, agent["id"], body.name, description, user_id)

    return agent


@router.patch("/{agent_id}")
async def update_agent(agent_id: str, body: UpdateAgentRequest, user_id: str):
    """Update a custom agent (owner only)."""
    sb = get_sb()

    # Verify ownership
    existing = sb.table("custom_agents").select("created_by").eq("id", agent_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Custom agent not found")
    if existing.data[0]["created_by"] != user_id:
        raise HTTPException(status_code=403, detail="Only the creator can update this agent")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = "now()"

    result = sb.table("custom_agents").update(updates).eq("id", agent_id).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Update failed")
    return result.data[0]


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str, user_id: str):
    """Archive a custom agent (owner only). Soft delete via status change."""
    sb = get_sb()

    existing = sb.table("custom_agents").select("created_by").eq("id", agent_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Custom agent not found")
    if existing.data[0]["created_by"] != user_id:
        raise HTTPException(status_code=403, detail="Only the creator can archive this agent")

    sb.table("custom_agents").update({"status": "archived", "updated_at": "now()"}).eq("id", agent_id).execute()
    return {"status": "archived"}


@router.post("/{agent_id}/clone")
async def clone_agent(agent_id: str, user_id: str):
    """Enable/clone a custom agent for your account."""
    sb = get_sb()

    # Verify agent exists and is active
    agent = sb.table("custom_agents").select("id,name,clone_count").eq("id", agent_id).eq("status", "active").execute()
    if not agent.data:
        raise HTTPException(status_code=404, detail="Custom agent not found or not active")

    # Upsert into user_custom_agents
    sb.table("user_custom_agents").upsert({
        "user_id": user_id,
        "custom_agent_id": agent_id,
    }).execute()

    # Increment clone count
    new_count = (agent.data[0].get("clone_count") or 0) + 1
    sb.table("custom_agents").update({"clone_count": new_count}).eq("id", agent_id).execute()

    return {"status": "enabled", "clone_count": new_count}


@router.delete("/{agent_id}/clone")
async def unclone_agent(agent_id: str, user_id: str):
    """Disable/remove a cloned custom agent."""
    sb = get_sb()
    sb.table("user_custom_agents").delete().eq("user_id", user_id).eq("custom_agent_id", agent_id).execute()

    # Decrement clone count (floor at 0)
    agent = sb.table("custom_agents").select("clone_count").eq("id", agent_id).execute()
    if agent.data:
        new_count = max(0, (agent.data[0].get("clone_count") or 1) - 1)
        sb.table("custom_agents").update({"clone_count": new_count}).eq("id", agent_id).execute()

    return {"status": "disabled"}


@router.post("/{agent_id}/rate")
async def rate_agent(agent_id: str, body: RateAgentRequest, user_id: str):
    """Rate a custom agent (1-5 stars + optional review)."""
    sb = get_sb()

    if body.rating < 1 or body.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    # Verify agent exists
    agent = sb.table("custom_agents").select("id,rating_sum,rating_count").eq("id", agent_id).execute()
    if not agent.data:
        raise HTTPException(status_code=404, detail="Custom agent not found")

    # Check if user already rated
    existing_rating = (
        sb.table("agent_ratings")
        .select("id,rating")
        .eq("user_id", user_id)
        .eq("custom_agent_id", agent_id)
        .execute()
    )

    old_rating = 0
    if existing_rating.data:
        old_rating = existing_rating.data[0]["rating"]
        # Update existing rating
        sb.table("agent_ratings").update({
            "rating": body.rating,
            "review": body.review,
        }).eq("id", existing_rating.data[0]["id"]).execute()
    else:
        # Insert new rating
        sb.table("agent_ratings").insert({
            "user_id": user_id,
            "custom_agent_id": agent_id,
            "rating": body.rating,
            "review": body.review,
        }).execute()

    # Update aggregate rating on the agent
    current_sum = agent.data[0].get("rating_sum") or 0
    current_count = agent.data[0].get("rating_count") or 0

    if existing_rating.data:
        new_sum = current_sum - old_rating + body.rating
        new_count = current_count
    else:
        new_sum = current_sum + body.rating
        new_count = current_count + 1

    sb.table("custom_agents").update({
        "rating_sum": new_sum,
        "rating_count": new_count,
    }).eq("id", agent_id).execute()

    avg = new_sum / new_count if new_count > 0 else 0
    return {"status": "rated", "average_rating": round(avg, 2), "rating_count": new_count}
