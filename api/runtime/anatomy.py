"""Anatomy Doctrine — the body-system framework for agent health.

Each agent is described through body systems: Brain (knowledge),
Heart (values), Voice (communication), Gut (intuition), Hands (tools),
Muscle (activity), Connective Tissue (integration), Skin (identity),
Blood (data flow), and Heartbeat (overall health).

No Claude calls — just DB queries and computation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from supabase import create_client

from api.config import settings


# -- Models --

@dataclass
class BodySystem:
    name: str
    status: str  # dormant | developing | active | strong
    health: float  # 0.0 - 1.0
    detail: str  # human-readable explanation


@dataclass
class Heartbeat:
    status: str  # flatline | weak | steady | strong | thriving
    bpm: int  # visual pulse speed (mapped from health)
    health: float


@dataclass
class AgentAnatomy:
    soul: BodySystem
    brain: BodySystem
    heart: BodySystem
    voice: BodySystem
    gut: BodySystem
    hands: BodySystem
    muscle: BodySystem
    connective_tissue: BodySystem
    skin: BodySystem
    blood: BodySystem
    heartbeat: Heartbeat
    overall_health: float


# -- Helpers --

def _status_from_health(health: float) -> str:
    if health < 0.1:
        return "dormant"
    elif health < 0.4:
        return "developing"
    elif health < 0.7:
        return "active"
    return "strong"


def _bpm_from_health(health: float) -> int:
    """Map health 0-1 to a BPM value for visual pulse animation."""
    if health < 0.1:
        return 0
    elif health < 0.3:
        return 40
    elif health < 0.5:
        return 55
    elif health < 0.7:
        return 65
    elif health < 0.85:
        return 72
    return 80


def get_heartbeat_status(anatomy: AgentAnatomy) -> str:
    """Return the heartbeat label from overall health."""
    h = anatomy.overall_health
    if h < 0.2:
        return "flatline"
    elif h < 0.4:
        return "weak"
    elif h < 0.6:
        return "steady"
    elif h < 0.8:
        return "strong"
    return "thriving"


def _sb():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# -- Main computation --

async def get_anatomy(user_id: str, agent_id: str) -> AgentAnatomy:
    """Compute the full anatomy for an agent. Pure DB queries, no Claude calls."""
    sb = _sb()

    # Fetch agent profile
    agent_result = sb.table("agent_profiles").select("*").eq("id", agent_id).execute()
    if not agent_result.data:
        raise ValueError(f"Agent {agent_id} not found")
    agent = agent_result.data[0]

    # Fetch onboarding docs
    docs_result = sb.table("onboarding_docs").select("doc_type,parsed_data").eq("user_id", user_id).execute()
    doc_types = {d["doc_type"] for d in (docs_result.data or [])}
    doc_data = {d["doc_type"]: d["parsed_data"] for d in (docs_result.data or [])}

    # Fetch workspace memberships
    memberships_result = sb.table("workspace_members").select("workspace_id").eq("user_id", user_id).execute()
    workspace_count = len(memberships_result.data or [])

    # Fetch relationships created by this agent
    relationships_result = sb.table("shared_relationships").select("id").eq("created_by_agent", agent_id).execute()
    relationship_count = len(relationships_result.data or [])

    # Fetch entities published by this agent
    entities_result = sb.table("shared_entities").select("id").eq("author_agent_id", agent_id).execute()
    entity_count = len(entities_result.data or [])

    # Fetch recent messages (last 30 days)
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    messages_result = sb.table("messages").select("id,sender_type").eq("agent_id", agent_id).gte("created_at", thirty_days_ago).execute()
    total_messages = len(messages_result.data or [])
    agent_messages = len([m for m in (messages_result.data or []) if m["sender_type"] == "agent"])

    # Fetch tasks completed
    tasks_result = sb.table("agent_tasks").select("id").eq("agent_id", agent_id).eq("status", "done").execute()
    tasks_done = len(tasks_result.data or [])

    # Fetch events processed
    events_result = sb.table("agent_events").select("id").eq("source_agent_id", agent_id).execute()
    event_count = len(events_result.data or [])

    # Fetch North Star
    north_star = None
    try:
        ns_result = sb.table("north_stars").select("*").eq("user_id", user_id).execute()
        if ns_result.data:
            north_star = ns_result.data[0]
    except Exception:
        pass  # Table may not exist yet

    # ---- Compute each system ----

    # SOUL — North Star (mission, principles, vision, non-negotiables)
    soul_health = 0.0
    soul_detail = "No North Star defined yet. Build your North Star to give your agent a soul."
    if north_star:
        parts = 0
        total_parts = 4
        if north_star.get("mission"):
            parts += 1
        principles = north_star.get("principles") or []
        if principles and len(principles) >= 1:
            parts += 1
        if north_star.get("vision"):
            parts += 1
        non_neg = north_star.get("non_negotiables") or []
        if non_neg and len(non_neg) >= 1:
            parts += 1
        soul_health = parts / total_parts
        soul_detail = f"North Star: {parts}/{total_parts} components defined"
        if parts == total_parts:
            soul_detail = f"North Star complete — mission, {len(principles)} principles, vision, {len(non_neg)} non-negotiables"
    soul = BodySystem(
        name="Soul",
        status=_status_from_health(soul_health),
        health=soul_health,
        detail=soul_detail,
    )

    # BRAIN — IDP data (goals, expertise)
    has_idp = "idp" in doc_types
    idp_data = doc_data.get("idp", {}) or {}
    expertise = agent.get("expertise", []) or []
    goals = agent.get("goals", []) or []
    brain_health = 0.0
    if has_idp:
        brain_health = 0.5
        if expertise:
            brain_health += 0.25
        if goals:
            brain_health += 0.25
    brain = BodySystem(
        name="Brain",
        status=_status_from_health(brain_health),
        health=brain_health,
        detail=f"IDP uploaded, {len(expertise)} expertise areas, {len(goals)} goals" if has_idp
        else "No IDP uploaded yet. Upload your Individual Development Plan to activate the Brain.",
    )

    # HEART — Ethics paper (values, ethical framework)
    has_ethics = "ethics" in doc_types
    values = agent.get("values", []) or []
    heart_health = 0.0
    if has_ethics:
        heart_health = 0.5
        if values:
            heart_health += 0.5
    heart = BodySystem(
        name="Heart",
        status=_status_from_health(heart_health),
        health=heart_health,
        detail=f"Ethics uploaded, {len(values)} core values" if has_ethics
        else "No Ethics paper uploaded. Upload it to give your agent a moral compass.",
    )

    # VOICE — Insights profile (personality, communication)
    has_insights = "insights" in doc_types
    personality = agent.get("personality", {}) or {}
    comm_style = agent.get("communication_style")
    voice_health = 0.0
    if has_insights:
        voice_health = 0.5
        if personality.get("primary_color"):
            voice_health += 0.25
        if comm_style:
            voice_health += 0.25
    voice = BodySystem(
        name="Voice",
        status=_status_from_health(voice_health),
        health=voice_health,
        detail=f"Insights uploaded, style: {comm_style or 'neutral'}" if has_insights
        else "No Insights profile uploaded. Upload it so your agent matches your communication style.",
    )

    # GUT — Enrichment answers
    enrichment = agent.get("enrichment_answers") or {}
    gut_health = 0.0
    if enrichment:
        answered = len([v for v in enrichment.values() if v and str(v).strip()])
        total_questions = max(len(enrichment), 6)  # 6 enrichment questions
        gut_health = min(answered / total_questions, 1.0)
    gut = BodySystem(
        name="Gut",
        status=_status_from_health(gut_health),
        health=gut_health,
        detail=f"{len([v for v in enrichment.values() if v and str(v).strip()])} enrichment answers provided" if enrichment
        else "No enrichment answers yet. Answer the deeper context questions from your profile.",
    )

    # HANDS — Tools available (core + enabled repository tools)
    from api.runtime.tool_executor import AGENT_TOOLS
    core_tool_count = len(AGENT_TOOLS)

    # Count enabled repository tools
    enabled_repo_tools = 0
    total_repo_tools = 0
    try:
        repo_result = sb.table("tool_repository").select("id").execute()
        total_repo_tools = len(repo_result.data or [])

        enabled_result = sb.table("agent_tools").select("tool_id").eq("agent_id", agent_id).execute()
        enabled_repo_tools = len(enabled_result.data or [])
    except Exception:
        pass  # Table may not exist yet

    total_tools = core_tool_count + enabled_repo_tools
    max_tools = core_tool_count + max(total_repo_tools, 1)
    hands_health = min(total_tools / max_tools, 1.0)
    hands = BodySystem(
        name="Hands",
        status=_status_from_health(hands_health),
        health=hands_health,
        detail=f"{core_tool_count} core + {enabled_repo_tools} repository tools enabled"
        + (f" (of {total_repo_tools} available)" if total_repo_tools > 0 else ""),
    )

    # MUSCLE — Activity history
    activity_score = min(
        (agent_messages * 0.3 + entity_count * 2.0 + tasks_done * 3.0) / 20.0,
        1.0,
    )
    muscle = BodySystem(
        name="Muscle",
        status=_status_from_health(activity_score),
        health=activity_score,
        detail=f"{agent_messages} messages sent, {entity_count} entities published, {tasks_done} tasks completed",
    )

    # CONNECTIVE TISSUE — Integration (workspaces, relationships)
    integration_score = min(
        (workspace_count * 0.3 + relationship_count * 0.2) / 2.0,
        1.0,
    )
    connective_tissue = BodySystem(
        name="Connective Tissue",
        status=_status_from_health(integration_score),
        health=integration_score,
        detail=f"{workspace_count} workspaces joined, {relationship_count} relationships created",
    )

    # SKIN — Identity (profile completeness)
    skin_parts = 0
    skin_total = 5
    if agent.get("agent_name"):
        skin_parts += 1
    if agent.get("autonomy_level") is not None:
        skin_parts += 1
    if expertise:
        skin_parts += 1
    if values:
        skin_parts += 1
    if comm_style:
        skin_parts += 1
    skin_health = skin_parts / skin_total
    skin = BodySystem(
        name="Skin",
        status=_status_from_health(skin_health),
        health=skin_health,
        detail=f"Profile {int(skin_health * 100)}% complete ({skin_parts}/{skin_total} fields)",
    )

    # BLOOD — Data flow (recent messages, events)
    flow_score = min(
        (total_messages * 0.1 + event_count * 0.2) / 5.0,
        1.0,
    )
    blood = BodySystem(
        name="Blood",
        status=_status_from_health(flow_score),
        health=flow_score,
        detail=f"{total_messages} messages (30d), {event_count} events processed",
    )

    # OVERALL HEALTH — weighted average of all systems
    # Soul gets 0.08 weight — important but not blocking; redistributed from others
    weights = {
        "soul": 0.08,
        "brain": 0.18,
        "heart": 0.14,
        "voice": 0.09,
        "gut": 0.09,
        "hands": 0.05,
        "muscle": 0.13,
        "connective_tissue": 0.10,
        "skin": 0.05,
        "blood": 0.09,
    }
    overall = (
        soul.health * weights["soul"]
        + brain.health * weights["brain"]
        + heart.health * weights["heart"]
        + voice.health * weights["voice"]
        + gut.health * weights["gut"]
        + hands.health * weights["hands"]
        + muscle.health * weights["muscle"]
        + connective_tissue.health * weights["connective_tissue"]
        + skin.health * weights["skin"]
        + blood.health * weights["blood"]
    )
    overall = round(overall, 3)

    anatomy = AgentAnatomy(
        soul=soul,
        brain=brain,
        heart=heart,
        voice=voice,
        gut=gut,
        hands=hands,
        muscle=muscle,
        connective_tissue=connective_tissue,
        skin=skin,
        blood=blood,
        heartbeat=Heartbeat(status="", bpm=0, health=0.0),
        overall_health=overall,
    )

    # Compute heartbeat from overall
    hb_status = get_heartbeat_status(anatomy)
    anatomy.heartbeat = Heartbeat(
        status=hb_status,
        bpm=_bpm_from_health(overall),
        health=overall,
    )

    return anatomy
