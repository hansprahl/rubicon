"""Doctrine orchestrator — wraps the agent worker with Doctrine components.

The orchestrator is the main entry point for agent interactions. It:
1. Retrieves or creates the agent context via the AgentManager
2. Runs the ReAct loop via agent_worker
3. Parses and attaches confidence scores via confidence.py
4. Updates agent status throughout the interaction
"""

from __future__ import annotations

from uuid import UUID

from api.doctrine.confidence import parse_confidence
from api.models.agent import ConfidenceScore
from api.runtime.agent_manager import agent_manager
from api.runtime.agent_worker import run_react_loop


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
