"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, CheckCircle, FolderOpen, Loader2 } from "lucide-react";
import { NavSidebar } from "@/components/nav-sidebar";
import { AgentStatus } from "@/components/agent-status";
import { WorkspaceCard } from "@/components/workspace-card";
import {
  getAgentByUser,
  getAgent,
  getApprovalCount,
  getWorkspaces,
  getNotifications,
} from "@/lib/api";
import type { AgentProfile, WorkspaceWithMembers, Notification } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useRealtimeAgentStatus, useRealtimeApprovals, useRealtimeNotifications } from "@/lib/realtime";

export default function DashboardPage() {
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [workspaces, setWorkspaces] = useState<WorkspaceWithMembers[]>([]);
  const [recentActivity, setRecentActivity] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async (uid: string) => {
    try {
      const [profile, { count }, ws, notifs] = await Promise.all([
        getAgentByUser(uid).catch(() => null),
        getApprovalCount(uid),
        getWorkspaces(uid).catch(() => [] as WorkspaceWithMembers[]),
        getNotifications(uid, false, 10).catch(() => [] as Notification[]),
      ]);
      setAgent(profile);
      setPendingCount(count);
      setWorkspaces(ws);
      setRecentActivity(notifs);
    } catch {
      // failed to load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      load(user.id);
    }
    init();
  }, [load]);

  // Realtime updates
  useRealtimeApprovals(userId, () => {
    if (userId) getApprovalCount(userId).then(({ count }) => setPendingCount(count)).catch(() => {});
  });

  useRealtimeAgentStatus(agent?.id || null, () => {
    if (agent) getAgent(agent.id).then(setAgent).catch(() => {});
  });

  useRealtimeNotifications(userId, () => {
    if (userId) getNotifications(userId, false, 10).then(setRecentActivity).catch(() => {});
  });

  const categoryIcons: Record<string, string> = {
    approval: "text-purple-500",
    disagreement: "text-red-500",
    milestone: "text-blue-500",
    agent: "text-amber-500",
    workspace: "text-green-500",
    info: "text-gray-500",
  };

  return (
    <div className="flex h-screen">
      <NavSidebar />
      <main className="flex-1 overflow-auto">
        <header className="flex h-14 items-center border-b px-6 max-md:pl-14">
          <h1 className="text-lg font-semibold">Dashboard</h1>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading dashboard...
          </div>
        ) : (
          <div className="p-4 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Agent Status Card */}
              <Link
                href="/chat"
                className="rounded-lg border bg-card p-5 transition-colors hover:bg-accent sm:p-6"
              >
                <h3 className="text-sm font-medium text-muted-foreground">
                  Agent Status
                </h3>
                {agent ? (
                  <div className="mt-3">
                    <AgentStatus
                      status={agent.status}
                      agentName={agent.agent_name}
                    />
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-2xl font-bold">Not configured</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Complete onboarding to create your digital twin
                    </p>
                  </>
                )}
                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <MessageSquare className="h-3 w-3" />
                  Open chat
                </div>
              </Link>

              <Link
                href="/approvals"
                className="rounded-lg border bg-card p-5 transition-colors hover:bg-accent sm:p-6"
              >
                <h3 className="text-sm font-medium text-muted-foreground">
                  Pending Approvals
                </h3>
                <p className="mt-2 text-2xl font-bold">{pendingCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pendingCount === 0
                    ? "No actions awaiting review"
                    : `${pendingCount} action${pendingCount === 1 ? "" : "s"} awaiting review`}
                </p>
                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckCircle className="h-3 w-3" />
                  Review approvals
                </div>
              </Link>

              <Link
                href="/workspaces"
                className="rounded-lg border bg-card p-5 transition-colors hover:bg-accent sm:p-6"
              >
                <h3 className="text-sm font-medium text-muted-foreground">
                  Workspaces
                </h3>
                <p className="mt-2 text-2xl font-bold">{workspaces.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {workspaces.length === 0
                    ? "Join or create a workspace"
                    : `${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"} active`}
                </p>
                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <FolderOpen className="h-3 w-3" />
                  View workspaces
                </div>
              </Link>
            </div>

            {/* Workspace cards */}
            {workspaces.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    Your Workspaces
                  </h2>
                  <Link
                    href="/workspaces"
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    View all
                  </Link>
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {workspaces.slice(0, 6).map((ws) => (
                    <WorkspaceCard key={ws.id} workspace={ws} />
                  ))}
                </div>
              </div>
            )}

            {/* Recent Activity */}
            <div className="mt-8">
              <h2 className="text-sm font-medium text-muted-foreground">
                Recent Activity
              </h2>
              {recentActivity.length === 0 ? (
                <div className="mt-3 rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
                  No recent activity. Your agent will show updates here once
                  configured.
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {recentActivity.map((notif) => (
                    <div
                      key={notif.id}
                      className="flex items-start gap-3 rounded-lg border bg-card p-3"
                    >
                      <span
                        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                          categoryIcons[notif.category]?.replace("text-", "bg-") || "bg-gray-500"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{notif.title}</p>
                        {notif.body && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {notif.body}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {new Date(notif.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
