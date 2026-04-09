"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Wrench,
  FolderOpen,
  Bot,
  Users,
  Star,
  BarChart3,
  Loader2,
  Sparkles,
} from "lucide-react";
import { NavSidebar } from "@/components/nav-sidebar";
import { getCohortTrends, getCohortDigest } from "@/lib/api";
import type { CohortTrends, CohortDigest } from "@/lib/api";

export default function IntelligencePage() {
  const [trends, setTrends] = useState<CohortTrends | null>(null);
  const [digest, setDigest] = useState<CohortDigest | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [t, d] = await Promise.all([
        getCohortTrends().catch(() => null),
        getCohortDigest().catch(() => null),
      ]);
      setTrends(t);
      setDigest(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex h-screen">
      <NavSidebar />
      <main className="flex-1 overflow-auto">
        <header className="flex h-14 items-center border-b px-6 max-md:pl-14">
          <TrendingUp className="mr-2 h-5 w-5" />
          <h1 className="text-lg font-semibold">Cohort Insights</h1>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading insights...
          </div>
        ) : (
          <div className="p-4 sm:p-6 space-y-8">
            {/* Cohort Stats */}
            {trends?.cohort_stats && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Cohort Overview
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    label="Total Members"
                    value={trends.cohort_stats.total_users}
                  />
                  <StatCard
                    label="Avg Fidelity"
                    value={`${Math.round(trends.cohort_stats.avg_fidelity * 100)}%`}
                  />
                  <StatCard
                    label="North Stars Set"
                    value={trends.cohort_stats.agents_with_north_star}
                  />
                  <StatCard
                    label="Custom Agents"
                    value={trends.cohort_stats.total_custom_agents}
                  />
                </div>
              </div>
            )}

            {/* Top Tools */}
            {trends?.top_tools && trends.top_tools.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Wrench className="h-4 w-4" />
                  Most Used Tools
                </h2>
                <div className="space-y-2">
                  {trends.top_tools.map((tool, i) => (
                    <div
                      key={tool.name}
                      className="flex items-center gap-3 rounded-lg border bg-card p-3"
                    >
                      <span className="text-xs font-mono text-muted-foreground w-5 text-right">
                        {i + 1}.
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{tool.display_name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 rounded-full bg-primary/20 w-24">
                          <div
                            className="h-2 rounded-full bg-primary transition-all"
                            style={{
                              width: `${Math.min(
                                (tool.enabled_count /
                                  Math.max(trends.top_tools[0]?.enabled_count || 1, 1)) *
                                  100,
                                100
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-12 text-right">
                          {tool.enabled_count} agents
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active Workspaces */}
            {trends?.active_workspaces && trends.active_workspaces.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" />
                  Active Workspaces
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {trends.active_workspaces.map((ws) => (
                    <Link
                      key={ws.id}
                      href={`/workspaces/${ws.id}`}
                      className="rounded-lg border bg-card p-4 hover:bg-accent transition-colors"
                    >
                      <p className="text-sm font-medium">{ws.name}</p>
                      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{ws.member_count} members</span>
                        <span>{ws.recent_messages} messages (7d)</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Trending Agents */}
            {trends?.trending_agents && trends.trending_agents.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Trending Agents
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {trends.trending_agents.map((agent) => (
                    <Link
                      key={agent.id}
                      href={`/agent-repo/${agent.id}`}
                      className="rounded-lg border bg-card p-4 hover:bg-accent transition-colors"
                    >
                      <p className="text-sm font-medium">{agent.name}</p>
                      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{agent.clone_count} clones</span>
                        {agent.avg_rating > 0 && (
                          <span className="flex items-center gap-1">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {agent.avg_rating}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* What's New */}
            {digest && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  What&apos;s New (Last 7 Days)
                </h2>
                <div className="space-y-3">
                  {digest.new_agents.length > 0 && (
                    <div className="rounded-lg border bg-card p-4">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        New Agents
                      </p>
                      <div className="space-y-1">
                        {digest.new_agents.map((a) => (
                          <Link
                            key={a.id}
                            href={`/agent-repo/${a.id}`}
                            className="flex items-center justify-between text-sm hover:underline"
                          >
                            <span>{a.name}</span>
                            <span className="text-xs text-muted-foreground">
                              by {a.creator}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {digest.suggested_creations.length > 0 && (
                    <div className="rounded-lg border bg-card p-4">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Agent Opportunities
                      </p>
                      <div className="space-y-1">
                        {digest.suggested_creations.map((s, i) => (
                          <p key={i} className="text-sm text-muted-foreground">
                            {s}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {digest.new_agents.length === 0 &&
                    digest.suggested_creations.length === 0 && (
                      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
                        No new activity in the last 7 days.
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
