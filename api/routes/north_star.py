"""North Star API — the soul layer of each agent.

Guided synthesis combines uploaded doc data + user answers + Claude
to produce a mission, principles, vision, and non-negotiables.
"""

from __future__ import annotations

import json
from uuid import UUID

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth import assert_is_caller, get_current_user
from api.config import settings
from api.db import get_sb

router = APIRouter(prefix="/north-star", tags=["north-star"])

MODEL = "claude-sonnet-4-20250514"


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class NorthStarUpdate(BaseModel):
    mission: str
    principles: list[dict] = []  # [{title, description}]
    vision: str | None = None
    non_negotiables: list[str] = []


class GuidedAnswers(BaseModel):
    answers: dict[str, str]  # question_id → answer text


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_user_docs(sb, user_id: str) -> dict[str, dict]:
    result = sb.table("onboarding_docs").select("doc_type,parsed_data").eq("user_id", user_id).execute()
    return {d["doc_type"]: d["parsed_data"] for d in (result.data or [])}


def _get_enrichment(sb, user_id: str) -> dict:
    result = sb.table("agent_profiles").select("enrichment_answers").eq("user_id", user_id).execute()
    if result.data and result.data[0].get("enrichment_answers"):
        return result.data[0]["enrichment_answers"]
    return {}


def _build_guided_questions(docs: dict[str, dict], enrichment: dict) -> list[dict]:
    questions = [
        {
            "id": "stand_for",
            "question": "In one sentence, what do you want your professional life to stand for?",
            "required": True,
        },
        {
            "id": "never_compromise",
            "question": "What principle would you never compromise, even if it cost you money or status?",
            "required": True,
        },
        {
            "id": "looking_back",
            "question": "When you're 70, looking back, what would make you say 'I did it right'?",
            "required": True,
        },
        {
            "id": "world_problem",
            "question": "What problem in the world do you want to have helped solve?",
            "required": True,
        },
        {
            "id": "agent_rules",
            "question": "If your agent had to make a hard decision without you, what 3 rules should it follow?",
            "required": True,
        },
    ]

    idp = docs.get("idp", {}) or {}
    ethics = docs.get("ethics", {}) or {}
    insights = docs.get("insights", {}) or {}

    if idp:
        goals = idp.get("goals", [])
        if goals:
            goals_str = ", ".join(goals[:5])
            questions.append({
                "id": "idp_goals",
                "question": f"Your IDP says your goals are: {goals_str}. Which of these matters most to you in 10 years, not just today?",
                "context": f"From your IDP: {goals_str}",
                "required": False,
            })

    if ethics:
        framework = ethics.get("ethical_framework", "")
        if framework:
            questions.append({
                "id": "ethics_framework",
                "question": f"Your Ethics paper centers on {framework}. How does that show up in your daily decisions, not just your writing?",
                "context": f"From your Ethics paper: {framework}",
                "required": False,
            })

    if insights:
        primary = insights.get("primary_color", "")
        if primary:
            questions.append({
                "id": "insights_color",
                "question": f"Your Insights profile says you're {primary}. When does that energy serve you best, and when does it get in the way?",
                "context": f"From your Insights profile: {primary}",
                "required": False,
            })

    if enrichment:
        current_work = enrichment.get("current_work", "")
        if current_work:
            questions.append({
                "id": "enrichment_work",
                "question": f"You said you're working on: {current_work}. Is that the thing, or is it a stepping stone to the thing?",
                "context": f"From your enrichment answers: {current_work}",
                "required": False,
            })

    return questions


async def _synthesize_north_star(
    display_name: str,
    docs: dict[str, dict],
    enrichment: dict,
    answers: dict[str, str],
) -> dict:
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    doc_context = ""
    idp = docs.get("idp", {}) or {}
    ethics = docs.get("ethics", {}) or {}
    insights = docs.get("insights", {}) or {}

    if idp:
        doc_context += f"""
## IDP (Individual Development Plan)
Goals: {idp.get('goals', [])}
Expertise: {idp.get('expertise', [])}
Development Areas: {idp.get('development_areas', [])}
Leadership Priorities: {idp.get('leadership_priorities', [])}
"""

    if ethics:
        doc_context += f"""
## Ethics / Worldview Paper
Values: {ethics.get('values', [])}
Ethical Framework: {ethics.get('ethical_framework', '')}
Worldview: {ethics.get('worldview', '')}
Key Principles: {ethics.get('key_principles', [])}
"""

    if insights:
        doc_context += f"""
## Insights Discovery Profile
Primary Color: {insights.get('primary_color', '')}
Strengths: {insights.get('strengths', [])}
Communication Style: {insights.get('communication_style', '')}
Personality: {insights.get('personality_summary', '')}
"""

    if enrichment:
        doc_context += f"""
## Deeper Context (self-reported)
Current work: {enrichment.get('current_work', '')}
Biggest bet: {enrichment.get('biggest_bet', '')}
Decision framework: {enrichment.get('decision_framework', '')}
Superpower: {enrichment.get('superpower', '')}
Blind spot: {enrichment.get('blind_spot', '')}
North star vision: {enrichment.get('north_star', '')}
"""

    answer_lines = []
    for qid, answer in answers.items():
        if answer and answer.strip():
            answer_lines.append(f"- {qid}: {answer}")
    answers_text = "\n".join(answer_lines) if answer_lines else "No answers provided."

    synthesis_prompt = f"""\
You are helping {display_name} define their North Star — the deepest layer of who they are professionally.

Here is everything we know about them from their EMBA documents:
{doc_context if doc_context.strip() else "No documents uploaded yet."}

Here are their answers to guided reflection questions:
{answers_text}

Based on ALL of this information, synthesize a North Star with these components:

1. **Mission** — One clear, powerful sentence that captures what {display_name}'s professional life stands for. Not generic. Not corporate. Real.

2. **Principles** — 3 to 5 guiding principles. Each has a short title and a 1-2 sentence description. These should be specific to {display_name}, drawing from their values, ethics, and answers.

3. **Vision** — A 2-3 sentence vision of what success looks like in 5-10 years. Concrete and personal.

4. **Non-negotiables** — 3 to 5 short phrases representing values or principles that {display_name} would never compromise. These are the hard lines.

Return your response as a JSON object with this exact structure:
{{
  "mission": "...",
  "principles": [
    {{"title": "...", "description": "..."}},
    ...
  ],
  "vision": "...",
  "non_negotiables": ["...", "...", "..."]
}}

Return ONLY the JSON. No commentary, no markdown fences."""

    response = await client.messages.create(
        model=MODEL,
        max_tokens=2048,
        messages=[{"role": "user", "content": synthesis_prompt}],
    )

    text = response.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()

    return json.loads(text)


async def _update_agent_prompt_with_soul(sb, user_id: str, north_star: dict):
    from api.services.prompt_service import rebuild_agent_prompt
    await rebuild_agent_prompt(sb, user_id)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/{user_id}")
async def get_north_star(
    user_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Get the caller's North Star."""
    assert_is_caller(user_id, current_user)
    sb = get_sb()
    result = sb.table("north_stars").select("*").eq("user_id", current_user).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="No North Star found for this user")
    return result.data[0]


@router.post("/{user_id}")
async def save_north_star(
    user_id: UUID,
    body: NorthStarUpdate,
    current_user: str = Depends(get_current_user),
):
    """Create or update the caller's North Star."""
    assert_is_caller(user_id, current_user)
    sb = get_sb()

    user_result = sb.table("users").select("id").eq("id", current_user).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")

    data = {
        "user_id": current_user,
        "mission": body.mission,
        "principles": body.principles,
        "vision": body.vision,
        "non_negotiables": body.non_negotiables,
        "synthesis_source": {},
        "updated_at": "now()",
    }

    existing = sb.table("north_stars").select("id").eq("user_id", current_user).execute()
    if existing.data:
        result = sb.table("north_stars").update(data).eq("user_id", current_user).execute()
    else:
        result = sb.table("north_stars").insert(data).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save North Star")

    await _update_agent_prompt_with_soul(sb, current_user, result.data[0])

    return result.data[0]


@router.get("/{user_id}/questions")
async def get_guided_questions(
    user_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Return guided questions, dynamic based on caller's uploaded docs."""
    assert_is_caller(user_id, current_user)
    sb = get_sb()
    docs = _get_user_docs(sb, current_user)
    enrichment = _get_enrichment(sb, current_user)
    questions = _build_guided_questions(docs, enrichment)
    return {"questions": questions}


@router.post("/{user_id}/guided")
async def guided_synthesis(
    user_id: UUID,
    body: GuidedAnswers,
    current_user: str = Depends(get_current_user),
):
    """Guided North Star creation for the caller."""
    assert_is_caller(user_id, current_user)
    sb = get_sb()

    user_result = sb.table("users").select("display_name").eq("id", current_user).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")
    display_name = user_result.data[0]["display_name"]

    docs = _get_user_docs(sb, current_user)
    enrichment = _get_enrichment(sb, current_user)

    synthesized = await _synthesize_north_star(
        display_name=display_name,
        docs=docs,
        enrichment=enrichment,
        answers=body.answers,
    )

    synthesis_source = {
        "idp": "idp" in docs,
        "ethics": "ethics" in docs,
        "insights": "insights" in docs,
        "enrichment": bool(enrichment),
        "guided_answers": True,
    }

    data = {
        "user_id": current_user,
        "mission": synthesized["mission"],
        "principles": synthesized.get("principles", []),
        "vision": synthesized.get("vision"),
        "non_negotiables": synthesized.get("non_negotiables", []),
        "synthesis_source": synthesis_source,
        "updated_at": "now()",
    }

    existing = sb.table("north_stars").select("id").eq("user_id", current_user).execute()
    if existing.data:
        result = sb.table("north_stars").update(data).eq("user_id", current_user).execute()
    else:
        result = sb.table("north_stars").insert(data).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save synthesized North Star")

    await _update_agent_prompt_with_soul(sb, current_user, result.data[0])

    return result.data[0]


@router.delete("/{user_id}")
async def delete_north_star(
    user_id: UUID,
    current_user: str = Depends(get_current_user),
):
    """Delete the caller's North Star."""
    assert_is_caller(user_id, current_user)
    sb = get_sb()
    result = sb.table("north_stars").delete().eq("user_id", current_user).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="No North Star found to delete")

    await _update_agent_prompt_with_soul(sb, current_user, {})

    return {"status": "deleted"}
