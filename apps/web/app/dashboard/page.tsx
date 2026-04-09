"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, CheckCircle } from "lucide-react";
import { NavSidebar } from "@/components/nav-sidebar";
import { AgentStatus } from "@/components/agent-status";
import { getAgentByUser, getApprovalCount } from "@/lib/api";
import type { AgentProfile } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function DashboardPage() {
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const profile = await getAgentByUser(user.id);
        setAgent(profile);
        const { count } = await getApprovalCount(user.id);
        setPendingCount(count);
      } catch {
        // Agent not set up yet
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
            <div className="rounded-lg border bg-card p-6">
              <h3 className="text-sm font-medium text-muted-foreground">
                Workspaces
              </h3>
              <p className="mt-2 text-2xl font-bold">0</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Join or create a workspace
              </p>
            </div>
          </div>
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
