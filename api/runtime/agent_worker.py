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
from api.runtime.tool_executor import AGENT_TOOLS, execute_tool
from api.runtime.repo_tool_executor import execute_repo_tool

# The model used for all agent interactions
MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 4096
MAX_TOOL_ROUNDS = 10  # Safety limit on ReAct iterations


@dataclass
class AgentContext:
    """Per-agent context that persists across turns within a session."""
    agent_name: str
    system_prompt: str
    agent_id: str = ""
    user_id: str = ""
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
        "You have tools available to search workspaces, publish findings, create relationships, post messages, and more. Use them when the request calls for action beyond conversation.",
        "",
        "Please include a confidence assessment at the end of every response in this format:",
        '[CONFIDENCE: {"score": <0.0-1.0>, "reasoning": "<brief explanation>"}]',
        "",
        "How to score your confidence:",
        "- 0.9-1.0: Well-established fact or directly from your knowledge",
        "- 0.7-0.89: Strong reasoning with solid supporting evidence",
        "- 0.5-0.69: Reasonable take, but working with limited evidence",
        "- 0.3-0.49: Early thinking — worth exploring further together",
        "- 0.0-0.29: Not sure yet — would love your input on this one",
    ])
    return "\n".join(parts)


def _core_tool_names() -> set[str]:
    """Return the set of core tool names (always available)."""
    return {t["name"] for t in AGENT_TOOLS}


async def _load_agent_repo_tools(agent_id: str) -> list[dict]:
    """Load enabled repository tools for an agent from the database."""
    from supabase import create_client
    try:
        sb = create_client(settings.supabase_url, settings.supabase_service_role_key)

        # Get enabled tool IDs
        enabled = (
            sb.table("agent_tools")
            .select("tool_id")
            .eq("agent_id", agent_id)
            .execute()
        )
        if not enabled.data:
            return []

        tool_ids = [r["tool_id"] for r in enabled.data]
        tools = (
            sb.table("tool_repository")
            .select("name,display_name,description,input_schema")
            .in_("id", tool_ids)
            .execute()
        )
        if not tools.data:
            return []

        # Convert to Claude tool format
        result = []
        for t in tools.data:
            result.append({
                "name": t["name"],
                "description": t["description"],
                "input_schema": t["input_schema"] if isinstance(t["input_schema"], dict) else {},
            })
        return result
    except Exception:
        return []


async def _load_agent_profile(agent_id: str) -> dict:
    """Load the agent profile for repository tool execution context."""
    from supabase import create_client
    try:
        sb = create_client(settings.supabase_url, settings.supabase_service_role_key)
        result = (
            sb.table("agent_profiles")
            .select("agent_name,expertise,values,communication_style")
            .eq("id", agent_id)
            .execute()
        )
        return result.data[0] if result.data else {}
    except Exception:
        return {}


async def run_react_loop(
    context: AgentContext,
    user_message: str,
) -> str:
    """Run a ReAct loop: reason, act (tool use), observe, repeat until final text.

    The loop passes core AGENT_TOOLS + enabled repository tools to Claude
    and handles tool_use responses by routing to the appropriate executor.
    Loops until Claude gives a final text response or we hit MAX_TOOL_ROUNDS.
    """
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    # Load the agent's enabled repository tools
    repo_tools = await _load_agent_repo_tools(context.agent_id)
    all_tools = AGENT_TOOLS + repo_tools
    core_names = _core_tool_names()

    # Pre-load agent profile for repo tool execution
    agent_profile = await _load_agent_profile(context.agent_id) if repo_tools else {}

    context.history.append({"role": "user", "content": user_message})

    for _round in range(MAX_TOOL_ROUNDS):
        response = await client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=context.system_prompt,
            messages=context.history,
            tools=all_tools,
        )

        # Check if the response contains tool use
        tool_use_blocks = [b for b in response.content if b.type == "tool_use"]

        if not tool_use_blocks:
            # Final text response — extract and return
            text_blocks = [b for b in response.content if b.type == "text"]
            assistant_text = "\n".join(b.text for b in text_blocks) if text_blocks else ""
            context.history.append({"role": "assistant", "content": response.content})
            return assistant_text

        # Tool use response — execute each tool and feed results back
        context.history.append({"role": "assistant", "content": response.content})

        tool_results = []
        for tool_block in tool_use_blocks:
            if tool_block.name in core_names:
                # Core tool — use original executor
                result = await execute_tool(
                    tool_name=tool_block.name,
                    tool_input=tool_block.input,
                    agent_id=context.agent_id,
                    user_id=context.user_id,
                )
            else:
                # Repository tool — use repo executor
                result = await execute_repo_tool(
                    tool_name=tool_block.name,
                    tool_input=tool_block.input,
                    agent_profile=agent_profile,
                )
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_block.id,
                "content": result,
            })

        context.history.append({"role": "user", "content": tool_results})

    # Safety: if we hit max rounds, return whatever text we have
    return "[Agent reached maximum tool iterations. Please try a more specific request.]"
