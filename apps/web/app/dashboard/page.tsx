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
  ensureAgent,
  getAnatomy,
} from "@/lib/api";
import type { AgentProfile, WorkspaceWithMembers, Notification, AgentAnatomy } from "@/lib/api";
import { AnatomyCompact } from "@/components/anatomy-display";
import { SuggestionsPanel } from "@/components/suggestions-panel";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useRealtimeAgentStatus, useRealtimeApprovals, useRealtimeNotifications } from "@/lib/realtime";

export default function DashboardPage() {
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [workspaces, setWorkspaces] = useState<WorkspaceWithMembers[]>([]);
  const [recentActivity, setRecentActivity] = useState<Notification[]>([]);
  const [anatomy, setAnatomy] = useState<AgentAnatomy | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async (uid: string) => {
    try {
      // Ensure template agent exists (idempotent)
      await ensureAgent(uid).catch(() => {});

      const [profile, { count }, ws, notifs, anatomyData] = await Promise.all([
        getAgentByUser(uid).catch(() => null),
        getApprovalCount(uid),
        getWorkspaces(uid).catch(() => [] as WorkspaceWithMembers[]),
        getNotifications(uid, false, 10).catch(() => [] as Notification[]),
        getAnatomy(uid).catch(() => null),
      ]);
      setAgent(profile);
      setPendingCount(count);
      setWorkspaces(ws);
      setRecentActivity(notifs);
      setAnatomy(anatomyData);
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
            {/* Fidelity Banner */}
            {agent && agent.fidelity != null && agent.fidelity < 0.7 && (
              <Link
                href="/profile"
                className="mb-4 flex items-center gap-4 rounded-lg border border-blue-200 bg-blue-50 p-4 transition-colors hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:hover:bg-blue-900"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Bring your twin to life
                  </p>
                  <p className="mt-0.5 text-xs text-blue-600 dark:text-blue-400">
                    {agent.fidelity <= 0.2
                      ? "Upload your IDP, Ethics paper, and Insights profile to teach your agent who you are."
                      : agent.fidelity < 0.55
                      ? "Your agent has its Brain. Upload more documents to add its Heart and Voice."
                      : "Almost there — add your deeper context to reach full fidelity."}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-blue-800 dark:text-blue-200">
                    {Math.round(agent.fidelity * 100)}%
                  </span>
                  <p className="text-[10px] text-blue-600 dark:text-blue-400">fidelity</p>
                </div>
              </Link>
            )}

            {/* Suggestions Panel */}
            {userId && <SuggestionsPanel userId={userId} />}

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
                    {anatomy ? (
                      <div className="mt-3">
                        <AnatomyCompact anatomy={anatomy} />
                      </div>
                    ) : agent.fidelity != null ? (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Fidelity</span>
                          <span className="font-medium">{Math.round(agent.fidelity * 100)}%</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-primary transition-all"
                            style={{ width: `${agent.fidelity * 100}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-2xl font-bold">Loading...</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Setting up your digital twin
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
