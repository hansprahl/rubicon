"""Doctrine orchestrator — wraps the agent worker with Doctrine components.

The orchestrator is the main entry point for agent interactions. It:
1. Retrieves or creates the agent context via the AgentManager
2. Runs the ReAct loop via agent_worker
3. Parses and attaches confidence scores via confidence.py
4. Updates agent status throughout the interaction
5. Submits actions to the approval queue when autonomy level requires it
"""

from __future__ import annotations

from uuid import UUID

from supabase import create_client

from api.config import settings
from api.doctrine.confidence import parse_confidence
from api.models.agent import ConfidenceScore
from api.runtime.agent_manager import agent_manager
from api.runtime.agent_worker import run_react_loop

# Autonomy level thresholds — what requires approval at each level:
#   1 = ask before everything (all actions need approval)
#   2 = approve workspace actions (publish, message, relationships)
#   3 = approve high-impact only (publish entities, update estimates)
#   4 = approve destructive only (deletes, contradictions)
#   5 = act freely (no approval needed)
AUTONOMY_THRESHOLDS: dict[str, int] = {
    "publish_entity": 2,
    "send_message": 2,
    "create_relationship": 2,
    "update_estimate": 3,
    "delete_entity": 4,
    "flag_contradiction": 4,
}


def requires_approval(action_type: str, autonomy_level: int) -> bool:
    """Check whether an action requires human approval at the given autonomy level."""
    threshold = AUTONOMY_THRESHOLDS.get(action_type, 2)
    return autonomy_level < threshold


async def submit_for_approval(
    user_id: UUID,
    agent_id: UUID,
    action_type: str,
    payload: dict,
    workspace_id: UUID | None = None,
) -> dict:
    """Insert an action into the approval queue and return the created row."""
    sb = create_client(settings.supabase_url, settings.supabase_service_role_key)
    data = {
        "user_id": str(user_id),
        "agent_id": str(agent_id),
        "action_type": action_type,
        "payload": payload,
    }
    if workspace_id:
        data["workspace_id"] = str(workspace_id)
    result = sb.table("approvals").insert(data).execute()
    # Update agent status to waiting_approval
    sb.table("agent_profiles").update({"status": "waiting_approval"}).eq(
        "id", str(agent_id)
    ).execute()

    # Send in-app notification
    from api.runtime.task_queue import notify_approval_needed

    agent_result = sb.table("agent_profiles").select("agent_name").eq(
        "id", str(agent_id)
    ).execute()
    agent_name = agent_result.data[0]["agent_name"] if agent_result.data else "Your agent"
    notify_approval_needed(str(user_id), action_type, agent_name)

    return result.data[0] if result.data else {}


async def handle_chat(
    agent_id: UUID,
    agent_name: str,
    expertise: list[str],
    goals: list[str],
    values: list[str],
    communication_style: str | None,
    system_prompt: str | None,
    user_message: str,
) -> tuple[str, ConfidenceScore]:
    """Process a chat message through the full Doctrine pipeline.

    Returns the cleaned response text and its confidence score.
    """
    # 1. Get or create agent context
    context = agent_manager.get_or_create(
        agent_id=agent_id,
        agent_name=agent_name,
        expertise=expertise,
        goals=goals,
        values=values,
        communication_style=communication_style,
        system_prompt=system_prompt,
    )

    # 2. Run the ReAct loop
    raw_response = await run_react_loop(context, user_message)

    # 3. Parse confidence from response
    clean_text, confidence = parse_confidence(raw_response)

    return clean_text, confidence
