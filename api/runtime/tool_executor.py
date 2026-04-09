"""Tool executor — dispatches agent tool calls to Supabase.

Each tool function receives the tool input dict, agent_id, and user_id,
executes the appropriate Supabase query, and returns a string result
that gets fed back into the Claude ReAct loop.
"""

from __future__ import annotations

import json
from uuid import UUID

from supabase import create_client

from api.config import settings


AGENT_TOOLS = [
    {
        "name": "search_workspace",
        "description": "Search messages and findings in a workspace",
        "input_schema": {
            "type": "object",
            "properties": {
                "workspace_id": {"type": "string"},
                "query": {"type": "string"},
                "limit": {"type": "integer", "default": 10},
            },
            "required": ["workspace_id", "query"],
        },
    },
    {
        "name": "publish_entity",
        "description": "Publish a finding or concept to the shared knowledge graph. Goes through approval if autonomy requires it.",
        "input_schema": {
            "type": "object",
            "properties": {
                "workspace_id": {"type": "string"},
                "name": {"type": "string"},
                "entity_type": {
                    "type": "string",
                    "enum": ["concept", "finding", "recommendation", "person", "company"],
                },
                "properties": {"type": "object"},
                "confidence_score": {"type": "number"},
            },
            "required": ["workspace_id", "name", "entity_type"],
        },
    },
    {
        "name": "create_relationship",
        "description": "Create a relationship between two entities in the knowledge graph",
        "input_schema": {
            "type": "object",
            "properties": {
                "workspace_id": {"type": "string"},
                "source_entity_id": {"type": "string"},
                "target_entity_id": {"type": "string"},
                "relationship_type": {
                    "type": "string",
                    "enum": ["SUPPORTS", "CONTRADICTS", "BUILDS_ON", "RELATES_TO"],
                },
            },
            "required": ["workspace_id", "source_entity_id", "target_entity_id", "relationship_type"],
        },
    },
    {
        "name": "post_message",
        "description": "Post a message to a workspace feed",
        "input_schema": {
            "type": "object",
            "properties": {
                "workspace_id": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["workspace_id", "content"],
        },
    },
    {
        "name": "list_workspace_entities",
        "description": "List entities in a workspace knowledge graph, optionally filtered",
        "input_schema": {
            "type": "object",
            "properties": {
                "workspace_id": {"type": "string"},
                "entity_type": {"type": "string"},
                "status": {"type": "string"},
            },
            "required": ["workspace_id"],
        },
    },
    {
        "name": "get_my_profile",
        "description": "Read your own agent profile -- expertise, values, goals, fidelity, anatomy status",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "list_workspace_members",
        "description": "List members and their agents in a workspace",
        "input_schema": {
            "type": "object",
            "properties": {
                "workspace_id": {"type": "string"},
            },
            "required": ["workspace_id"],
        },
    },
    {
        "name": "create_task",
        "description": "Create a task for yourself in a workspace",
        "input_schema": {
            "type": "object",
            "properties": {
                "workspace_id": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
            },
            "required": ["title"],
        },
    },
    {
        "name": "list_my_workspaces",
        "description": "List all workspaces you belong to, with their IDs and names. Use this to find workspace IDs before using other workspace tools.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
]


def _sb():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


async def execute_tool(
    tool_name: str,
    tool_input: dict,
    agent_id: str,
    user_id: str,
) -> str:
    """Dispatch a tool call to the appropriate handler. Returns a string result."""
    handler = _HANDLERS.get(tool_name)
    if not handler:
        return json.dumps({"error": f"Unknown tool: {tool_name}"})
    try:
        result = await handler(tool_input, agent_id, user_id)
        return result if isinstance(result, str) else json.dumps(result)
    except Exception as e:
        return json.dumps({"error": str(e)})


# -- Tool handlers --

async def _search_workspace(tool_input: dict, agent_id: str, user_id: str) -> str:
    sb = _sb()
    workspace_id = tool_input["workspace_id"]
    query = tool_input["query"]
    limit = tool_input.get("limit", 10)

    # Search messages
    messages = (
        sb.table("messages")
        .select("id,content,sender_type,created_at")
        .eq("workspace_id", workspace_id)
        .ilike("content", f"%{query}%")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )

    # Search entities
    entities = (
        sb.table("shared_entities")
        .select("id,name,entity_type,properties,confidence_score,status")
        .eq("workspace_id", workspace_id)
        .ilike("name", f"%{query}%")
        .limit(limit)
        .execute()
    )

    return json.dumps({
        "messages": messages.data or [],
        "entities": entities.data or [],
    })


async def _publish_entity(tool_input: dict, agent_id: str, user_id: str) -> str:
    from api.doctrine.orchestrator import requires_approval, submit_for_approval

    sb = _sb()
    workspace_id = tool_input["workspace_id"]

    # Check autonomy level
    agent_result = sb.table("agent_profiles").select("autonomy_level").eq("id", agent_id).execute()
    autonomy = agent_result.data[0]["autonomy_level"] if agent_result.data else 2

    entity_data = {
        "workspace_id": workspace_id,
        "author_agent_id": agent_id,
        "name": tool_input["name"],
        "entity_type": tool_input["entity_type"],
        "properties": tool_input.get("properties", {}),
        "confidence_score": tool_input.get("confidence_score", 0.5),
        "status": "draft",
    }

    if requires_approval("publish_entity", autonomy):
        # Route through approval queue
        approval = await submit_for_approval(
            user_id=UUID(user_id),
            agent_id=UUID(agent_id),
            action_type="publish_entity",
            payload={"entity": entity_data},
            workspace_id=UUID(workspace_id),
        )
        return json.dumps({
            "status": "pending_approval",
            "approval_id": approval.get("id"),
            "message": f"Entity '{tool_input['name']}' submitted for human approval.",
        })

    # Direct publish
    result = sb.table("shared_entities").insert(entity_data).execute()
    if result.data:
        return json.dumps({
            "status": "published",
            "entity_id": result.data[0]["id"],
            "message": f"Entity '{tool_input['name']}' published to knowledge graph.",
        })
    return json.dumps({"error": "Failed to publish entity"})


async def _create_relationship(tool_input: dict, agent_id: str, user_id: str) -> str:
    from api.doctrine.orchestrator import requires_approval, submit_for_approval

    sb = _sb()
    workspace_id = tool_input["workspace_id"]

    # Check autonomy
    agent_result = sb.table("agent_profiles").select("autonomy_level").eq("id", agent_id).execute()
    autonomy = agent_result.data[0]["autonomy_level"] if agent_result.data else 2

    rel_data = {
        "workspace_id": workspace_id,
        "source_entity_id": tool_input["source_entity_id"],
        "target_entity_id": tool_input["target_entity_id"],
        "relationship_type": tool_input["relationship_type"],
        "confidence_score": 0.7,
        "created_by_agent": agent_id,
    }

    if requires_approval("create_relationship", autonomy):
        approval = await submit_for_approval(
            user_id=UUID(user_id),
            agent_id=UUID(agent_id),
            action_type="create_relationship",
            payload={"relationship": rel_data},
            workspace_id=UUID(workspace_id),
        )
        return json.dumps({
            "status": "pending_approval",
            "approval_id": approval.get("id"),
            "message": "Relationship submitted for human approval.",
        })

    result = sb.table("shared_relationships").insert(rel_data).execute()
    if result.data:
        return json.dumps({
            "status": "created",
            "relationship_id": result.data[0]["id"],
        })
    return json.dumps({"error": "Failed to create relationship"})


async def _post_message(tool_input: dict, agent_id: str, user_id: str) -> str:
    from api.doctrine.orchestrator import requires_approval, submit_for_approval

    sb = _sb()
    workspace_id = tool_input["workspace_id"]
    content = tool_input["content"]

    # Check autonomy
    agent_result = sb.table("agent_profiles").select("autonomy_level,agent_name").eq("id", agent_id).execute()
    autonomy = agent_result.data[0]["autonomy_level"] if agent_result.data else 2

    if requires_approval("send_message", autonomy):
        approval = await submit_for_approval(
            user_id=UUID(user_id),
            agent_id=UUID(agent_id),
            action_type="send_message",
            payload={"workspace_id": workspace_id, "content": content},
            workspace_id=UUID(workspace_id),
        )
        return json.dumps({
            "status": "pending_approval",
            "approval_id": approval.get("id"),
            "message": "Message submitted for human approval before posting.",
        })

    msg_data = {
        "workspace_id": workspace_id,
        "agent_id": agent_id,
        "sender_type": "agent",
        "content": content,
        "confidence": {},
        "metadata": {},
    }
    result = sb.table("messages").insert(msg_data).execute()
    if result.data:
        return json.dumps({
            "status": "posted",
            "message_id": result.data[0]["id"],
        })
    return json.dumps({"error": "Failed to post message"})


async def _list_workspace_entities(tool_input: dict, agent_id: str, user_id: str) -> str:
    sb = _sb()
    workspace_id = tool_input["workspace_id"]

    query = (
        sb.table("shared_entities")
        .select("id,name,entity_type,properties,confidence_score,status,created_at")
        .eq("workspace_id", workspace_id)
    )
    if tool_input.get("entity_type"):
        query = query.eq("entity_type", tool_input["entity_type"])
    if tool_input.get("status"):
        query = query.eq("status", tool_input["status"])

    result = query.order("created_at", desc=True).limit(50).execute()
    return json.dumps(result.data or [])


async def _get_my_profile(tool_input: dict, agent_id: str, user_id: str) -> str:
    sb = _sb()
    result = sb.table("agent_profiles").select(
        "agent_name,expertise,goals,values,communication_style,fidelity,autonomy_level,status"
    ).eq("id", agent_id).execute()

    if not result.data:
        return json.dumps({"error": "Agent profile not found"})

    profile = result.data[0]

    # Add anatomy summary
    try:
        from api.runtime.anatomy import get_anatomy
        anatomy = await get_anatomy(user_id, agent_id)
        profile["anatomy"] = {
            "heartbeat": anatomy.heartbeat.status,
            "overall_health": anatomy.overall_health,
            "systems": {
                "brain": {"status": anatomy.brain.status, "health": anatomy.brain.health},
                "heart": {"status": anatomy.heart.status, "health": anatomy.heart.health},
                "voice": {"status": anatomy.voice.status, "health": anatomy.voice.health},
                "gut": {"status": anatomy.gut.status, "health": anatomy.gut.health},
                "hands": {"status": anatomy.hands.status, "health": anatomy.hands.health},
                "muscle": {"status": anatomy.muscle.status, "health": anatomy.muscle.health},
            },
        }
    except Exception:
        pass  # Anatomy is optional context

    return json.dumps(profile)


async def _list_workspace_members(tool_input: dict, agent_id: str, user_id: str) -> str:
    sb = _sb()
    workspace_id = tool_input["workspace_id"]

    members = (
        sb.table("workspace_members")
        .select("user_id,role,joined_at")
        .eq("workspace_id", workspace_id)
        .execute()
    )

    # Enrich with user and agent info
    enriched = []
    for member in (members.data or []):
        uid = member["user_id"]
        user_result = sb.table("users").select("display_name,email").eq("id", uid).execute()
        agent_result = sb.table("agent_profiles").select("id,agent_name,status,fidelity").eq("user_id", uid).execute()
        entry = {
            "user_id": uid,
            "role": member["role"],
            "joined_at": member["joined_at"],
            "display_name": user_result.data[0]["display_name"] if user_result.data else None,
            "agent_name": agent_result.data[0]["agent_name"] if agent_result.data else None,
            "agent_status": agent_result.data[0]["status"] if agent_result.data else None,
            "agent_fidelity": agent_result.data[0]["fidelity"] if agent_result.data else None,
        }
        enriched.append(entry)

    return json.dumps(enriched)


async def _create_task(tool_input: dict, agent_id: str, user_id: str) -> str:
    sb = _sb()
    task_data = {
        "agent_id": agent_id,
        "title": tool_input["title"],
        "description": tool_input.get("description", ""),
        "status": "queued",
    }
    if tool_input.get("workspace_id"):
        task_data["workspace_id"] = tool_input["workspace_id"]

    result = sb.table("agent_tasks").insert(task_data).execute()
    if result.data:
        return json.dumps({
            "status": "created",
            "task_id": result.data[0]["id"],
            "message": f"Task '{tool_input['title']}' created.",
        })
    return json.dumps({"error": "Failed to create task"})


async def _list_my_workspaces(tool_input: dict, agent_id: str, user_id: str) -> str:
    sb = _sb()
    # Get workspaces the user is a member of
    memberships = (
        sb.table("workspace_members")
        .select("workspace_id,role")
        .eq("user_id", user_id)
        .execute()
    )
    if not memberships.data:
        return json.dumps([])

    workspace_ids = [m["workspace_id"] for m in memberships.data]
    role_map = {m["workspace_id"]: m["role"] for m in memberships.data}

    workspaces = (
        sb.table("workspaces")
        .select("id,name,description,created_at")
        .in_("id", workspace_ids)
        .execute()
    )

    result = []
    for ws in (workspaces.data or []):
        result.append({
            "workspace_id": ws["id"],
            "name": ws["name"],
            "description": ws.get("description"),
            "role": role_map.get(ws["id"]),
            "created_at": ws["created_at"],
        })
    return json.dumps(result)


# -- Handler dispatch map --

_HANDLERS = {
    "search_workspace": _search_workspace,
    "publish_entity": _publish_entity,
    "create_relationship": _create_relationship,
    "post_message": _post_message,
    "list_workspace_entities": _list_workspace_entities,
    "get_my_profile": _get_my_profile,
    "list_workspace_members": _list_workspace_members,
    "create_task": _create_task,
    "list_my_workspaces": _list_my_workspaces,
}
