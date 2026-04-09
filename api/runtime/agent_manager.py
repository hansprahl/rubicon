"""Agent manager — spawns and manages agent instances per user.

Each user has at most one active agent context in memory. The manager
handles lifecycle (create, get, stop) and status tracking.
"""

from __future__ import annotations

from uuid import UUID

from api.runtime.agent_worker import AgentContext, build_system_prompt


class AgentManager:
    """In-memory registry of active agent contexts, keyed by agent profile ID."""

    def __init__(self) -> None:
        self._agents: dict[UUID, AgentContext] = {}

    def get_or_create(
        self,
        agent_id: UUID,
        agent_name: str,
        expertise: list[str],
        goals: list[str],
        values: list[str],
        communication_style: str | None,
        system_prompt: str | None,
    ) -> AgentContext:
        """Return existing context or create a new one for this agent."""
        if agent_id not in self._agents:
            full_prompt = build_system_prompt(
                agent_name=agent_name,
                expertise=expertise,
                goals=goals,
                values=values,
                communication_style=communication_style,
                custom_prompt=system_prompt,
            )
            self._agents[agent_id] = AgentContext(
                agent_name=agent_name,
                system_prompt=full_prompt,
            )
        return self._agents[agent_id]

    def get(self, agent_id: UUID) -> AgentContext | None:
        return self._agents.get(agent_id)

    def stop(self, agent_id: UUID) -> bool:
        """Remove an agent context, freeing memory. Returns True if it existed."""
        return self._agents.pop(agent_id, None) is not None

    def is_active(self, agent_id: UUID) -> bool:
        return agent_id in self._agents

    def active_count(self) -> int:
        return len(self._agents)


# Singleton instance used across the application
agent_manager = AgentManager()
