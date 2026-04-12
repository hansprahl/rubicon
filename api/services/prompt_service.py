"""Shared prompt rebuild logic — used by onboarding and north_star routes."""

from __future__ import annotations

from api.runtime.prompt_builder import build_progressive_prompt, calculate_fidelity


async def rebuild_agent_prompt(sb, user_id: str) -> None:
    """Rebuild the agent's system prompt from all currently uploaded docs."""
    agent_result = sb.table("agent_profiles").select("*").eq("user_id", user_id).execute()
    if not agent_result.data:
        return  # No agent yet — will be rebuilt when agent is created

    agent = agent_result.data[0]

    user_result = sb.table("users").select("display_name").eq("id", user_id).execute()
    display_name = user_result.data[0]["display_name"] if user_result.data else "Unknown"

    docs_result = sb.table("onboarding_docs").select("*").eq("user_id", user_id).execute()
    docs_by_type = {doc["doc_type"]: doc["parsed_data"] for doc in docs_result.data}

    idp_data = docs_by_type.get("idp")
    ethics_data = docs_by_type.get("ethics")
    insights_data = docs_by_type.get("insights")
    enrichment = agent.get("enrichment_answers") or {}
    enrichment = enrichment if enrichment != {} else None
    google_services = agent.get("google_services") or []

    north_star_data = None
    try:
        ns_result = sb.table("north_stars").select("*").eq("user_id", user_id).execute()
        if ns_result.data:
            north_star_data = ns_result.data[0]
    except Exception:
        pass

    new_prompt = build_progressive_prompt(
        display_name=display_name,
        agent_name=agent["agent_name"],
        idp_data=idp_data,
        ethics_data=ethics_data,
        insights_data=insights_data,
        enrichment_answers=enrichment,
        google_services=google_services if google_services else None,
        north_star=north_star_data,
    )

    fidelity = calculate_fidelity(
        has_idp=bool(idp_data),
        has_ethics=bool(ethics_data),
        has_insights=bool(insights_data),
        has_enrichment=bool(enrichment),
        has_google=bool(google_services),
    )

    update_data: dict = {
        "system_prompt": new_prompt,
        "fidelity": fidelity,
    }

    if idp_data:
        update_data["expertise"] = idp_data.get("expertise", []) + idp_data.get("leadership_priorities", [])
        update_data["goals"] = idp_data.get("goals", []) + idp_data.get("development_areas", [])

    if ethics_data:
        update_data["values"] = ethics_data.get("values", []) + ethics_data.get("key_principles", [])

    if insights_data:
        update_data["personality"] = {
            "primary_color": insights_data.get("primary_color", ""),
            "secondary_color": insights_data.get("secondary_color", ""),
            "color_scores": insights_data.get("color_scores", {}),
            "strengths": insights_data.get("strengths", []),
            "personality_summary": insights_data.get("personality_summary", ""),
        }
        update_data["communication_style"] = insights_data.get("communication_style", "")

    sb.table("agent_profiles").update(update_data).eq("id", agent["id"]).execute()
