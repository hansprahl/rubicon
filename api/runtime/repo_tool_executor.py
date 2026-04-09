"""Repository Tool Executor — executes repository tools via Claude.

Repository tools are "Claude as structured analyst" — they take input,
apply the agent's perspective + a framework template, and produce
structured output. The executor's job is:

1. Fetch any required data from Supabase (workspace messages, member profiles, entities)
2. Build a focused prompt with the tool's template + the agent's values/expertise
3. Call Claude and return the result
"""

from __future__ import annotations

import json

import anthropic
from supabase import create_client

from api.config import settings

MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 4096


def _sb():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# ── Category-specific prompt templates ──

INTELLIGENCE_TEMPLATE = """You are a research analyst working for {agent_name}.
Your principal's expertise: {expertise}
Your principal's values: {values}
Your principal's perspective: {communication_style}

TOOL: {tool_name} — {tool_description}

Provide thorough, well-structured research. Cite reasoning. Flag uncertainty.
Present findings in a way that aligns with your principal's expertise and values.

INPUT:
{tool_input}

Deliver your analysis now."""

FINANCIAL_TEMPLATE = """You are a financial analyst working for {agent_name}.
Your principal's expertise: {expertise}
Your principal's values: {values}

TOOL: {tool_name} — {tool_description}

Use precise numbers. State all assumptions explicitly. Show your work.
Present results in structured tables/sections where appropriate.

INPUT:
{tool_input}

Deliver your financial analysis now."""

STRATEGY_TEMPLATE = """You are a strategy consultant working for {agent_name}.
Your principal's expertise: {expertise}
Your principal's values: {values}

TOOL: {tool_name} — {tool_description}

Apply the framework rigorously. Be specific to the situation — no generic filler.
Challenge assumptions. Identify the 2-3 most important insights.

INPUT:
{tool_input}

Deliver your strategic analysis now."""

OPERATIONS_TEMPLATE = """You are an operations specialist working for {agent_name}.
Your principal's expertise: {expertise}
Your principal's values: {values}

TOOL: {tool_name} — {tool_description}

Focus on actionable, implementable recommendations. Include timelines, owners, and dependencies where relevant. Identify quick wins vs. long-term improvements.

INPUT:
{tool_input}

Deliver your operational analysis now."""

PEOPLE_TEMPLATE = """You are a leadership and people advisor working for {agent_name}.
Your principal's expertise: {expertise}
Your principal's values: {values}
Your principal's communication style: {communication_style}

TOOL: {tool_name} — {tool_description}

Consider interpersonal dynamics, diverse perspectives, and emotional intelligence.
Provide practical, empathetic advice grounded in leadership best practices.

INPUT:
{tool_input}

Deliver your analysis now."""

COMMUNICATION_TEMPLATE = """You are a communications specialist working for {agent_name}.
Your principal's expertise: {expertise}
Your principal's values: {values}
Your principal's communication style: {communication_style}

TOOL: {tool_name} — {tool_description}

Match the output to the audience. Be concise, persuasive, and clear.
Adapt to your principal's natural communication style.

INPUT:
{tool_input}

Deliver your output now."""

COLLABORATION_TEMPLATE = """You are a collaboration facilitator working for {agent_name}.
Your principal's expertise: {expertise}
Your principal's values: {values}

TOOL: {tool_name} — {tool_description}

WORKSPACE CONTEXT:
{workspace_context}

Synthesize the workspace context. Identify patterns, gaps, and actionable next steps.
Consider all members' perspectives.

INPUT:
{tool_input}

Deliver your analysis now."""

CATEGORY_TEMPLATES = {
    "intelligence": INTELLIGENCE_TEMPLATE,
    "financial": FINANCIAL_TEMPLATE,
    "strategy": STRATEGY_TEMPLATE,
    "operations": OPERATIONS_TEMPLATE,
    "people": PEOPLE_TEMPLATE,
    "communication": COMMUNICATION_TEMPLATE,
    "collaboration": COLLABORATION_TEMPLATE,
}


async def _fetch_workspace_context(workspace_id: str) -> str:
    """Fetch workspace data for workspace-aware tools."""
    sb = _sb()
    parts = []

    # Recent messages
    messages = (
        sb.table("messages")
        .select("content,sender_type,created_at")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .limit(30)
        .execute()
    )
    if messages.data:
        msg_lines = []
        for m in reversed(messages.data):
            sender = "Human" if m["sender_type"] == "human" else "Agent"
            msg_lines.append(f"[{sender}] {m['content'][:500]}")
        parts.append("RECENT MESSAGES:\n" + "\n".join(msg_lines))

    # Entities in knowledge graph
    entities = (
        sb.table("shared_entities")
        .select("name,entity_type,properties,confidence_score,status")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    if entities.data:
        ent_lines = []
        for e in entities.data:
            props = json.dumps(e.get("properties", {}))[:200]
            ent_lines.append(f"- {e['name']} ({e['entity_type']}, {e['status']}, confidence={e['confidence_score']}): {props}")
        parts.append("KNOWLEDGE GRAPH ENTITIES:\n" + "\n".join(ent_lines))

    # Workspace members
    members = (
        sb.table("workspace_members")
        .select("user_id,role")
        .eq("workspace_id", workspace_id)
        .execute()
    )
    if members.data:
        member_lines = []
        for m in members.data:
            uid = m["user_id"]
            user = sb.table("users").select("display_name").eq("id", uid).execute()
            agent = sb.table("agent_profiles").select("agent_name,expertise,values").eq("user_id", uid).execute()
            name = user.data[0]["display_name"] if user.data else "Unknown"
            if agent.data:
                a = agent.data[0]
                expertise = ", ".join(a.get("expertise", [])[:3]) or "none listed"
                member_lines.append(f"- {name} (role={m['role']}, expertise: {expertise})")
            else:
                member_lines.append(f"- {name} (role={m['role']})")
        parts.append("WORKSPACE MEMBERS:\n" + "\n".join(member_lines))

    # Milestones
    milestones = (
        sb.table("milestones")
        .select("title,status,due_date")
        .eq("workspace_id", workspace_id)
        .execute()
    )
    if milestones.data:
        ms_lines = [f"- {m['title']} (status={m['status']}, due={m.get('due_date', 'no date')})" for m in milestones.data]
        parts.append("MILESTONES:\n" + "\n".join(ms_lines))

    return "\n\n".join(parts) if parts else "No workspace data available yet."


async def execute_repo_tool(
    tool_name: str,
    tool_input: dict,
    agent_profile: dict,
) -> str:
    """Execute a repository tool using the agent's perspective.

    Args:
        tool_name: The tool's name (e.g., 'web_research')
        tool_input: The input parameters from the tool call
        agent_profile: The agent's profile dict (agent_name, expertise, values, etc.)
    """
    sb = _sb()

    # Look up the tool definition
    tool_result = sb.table("tool_repository").select("*").eq("name", tool_name).execute()
    if not tool_result.data:
        return json.dumps({"error": f"Repository tool '{tool_name}' not found"})

    tool_def = tool_result.data[0]
    category = tool_def["category"]

    # Extract agent context
    agent_name = agent_profile.get("agent_name", "Agent")
    expertise = ", ".join(agent_profile.get("expertise", [])) or "general"
    values = ", ".join(agent_profile.get("values", [])) or "none specified"
    communication_style = agent_profile.get("communication_style", "professional")

    # For workspace-aware tools, fetch workspace context
    workspace_context = ""
    if tool_def.get("is_workspace_aware"):
        workspace_id = tool_input.get("workspace_id", "")
        if workspace_id:
            workspace_context = await _fetch_workspace_context(workspace_id)
        else:
            workspace_context = "No workspace ID provided."

    # Build the prompt from category template
    template = CATEGORY_TEMPLATES.get(category, INTELLIGENCE_TEMPLATE)
    prompt = template.format(
        agent_name=agent_name,
        expertise=expertise,
        values=values,
        communication_style=communication_style,
        tool_name=tool_def["display_name"],
        tool_description=tool_def["description"],
        tool_input=json.dumps(tool_input, indent=2),
        workspace_context=workspace_context,
    )

    # Call Claude
    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            messages=[{"role": "user", "content": prompt}],
        )
        text_blocks = [b.text for b in response.content if b.type == "text"]
        return "\n".join(text_blocks) if text_blocks else "No analysis produced."
    except Exception as e:
        return json.dumps({"error": f"Tool execution failed: {str(e)}"})
