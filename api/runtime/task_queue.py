"""Async background task queue for agent work.

Agents process tasks from the agent_tasks table using a polling loop.
Tasks move through: queued -> working -> done|failed.
The queue supports priority ordering and automatic retries.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from uuid import UUID

from supabase import create_client

from api.config import settings
from api.doctrine.orchestrator import handle_chat
from api.runtime.agent_manager import agent_manager

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 5
MAX_CONCURRENT_TASKS = 3


def _supabase():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


async def _claim_task() -> dict | None:
    """Claim the next queued task (highest priority, oldest first)."""
    sb = _supabase()
    result = (
        sb.table("agent_tasks")
        .select("*")
        .eq("status", "queued")
        .order("priority", desc=True)
        .order("created_at", desc=False)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None

    task = result.data[0]
    # Atomically claim by updating status
    update = sb.table("agent_tasks").update({
        "status": "working",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", task["id"]).eq("status", "queued").execute()

    if not update.data:
        return None  # Another worker claimed it

    return update.data[0]


async def _execute_task(task: dict) -> None:
    """Execute a single agent task."""
    sb = _supabase()
    task_id = task["id"]
    agent_id = task["agent_id"]

    try:
        # Fetch agent profile
        agent_result = (
            sb.table("agent_profiles").select("*").eq("id", agent_id).execute()
        )
        if not agent_result.data:
            raise ValueError(f"Agent {agent_id} not found")
        agent = agent_result.data[0]

        # Update agent status to working
        sb.table("agent_profiles").update({"status": "working"}).eq(
            "id", agent_id
        ).execute()

        # Build task prompt from title + description
        task_prompt = task["title"]
        if task.get("description"):
            task_prompt += f"\n\nDetails: {task['description']}"

        # Add workspace context to the prompt if this is a workspace task
        workspace_id = task.get("workspace_id")
        extra_context = ""
        if workspace_id:
            extra_context = f"\n\nYou are working in workspace ID: {workspace_id}. Use the post_message tool with this workspace_id to share your response with the team."

        # Run through the Doctrine orchestrator
        response_text, confidence = await handle_chat(
            agent_id=UUID(agent_id),
            agent_name=agent["agent_name"],
            expertise=agent.get("expertise", []),
            goals=agent.get("goals", []),
            values=agent.get("values", []),
            communication_style=agent.get("communication_style"),
            system_prompt=agent.get("system_prompt"),
            user_message=f"[TASK] {task_prompt}{extra_context}",
            user_id=agent.get("user_id", ""),
        )

        # If workspace task and the agent didn't post via tool, post the response to the feed
        if workspace_id:
            try:
                sb.table("messages").insert({
                    "workspace_id": workspace_id,
                    "agent_id": agent_id,
                    "sender_type": "agent",
                    "content": response_text,
                    "confidence": confidence.model_dump(),
                    "metadata": {"source": "war_room"},
                }).execute()
            except Exception:
                pass  # Best-effort feed posting

        # Mark task as done
        sb.table("agent_tasks").update({
            "status": "done",
            "result": {
                "response": response_text,
                "confidence": confidence.model_dump(),
            },
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", task_id).execute()

        # Create notification for the task owner
        user_id = agent.get("user_id")
        if user_id:
            _create_notification(
                user_id=user_id,
                title=f"Task completed: {task['title'][:50]}",
                body=response_text[:200],
                category="agent",
                link=f"/workspaces/{workspace_id}" if workspace_id else "/dashboard",
                metadata={"task_id": task_id, "agent_id": agent_id},
            )

        logger.info(f"Task {task_id} completed successfully")

    except Exception as e:
        logger.exception(f"Task {task_id} failed: {e}")
        retry_count = task.get("retry_count", 0) + 1
        max_retries = task.get("max_retries", 3)

        if retry_count < max_retries:
            sb.table("agent_tasks").update({
                "status": "queued",
                "retry_count": retry_count,
                "error_message": str(e),
            }).eq("id", task_id).execute()
        else:
            sb.table("agent_tasks").update({
                "status": "failed",
                "retry_count": retry_count,
                "error_message": str(e),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", task_id).execute()

    finally:
        # Reset agent status
        try:
            sb.table("agent_profiles").update({"status": "idle"}).eq(
                "id", agent_id
            ).execute()
        except Exception:
            pass


def _create_notification(
    user_id: str,
    title: str,
    body: str | None = None,
    category: str = "info",
    link: str | None = None,
    metadata: dict | None = None,
) -> None:
    """Insert a notification row."""
    sb = _supabase()
    sb.table("notifications").insert({
        "user_id": user_id,
        "title": title,
        "body": body,
        "category": category,
        "link": link,
        "metadata": metadata or {},
    }).execute()


# ---------------------------------------------------------------------------
# Public helpers for creating notifications from other modules
# ---------------------------------------------------------------------------


def notify_approval_needed(user_id: str, action_type: str, agent_name: str) -> None:
    """Notify user that an agent action needs approval."""
    _create_notification(
        user_id=user_id,
        title=f"{agent_name} needs approval",
        body=f"Action: {action_type.replace('_', ' ')}",
        category="approval",
        link="/approvals",
    )


def notify_disagreement(
    user_id: str, entity_name: str, workspace_name: str | None = None
) -> None:
    """Notify user about a disagreement between agents."""
    _create_notification(
        user_id=user_id,
        title=f"Disagreement on \"{entity_name}\"",
        body=f"Agents disagree in {workspace_name or 'a workspace'}. Review needed.",
        category="disagreement",
        link="/approvals",
    )


def notify_milestone_change(
    user_id: str, milestone_title: str, new_status: str
) -> None:
    """Notify user about a milestone status change."""
    _create_notification(
        user_id=user_id,
        title=f"Milestone updated: {milestone_title[:50]}",
        body=f"Status changed to {new_status.replace('_', ' ')}",
        category="milestone",
    )


# ---------------------------------------------------------------------------
# Background worker loop
# ---------------------------------------------------------------------------


async def run_task_queue() -> None:
    """Main polling loop — runs as a background task during app lifespan."""
    logger.info("Task queue worker started")
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_TASKS)

    while True:
        try:
            task = await _claim_task()
            if task:
                async with semaphore:
                    asyncio.create_task(_execute_task(task))
            else:
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            logger.info("Task queue worker shutting down")
            break
        except Exception:
            logger.exception("Task queue error")
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
