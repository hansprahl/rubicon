"""Rubicon Intelligence — the platform's intelligence layer.

Monitors usage patterns across the cohort, generates personalized suggestions,
and compiles What's New digests. Mostly DB queries, minimal Claude calls.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from supabase import create_client

from api.config import settings


def _sb():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# ── Max active suggestions per user ──
MAX_SUGGESTIONS_PER_USER = 5


# ═══════════════════════════════════════════════════
# 1. USER SUGGESTIONS
# ═══════════════════════════════════════════════════

async def generate_user_suggestions(user_id: str) -> list[dict]:
    """Generate personalized suggestions for a specific user.

    Returns: [{"type": ..., "title": ..., "body": ..., "action_url": ..., "priority": int}]
    """
    sb = _sb()
    suggestions: list[dict] = []

    # Fetch agent profile
    agent_result = sb.table("agent_profiles").select("*").eq("user_id", user_id).execute()
    if not agent_result.data:
        return suggestions
    agent = agent_result.data[0]
    agent_id = agent["id"]

    # Fetch onboarding docs
    docs_result = sb.table("onboarding_docs").select("doc_type").eq("user_id", user_id).execute()
    doc_types = {d["doc_type"] for d in (docs_result.data or [])}

    # Fetch North Star
    north_star = None
    try:
        ns_result = sb.table("north_stars").select("id").eq("user_id", user_id).execute()
        if ns_result.data:
            north_star = ns_result.data[0]
    except Exception:
        pass

    # Fetch existing non-dismissed suggestions to avoid duplicates
    existing = sb.table("intelligence_suggestions").select("suggestion_type,title").eq(
        "user_id", user_id
    ).eq("dismissed", False).execute()
    existing_keys = {(s["suggestion_type"], s["title"]) for s in (existing.data or [])}

    def _add(stype: str, title: str, body: str, action_url: str, priority: int):
        if (stype, title) not in existing_keys and len(suggestions) < MAX_SUGGESTIONS_PER_USER:
            suggestions.append({
                "type": stype,
                "title": title,
                "body": body,
                "action_url": action_url,
                "priority": priority,
            })

    # ── Check 1: Fidelity < 70% — suggest uploading missing docs ──
    fidelity = agent.get("fidelity") or 0
    if fidelity < 0.7:
        if "idp" not in doc_types:
            _add(
                "fidelity",
                "Upload your IDP to give your agent a Brain",
                "Your Individual Development Plan teaches your agent about your goals, expertise, and growth areas.",
                "/profile",
                100,
            )
        if "ethics" not in doc_types:
            _add(
                "fidelity",
                "Upload your Ethics paper to give your agent a Heart",
                "Your Ethics paper teaches your agent your values and moral compass.",
                "/profile",
                95,
            )
        if "insights" not in doc_types:
            _add(
                "fidelity",
                "Upload your Insights profile to give your agent a Voice",
                "Your Insights profile teaches your agent your communication style and personality.",
                "/profile",
                90,
            )
        enrichment = agent.get("enrichment_answers") or {}
        answered = len([v for v in enrichment.values() if v and str(v).strip()])
        if answered < 4:
            _add(
                "fidelity",
                "Answer the deeper context questions",
                f"You've answered {answered} enrichment questions. Fill in more to sharpen your agent's intuition.",
                "/profile",
                85,
            )

    # ── Check 2: No North Star ──
    if not north_star:
        _add(
            "north_star",
            "Build your North Star",
            "Your agent doesn't have a Soul yet. Build your North Star to anchor its decisions around your mission and principles.",
            "/north-star",
            92,
        )

    # ── Check 3: Tool gaps — popular tools in user's workspaces that user hasn't enabled ──
    try:
        # Get user's workspaces
        memberships = sb.table("workspace_members").select("workspace_id").eq("user_id", user_id).execute()
        workspace_ids = [m["workspace_id"] for m in (memberships.data or [])]

        if workspace_ids:
            # Get tools enabled by other members of those workspaces
            other_members = (
                sb.table("workspace_members")
                .select("user_id")
                .in_("workspace_id", workspace_ids)
                .neq("user_id", user_id)
                .execute()
            )
            other_user_ids = list({m["user_id"] for m in (other_members.data or [])})

            if other_user_ids:
                # Get other members' agent IDs
                other_agents = (
                    sb.table("agent_profiles")
                    .select("id")
                    .in_("user_id", other_user_ids)
                    .execute()
                )
                other_agent_ids = [a["id"] for a in (other_agents.data or [])]

                if other_agent_ids:
                    # Count tool usage among workspace peers
                    peer_tools = (
                        sb.table("agent_tools")
                        .select("tool_id")
                        .in_("agent_id", other_agent_ids)
                        .execute()
                    )
                    tool_counts: dict[str, int] = {}
                    for t in (peer_tools.data or []):
                        tool_counts[t["tool_id"]] = tool_counts.get(t["tool_id"], 0) + 1

                    # Get user's enabled tools
                    my_tools = (
                        sb.table("agent_tools")
                        .select("tool_id")
                        .eq("agent_id", agent_id)
                        .execute()
                    )
                    my_tool_ids = {t["tool_id"] for t in (my_tools.data or [])}

                    # Find popular tools user is missing (used by 2+ peers)
                    missing_popular = [
                        (tid, cnt) for tid, cnt in tool_counts.items()
                        if tid not in my_tool_ids and cnt >= 2
                    ]
                    missing_popular.sort(key=lambda x: -x[1])

                    if missing_popular:
                        # Get tool details for the top missing one
                        top_tool_id = missing_popular[0][0]
                        top_count = missing_popular[0][1]
                        tool_info = (
                            sb.table("tool_repository")
                            .select("name,display_name")
                            .eq("id", top_tool_id)
                            .execute()
                        )
                        if tool_info.data:
                            tool_name = tool_info.data[0]["display_name"]
                            _add(
                                "tool",
                                f"Enable the {tool_name} tool",
                                f"{top_count} of your workspace peers use this tool. Consider enabling it for your agent.",
                                "/tools",
                                70,
                            )
    except Exception:
        pass  # Tool gap check is best-effort

    # ── Check 4: Trending custom agents ──
    try:
        seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        trending = (
            sb.table("custom_agents")
            .select("id,name,clone_count")
            .eq("visibility", "cohort")
            .eq("status", "active")
            .gte("clone_count", 3)
            .order("clone_count", desc=True)
            .limit(5)
            .execute()
        )
        if trending.data:
            # Check which ones the user hasn't cloned
            my_clones = (
                sb.table("user_custom_agents")
                .select("custom_agent_id")
                .eq("user_id", user_id)
                .execute()
            )
            my_clone_ids = {c["custom_agent_id"] for c in (my_clones.data or [])}

            for ca in trending.data:
                if ca["id"] not in my_clone_ids:
                    _add(
                        "agent",
                        f"Check out {ca['name']}",
                        f"This agent has been cloned {ca['clone_count']} times by your cohort. See if it can help you.",
                        f"/agent-repo/{ca['id']}",
                        60,
                    )
                    break  # Only suggest the top one
    except Exception:
        pass

    # ── Check 5: Inactive workspaces ──
    try:
        if workspace_ids:
            seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            for ws_id in workspace_ids[:5]:  # Cap at 5 workspace checks
                recent_msgs = (
                    sb.table("messages")
                    .select("id", count="exact")
                    .eq("workspace_id", ws_id)
                    .gte("created_at", seven_days_ago)
                    .limit(1)
                    .execute()
                )
                if (recent_msgs.count or 0) == 0:
                    ws_info = sb.table("workspaces").select("name").eq("id", ws_id).execute()
                    if ws_info.data:
                        _add(
                            "workspace",
                            f"Re-engage with {ws_info.data[0]['name']}",
                            "This workspace has been quiet for over a week. Post an update or ask your agent to analyze recent progress.",
                            f"/workspaces/{ws_id}",
                            40,
                        )
                        break  # Only suggest one inactive workspace
    except Exception:
        pass

    return suggestions


# ═══════════════════════════════════════════════════
# 2. COHORT DIGEST
# ═══════════════════════════════════════════════════

async def generate_cohort_digest() -> dict:
    """Generate a What's New digest for the cohort."""
    sb = _sb()
    seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    # New custom agents created in last 7 days
    new_agents_result = (
        sb.table("custom_agents")
        .select("id,name,created_by,visibility")
        .eq("visibility", "cohort")
        .eq("status", "active")
        .gte("created_at", seven_days_ago)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )
    new_agents = []
    for ca in (new_agents_result.data or []):
        # Get creator name
        creator = sb.table("users").select("display_name").eq("id", ca["created_by"]).execute()
        creator_name = creator.data[0]["display_name"] if creator.data else "Unknown"
        new_agents.append({
            "name": ca["name"],
            "creator": creator_name,
            "id": ca["id"],
        })

    # Trending tools — most enabled across all agents
    all_agent_tools = sb.table("agent_tools").select("tool_id").execute()
    tool_usage: dict[str, int] = {}
    for at in (all_agent_tools.data or []):
        tool_usage[at["tool_id"]] = tool_usage.get(at["tool_id"], 0) + 1

    trending_tools = []
    if tool_usage:
        sorted_tools = sorted(tool_usage.items(), key=lambda x: -x[1])[:10]
        tool_ids = [t[0] for t in sorted_tools]
        tool_details = sb.table("tool_repository").select("id,name,display_name").in_("id", tool_ids).execute()
        tool_map = {t["id"]: t for t in (tool_details.data or [])}
        for tid, count in sorted_tools:
            if tid in tool_map:
                trending_tools.append({
                    "name": tool_map[tid]["name"],
                    "display_name": tool_map[tid]["display_name"],
                    "usage_count": count,
                })

    # Active workspaces — most messages in last 7 days
    # Get all workspace messages in period
    recent_messages = (
        sb.table("messages")
        .select("workspace_id")
        .not_.is_("workspace_id", "null")
        .gte("created_at", seven_days_ago)
        .execute()
    )
    ws_msg_counts: dict[str, int] = {}
    for m in (recent_messages.data or []):
        ws_id = m["workspace_id"]
        if ws_id:
            ws_msg_counts[ws_id] = ws_msg_counts.get(ws_id, 0) + 1

    active_workspaces = []
    if ws_msg_counts:
        sorted_ws = sorted(ws_msg_counts.items(), key=lambda x: -x[1])[:5]
        ws_ids = [w[0] for w in sorted_ws]
        ws_details = sb.table("workspaces").select("id,name").in_("id", ws_ids).execute()
        ws_map = {w["id"]: w for w in (ws_details.data or [])}
        for ws_id, count in sorted_ws:
            if ws_id in ws_map:
                active_workspaces.append({
                    "name": ws_map[ws_id]["name"],
                    "id": ws_id,
                    "message_count": count,
                })

    # Suggested creations — simple heuristic: categories with no custom agents
    all_categories = {"strategy", "operations", "finance", "marketing", "hr", "technology", "legal", "custom"}
    existing_cats = set()
    try:
        cats = sb.table("custom_agents").select("category").eq("status", "active").execute()
        existing_cats = {c["category"] for c in (cats.data or [])}
    except Exception:
        pass
    missing_cats = all_categories - existing_cats
    suggested_creations = [
        f"No one has created a {cat.title()} agent yet — could be useful for the cohort."
        for cat in sorted(missing_cats)
    ][:3]

    return {
        "new_agents": new_agents,
        "trending_tools": trending_tools,
        "active_workspaces": active_workspaces,
        "suggested_creations": suggested_creations,
    }


# ═══════════════════════════════════════════════════
# 3. COHORT TRENDS
# ═══════════════════════════════════════════════════

async def get_cohort_trends() -> dict:
    """Get cohort-wide trend data."""
    sb = _sb()

    # Top tools by enabled count
    all_agent_tools = sb.table("agent_tools").select("tool_id").execute()
    tool_counts: dict[str, int] = {}
    for at in (all_agent_tools.data or []):
        tool_counts[at["tool_id"]] = tool_counts.get(at["tool_id"], 0) + 1

    top_tools = []
    if tool_counts:
        sorted_tools = sorted(tool_counts.items(), key=lambda x: -x[1])[:10]
        tool_ids = [t[0] for t in sorted_tools]
        tool_details = sb.table("tool_repository").select("id,name,display_name").in_("id", tool_ids).execute()
        tool_map = {t["id"]: t for t in (tool_details.data or [])}
        for tid, count in sorted_tools:
            if tid in tool_map:
                top_tools.append({
                    "name": tool_map[tid]["name"],
                    "display_name": tool_map[tid]["display_name"],
                    "enabled_count": count,
                })

    # Active workspaces with member counts and recent messages
    seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    workspaces = sb.table("workspaces").select("id,name").execute()
    active_workspaces = []
    for ws in (workspaces.data or []):
        members = sb.table("workspace_members").select("user_id", count="exact").eq("workspace_id", ws["id"]).execute()
        msgs = (
            sb.table("messages")
            .select("id", count="exact")
            .eq("workspace_id", ws["id"])
            .gte("created_at", seven_days_ago)
            .execute()
        )
        member_count = members.count or 0
        msg_count = msgs.count or 0
        if member_count > 0:
            active_workspaces.append({
                "name": ws["name"],
                "id": ws["id"],
                "member_count": member_count,
                "recent_messages": msg_count,
            })
    active_workspaces.sort(key=lambda x: -x["recent_messages"])
    active_workspaces = active_workspaces[:10]

    # Trending agents
    trending_agents_result = (
        sb.table("custom_agents")
        .select("id,name,clone_count,rating_sum,rating_count")
        .eq("visibility", "cohort")
        .eq("status", "active")
        .order("clone_count", desc=True)
        .limit(10)
        .execute()
    )
    trending_agents = []
    for ca in (trending_agents_result.data or []):
        avg_rating = (ca["rating_sum"] / ca["rating_count"]) if ca["rating_count"] > 0 else 0
        trending_agents.append({
            "name": ca["name"],
            "id": ca["id"],
            "clone_count": ca["clone_count"],
            "avg_rating": round(avg_rating, 1),
        })

    # Cohort stats
    total_users_result = sb.table("users").select("id", count="exact").execute()
    total_users = total_users_result.count or 0

    ns_result = sb.table("north_stars").select("id", count="exact").execute()
    agents_with_ns = ns_result.count or 0

    agents = sb.table("agent_profiles").select("fidelity").execute()
    fidelities = [a["fidelity"] for a in (agents.data or []) if a.get("fidelity") is not None]
    avg_fidelity = round(sum(fidelities) / len(fidelities), 2) if fidelities else 0

    custom_agent_count = sb.table("custom_agents").select("id", count="exact").eq("status", "active").execute()
    total_custom = custom_agent_count.count or 0

    return {
        "top_tools": top_tools,
        "active_workspaces": active_workspaces,
        "trending_agents": trending_agents,
        "cohort_stats": {
            "total_users": total_users,
            "agents_with_north_star": agents_with_ns,
            "avg_fidelity": avg_fidelity,
            "total_custom_agents": total_custom,
        },
    }


# ═══════════════════════════════════════════════════
# 4. CHECK & NOTIFY
# ═══════════════════════════════════════════════════

async def check_and_notify(user_id: str | None = None):
    """Run intelligence checks and persist suggestions to DB.

    If user_id is None, runs for all users.
    """
    sb = _sb()

    if user_id:
        user_ids = [user_id]
    else:
        users_result = sb.table("users").select("id").execute()
        user_ids = [u["id"] for u in (users_result.data or [])]

    total_created = 0
    for uid in user_ids:
        suggestions = await generate_user_suggestions(uid)

        # Get existing non-dismissed suggestions for this user
        existing = (
            sb.table("intelligence_suggestions")
            .select("suggestion_type,title")
            .eq("user_id", uid)
            .eq("dismissed", False)
            .execute()
        )
        existing_keys = {(s["suggestion_type"], s["title"]) for s in (existing.data or [])}

        for s in suggestions:
            key = (s["type"], s["title"])
            if key not in existing_keys:
                sb.table("intelligence_suggestions").insert({
                    "user_id": uid,
                    "suggestion_type": s["type"],
                    "title": s["title"],
                    "body": s["body"],
                    "action_url": s["action_url"],
                    "priority": s["priority"],
                }).execute()
                total_created += 1

    return {"users_checked": len(user_ids), "suggestions_created": total_created}
