"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, CheckCircle, FolderOpen } from "lucide-react";
import { NavSidebar } from "@/components/nav-sidebar";
import { AgentStatus } from "@/components/agent-status";
import { WorkspaceCard } from "@/components/workspace-card";
import { getAgentByUser, getApprovalCount, getWorkspaces } from "@/lib/api";
import type { AgentProfile, WorkspaceWithMembers } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function DashboardPage() {
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [workspaces, setWorkspaces] = useState<WorkspaceWithMembers[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const [profile, { count }, ws] = await Promise.all([
          getAgentByUser(user.id).catch(() => null),
          getApprovalCount(user.id),
          getWorkspaces(user.id).catch(() => [] as WorkspaceWithMembers[]),
        ]);
        setAgent(profile);
        setPendingCount(count);
        setWorkspaces(ws);
      } catch {
        // failed to load
      }
    }
    load();
  }, []);

  return (
    <div className="flex h-screen">
      <NavSidebar />
      <main className="flex-1 overflow-auto">
        <header className="flex h-14 items-center border-b px-6">
          <h1 className="text-lg font-semibold">Dashboard</h1>
        </header>
        <div className="p-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Agent Status Card */}
            <Link
              href="/chat"
              className="rounded-lg border bg-card p-6 transition-colors hover:bg-accent"
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
              className="rounded-lg border bg-card p-6 transition-colors hover:bg-accent"
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
              className="rounded-lg border bg-card p-6 transition-colors hover:bg-accent"
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
              <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {workspaces.slice(0, 6).map((ws) => (
                  <WorkspaceCard key={ws.id} workspace={ws} />
                ))}
              </div>
            </div>
          )}

          <div className="mt-8">
            <h2 className="text-sm font-medium text-muted-foreground">
              Recent Activity
            </h2>
            <div className="mt-3 rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
              No recent activity. Your agent will show updates here once
              configured.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
