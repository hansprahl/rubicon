"""Agent manager — spawns and manages agent instances per user.

Each user has at most one active agent context in memory. The manager
handles lifecycle (create, get, stop) and status tracking with LRU eviction.
"""

from __future__ import annotations

import time
from uuid import UUID

from api.runtime.agent_worker import AgentContext, build_system_prompt

MAX_AGENTS = 50
MAX_AGE_SECONDS = 3600  # 1 hour TTL


class AgentManager:
    """In-memory registry of active agent contexts with LRU eviction."""

    def __init__(self) -> None:
        self._agents: dict[UUID, AgentContext] = {}
        self._last_access: dict[UUID, float] = {}

    def _evict_stale(self) -> None:
        """Remove expired entries and evict LRU if over capacity."""
        now = time.monotonic()
        expired = [
            aid for aid, ts in self._last_access.items()
            if now - ts > MAX_AGE_SECONDS
        ]
        for aid in expired:
            self._agents.pop(aid, None)
            self._last_access.pop(aid, None)

        while len(self._agents) > MAX_AGENTS:
            oldest = min(self._last_access, key=self._last_access.get)
            self._agents.pop(oldest, None)
            self._last_access.pop(oldest, None)

    def get_or_create(
        self,
        agent_id: UUID,
        agent_name: str,
        expertise: list[str],
        goals: list[str],
        values: list[str],
        communication_style: str | None,
        system_prompt: str | None,
        user_id: str = "",
    ) -> AgentContext:
        """Return existing context or create a new one for this agent."""
        if agent_id not in self._agents:
            self._evict_stale()
            # Use the stored progressive prompt from DB when available;
            # fall back to the simple builder only if there's no stored prompt.
            if system_prompt:
                full_prompt = system_prompt
            else:
                full_prompt = build_system_prompt(
                    agent_name=agent_name,
                    expertise=expertise,
                    goals=goals,
                    values=values,
                    communication_style=communication_style,
                    custom_prompt=None,
                )
            self._agents[agent_id] = AgentContext(
                agent_name=agent_name,
                system_prompt=full_prompt,
                agent_id=str(agent_id),
                user_id=user_id,
            )
        self._last_access[agent_id] = time.monotonic()
        return self._agents[agent_id]


# Singleton instance used across the application
agent_manager = AgentManager()
