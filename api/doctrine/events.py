"""Event-driven architecture — Doctrine component.

Provides a persistent event bus backed by the Supabase agent_events table.
Agents publish events when they take actions (publish entity, update confidence,
complete task). Other agents subscribe to event types and react accordingly.

Event types:
- finding_published: An agent published a new entity to the workspace graph
- confidence_updated: An agent updated confidence on an existing entity
- relationship_created: An agent created a SUPPORTS/CONTRADICTS relationship
- task_completed: An agent finished a task
- disagreement_flagged: Two agents contradict each other on an entity
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Callable, Coroutine
from uuid import UUID

from api.db import get_sb


# Type alias for async event handlers
EventHandler = Callable[[dict], Coroutine]


class EventBus:
    """In-memory pub/sub with persistent storage in agent_events.

    Handlers are registered per (workspace_id, event_type). When an event is
    published it is first persisted to Supabase, then all matching handlers
    are invoked concurrently.
    """

    def __init__(self) -> None:
        # key: (workspace_id | "*", event_type | "*") -> list of handlers
        self._handlers: dict[tuple[str, str], list[EventHandler]] = defaultdict(list)

    def subscribe(
        self,
        event_type: str,
        handler: EventHandler,
        workspace_id: str | None = None,
    ) -> None:
        """Register a handler for an event type, optionally scoped to a workspace."""
        key = (workspace_id or "*", event_type)
        self._handlers[key].append(handler)

    async def publish(
        self,
        workspace_id: UUID,
        source_agent_id: UUID,
        event_type: str,
        payload: dict,
    ) -> dict:
        """Persist an event and notify all matching handlers.

        Returns the persisted event row.
        """
        sb = get_sb()
        event_data = {
            "workspace_id": str(workspace_id),
            "source_agent_id": str(source_agent_id),
            "event_type": event_type,
            "payload": payload,
        }
        result = sb.table("agent_events").insert(event_data).execute()
        event = result.data[0] if result.data else event_data

        # Collect matching handlers: exact workspace + wildcard workspace
        ws_key = str(workspace_id)
        handlers = []
        handlers.extend(self._handlers.get((ws_key, event_type), []))
        handlers.extend(self._handlers.get(("*", event_type), []))
        handlers.extend(self._handlers.get((ws_key, "*"), []))
        handlers.extend(self._handlers.get(("*", "*"), []))

        if handlers:
            await asyncio.gather(
                *(h(event) for h in handlers),
                return_exceptions=True,
            )

        return event


async def get_events(
    workspace_id: UUID,
    event_type: str | None = None,
    source_agent_id: UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Query persisted events with optional filters."""
    sb = get_sb()
    query = (
        sb.table("agent_events")
        .select("*")
        .eq("workspace_id", str(workspace_id))
        .order("created_at", desc=True)
    )
    if event_type:
        query = query.eq("event_type", event_type)
    if source_agent_id:
        query = query.eq("source_agent_id", str(source_agent_id))
    result = query.range(offset, offset + limit - 1).execute()
    return result.data


async def get_event(event_id: UUID) -> dict | None:
    """Get a single event by ID."""
    sb = get_sb()
    result = sb.table("agent_events").select("*").eq("id", str(event_id)).execute()
    return result.data[0] if result.data else None


# Singleton event bus used across the application
event_bus = EventBus()
