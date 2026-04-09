/**
 * Supabase Realtime subscription hooks for live updates.
 *
 * Each hook subscribes to postgres_changes on a specific table and
 * calls a callback when rows are inserted, updated, or deleted.
 */

import { useEffect, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type ChangeCallback = () => void;

/**
 * Generic hook to subscribe to any table's changes.
 * Calls `onchange` whenever a matching row event occurs.
 */
export function useRealtimeTable(
  table: string,
  filter: string | null,
  onChange: ChangeCallback,
  channelName?: string
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!filter && !channelName) return;

    const supabase = createBrowserSupabaseClient();
    const name = `${channelName || `rt-${table}-${filter || "all"}`}-${Date.now()}`;

    const channelConfig: Record<string, unknown> = {
      event: "*",
      schema: "public",
      table,
    };
    if (filter) {
      channelConfig.filter = filter;
    }

    const channel = supabase
      .channel(name)
      .on(
        "postgres_changes",
        channelConfig as unknown,
        () => {
          onChangeRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, channelName]);
}

/** Subscribe to messages in a workspace or agent chat */
export function useRealtimeMessages(
  entityId: string | null,
  entityType: "workspace" | "agent",
  onChange: ChangeCallback
) {
  const filterCol = entityType === "workspace" ? "workspace_id" : "agent_id";
  const filter = entityId ? `${filterCol}=eq.${entityId}` : null;
  useRealtimeTable("messages", filter, onChange, entityId ? `rt-messages-${entityId}` : undefined);
}

/** Subscribe to approval changes for a user */
export function useRealtimeApprovals(
  userId: string | null,
  onChange: ChangeCallback
) {
  const filter = userId ? `user_id=eq.${userId}` : null;
  useRealtimeTable("approvals", filter, onChange, userId ? `rt-approvals-${userId}` : undefined);
}

/** Subscribe to agent status changes */
export function useRealtimeAgentStatus(
  agentId: string | null,
  onChange: ChangeCallback
) {
  const filter = agentId ? `id=eq.${agentId}` : null;
  useRealtimeTable("agent_profiles", filter, onChange, agentId ? `rt-agent-${agentId}` : undefined);
}

/** Subscribe to notification changes for a user */
export function useRealtimeNotifications(
  userId: string | null,
  onChange: ChangeCallback
) {
  const filter = userId ? `user_id=eq.${userId}` : null;
  useRealtimeTable("notifications", filter, onChange, userId ? `rt-notif-${userId}` : undefined);
}

/** Subscribe to task changes in a workspace */
export function useRealtimeTasks(
  workspaceId: string | null,
  onChange: ChangeCallback
) {
  const filter = workspaceId ? `workspace_id=eq.${workspaceId}` : null;
  useRealtimeTable("agent_tasks", filter, onChange, workspaceId ? `rt-tasks-${workspaceId}` : undefined);
}

/** Subscribe to feed (messages) in a workspace */
export function useRealtimeFeed(
  workspaceId: string | null,
  onChange: ChangeCallback
) {
  const filter = workspaceId ? `workspace_id=eq.${workspaceId}` : null;
  useRealtimeTable("messages", filter, onChange, workspaceId ? `rt-feed-${workspaceId}` : undefined);
}

/** Subscribe to entity changes in a workspace */
export function useRealtimeEntities(
  workspaceId: string | null,
  onChange: ChangeCallback
) {
  const filter = workspaceId ? `workspace_id=eq.${workspaceId}` : null;
  useRealtimeTable("shared_entities", filter, onChange, workspaceId ? `rt-entities-${workspaceId}` : undefined);
}
