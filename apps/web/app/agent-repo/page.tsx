"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Loader2,
  Package,
  Filter,
  Plus,
  SortAsc,
} from "lucide-react";
import { NavSidebar } from "@/components/nav-sidebar";
import { CustomAgentCard } from "@/components/custom-agent-card";
import {
  listCustomAgents,
  getMyEnabledAgents,
  cloneCustomAgent,
  uncloneCustomAgent,
} from "@/lib/api";
import type { CustomAgent } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "financial", label: "Financial" },
  { key: "strategy", label: "Strategy" },
  { key: "research", label: "Research" },
  { key: "operations", label: "Operations" },
  { key: "custom", label: "Custom" },
];

const SORT_OPTIONS = [
  { key: "newest", label: "Newest" },
  { key: "most_cloned", label: "Most Cloned" },
  { key: "highest_rated", label: "Highest Rated" },
];

export default function AgentRepoPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  const load = useCallback(async (uid: string) => {
    try {
      const [agentList, enabled] = await Promise.all([
        listCustomAgents({ sort: sortBy }),
        getMyEnabledAgents(uid).catch(() => []),
      ]);
      setAgents(agentList);
      setEnabledIds(new Set(enabled.map((a) => a.id)));
    } catch (err) {
      console.error("Failed to load agents:", err);
    } finally {
      setLoading(false);
    }
  }, [sortBy]);

  useEffect(() => {
    async function init() {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        load(user.id);
      } else {
        setLoading(false);
      }
    }
    init();
  }, [load]);

  async function handleToggle(agentId: string, enable: boolean) {
    if (!userId) return;
    setTogglingIds((prev) => new Set(prev).add(agentId));
    try {
      if (enable) {
        const result = await cloneCustomAgent(agentId, userId);
        setEnabledIds((prev) => new Set(prev).add(agentId));
        // Update clone count in local state
        setAgents((prev) =>
          prev.map((a) =>
            a.id === agentId ? { ...a, clone_count: result.clone_count } : a
          )
        );
      } else {
        await uncloneCustomAgent(agentId, userId);
        setEnabledIds((prev) => {
          const next = new Set(prev);
          next.delete(agentId);
          return next;
        });
        setAgents((prev) =>
          prev.map((a) =>
            a.id === agentId
              ? { ...a, clone_count: Math.max(0, a.clone_count - 1) }
              : a
          )
        );
      }
    } catch (err) {
      console.error("Failed to toggle agent:", err);
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
    }
  }

  // Filter agents
  const filteredAgents = agents.filter((agent) => {
    const matchesCategory =
      activeCategory === "all" || agent.category === activeCategory;
    const matchesSearch =
      !searchQuery ||
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.purpose.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Count per category
  const categoryCounts: Record<string, number> = { all: agents.length };
  for (const agent of agents) {
    categoryCounts[agent.category] =
      (categoryCounts[agent.category] || 0) + 1;
  }

  if (loading) {
    return (
      <div className="flex h-screen">
        <NavSidebar />
        <main className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <NavSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          {/* Hero */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Package className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Agent Repository</h1>
              </div>
              <button
                onClick={() => router.push("/agent-repo/build")}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                Build Agent
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Build, share, and discover custom agents for Cohort 84
            </p>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border bg-card py-2.5 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Filters row */}
          <div className="mb-2 flex items-center justify-between gap-4">
            {/* Category tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
              <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    activeCategory === cat.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {cat.label}
                  {categoryCounts[cat.key]
                    ? ` (${categoryCounts[cat.key]})`
                    : ""}
                </button>
              ))}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-1.5 shrink-0">
              <SortAsc className="h-4 w-4 text-muted-foreground" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="rounded-md border bg-card px-2 py-1 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Agent grid */}
          {filteredAgents.length === 0 ? (
            <div className="rounded-lg border bg-card p-12 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                {searchQuery
                  ? "No agents match your search."
                  : agents.length === 0
                  ? "No custom agents yet. Be the first to build one!"
                  : "No agents in this category."}
              </p>
              {agents.length === 0 && (
                <button
                  onClick={() => router.push("/agent-repo/build")}
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  Build Your First Agent
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAgents.map((agent) => (
                <CustomAgentCard
                  key={agent.id}
                  agent={agent}
                  enabled={enabledIds.has(agent.id)}
                  onToggle={handleToggle}
                  loading={togglingIds.has(agent.id)}
                  onClick={() => router.push(`/agent-repo/${agent.id}`)}
                />
              ))}
            </div>
          )}

          {/* Summary footer */}
          {agents.length > 0 && (
            <div className="mt-8 rounded-lg border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
              {enabledIds.size === 0
                ? "Enable agents to add their capabilities to your account. Each agent brings specialized expertise."
                : `You have ${enabledIds.size} custom agent${enabledIds.size !== 1 ? "s" : ""} enabled.`}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
