"""LangGraph-style ReAct agent worker using the Claude API.

Each agent worker represents a single user's digital twin. It runs a
Reason-Act loop: the agent reasons about the user's message, decides
whether to respond directly or use a tool, and iterates until it
produces a final answer.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import anthropic

from api.config import settings

# The model used for all agent interactions
MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 4096


@dataclass
class AgentContext:
    """Per-agent context that persists across turns within a session."""
    agent_name: str
    system_prompt: str
    history: list[dict] = field(default_factory=list)


def build_system_prompt(
    agent_name: str,
    expertise: list[str],
    goals: list[str],
    values: list[str],
    communication_style: str | None,
    custom_prompt: str | None,
) -> str:
    """Build the full system prompt for an agent from its profile."""
    parts = [
        f"You are {agent_name}, a digital twin agent on the Rubicon platform.",
        "You represent your human counterpart — think like them, advocate for their perspective, and collaborate with other agents.",
        "",
    ]
    if expertise:
        parts.append(f"Your expertise: {', '.join(expertise)}")
    if goals:
        parts.append(f"Your goals: {', '.join(goals)}")
    if values:
        parts.append(f"Your values: {', '.join(values)}")
    if communication_style:
        parts.append(f"Your communication style: {communication_style}")
    if custom_prompt:
        parts.append("")
        parts.append(custom_prompt)

    parts.extend([
        "",
        "IMPORTANT: End every response with a confidence assessment in this exact format:",
        '[CONFIDENCE: {"score": <0.0-1.0>, "reasoning": "<brief explanation>"}]',
        "",
        "Score guidelines:",
        "- 0.9-1.0: Factual, well-established, or directly from your knowledge base",
        "- 0.7-0.89: Well-reasoned with strong supporting evidence",
        "- 0.5-0.69: Reasonable inference but limited direct evidence",
        "- 0.3-0.49: Speculative, working from partial information",
        "- 0.0-0.29: Highly uncertain, flagging for human review",
    ])
    return "\n".join(parts)


async def run_react_loop(
    context: AgentContext,
    user_message: str,
) -> str:
    """Run a single ReAct turn: send message, get response.

    This is the core agent loop. For Phase 2 it handles simple
    conversation. Future phases will add tool use (search workspace,
    publish entities, etc.) which will make this a true multi-step
    ReAct loop.
    """
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    context.history.append({"role": "user", "content": user_message})

    response = await client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=context.system_prompt,
        messages=context.history,
    )

    assistant_text = response.content[0].text
    context.history.append({"role": "assistant", "content": assistant_text})

    return assistant_text
