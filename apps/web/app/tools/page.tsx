"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Loader2, Wrench, Filter } from "lucide-react";
import { NavSidebar } from "@/components/nav-sidebar";
import { ToolCard } from "@/components/tool-card";
import {
  listTools,
  getAgentTools,
  getAgentByUser,
  enableTool,
  disableTool,
} from "@/lib/api";
import type { RepoTool, AgentProfile } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { key: "all", label: "All Tools" },
  { key: "intelligence", label: "Intelligence" },
  { key: "financial", label: "Financial" },
  { key: "strategy", label: "Strategy" },
  { key: "operations", label: "Operations" },
  { key: "people", label: "People" },
  { key: "communication", label: "Communication" },
  { key: "collaboration", label: "Collaboration" },
];

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  all: "Browse and enable tools for your agent. Each tool extends your agent's capabilities.",
  intelligence: "Research, analysis, and market intelligence tools.",
  financial: "Financial modeling, valuation, and budgeting tools.",
  strategy: "Strategic frameworks, decision analysis, and risk assessment.",
  operations: "Process optimization, project planning, and resource management.",
  people: "Team dynamics, negotiation, and change management.",
  communication: "Executive summaries, presentations, and persuasive writing.",
  collaboration: "Workspace synthesis, gap analysis, and coordination tools.",
};

export default function ToolsPage() {
  const [allTools, setAllTools] = useState<RepoTool[]>([]);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async (uid: string) => {
    try {
      const [tools, profile] = await Promise.all([
        listTools(),
        getAgentByUser(uid).catch(() => null),
      ]);
      setAllTools(tools);
      setAgent(profile);

      if (profile) {
        const agentTools = await getAgentTools(profile.id);
        setEnabledIds(new Set(agentTools.map((t) => t.id)));
      }
    } catch (err) {
      console.error("Failed to load tools:", err);
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
      if (user) load(user.id);
      else setLoading(false);
    }
    init();
  }, [load]);

  async function handleToggle(toolId: string, enable: boolean) {
    if (!agent) return;

    setTogglingIds((prev) => new Set(prev).add(toolId));
    try {
      if (enable) {
        await enableTool(agent.id, toolId);
        setEnabledIds((prev) => new Set(prev).add(toolId));
      } else {
        await disableTool(agent.id, toolId);
        setEnabledIds((prev) => {
          const next = new Set(prev);
          next.delete(toolId);
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to toggle tool:", err);
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(toolId);
        return next;
      });
    }
  }

  // Filter tools
  const filteredTools = allTools.filter((tool) => {
    const matchesCategory = activeCategory === "all" || tool.category === activeCategory;
    const matchesSearch =
      !searchQuery ||
      tool.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Count tools per category
  const categoryCounts: Record<string, number> = { all: allTools.length };
  for (const tool of allTools) {
    categoryCounts[tool.category] = (categoryCounts[tool.category] || 0) + 1;
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
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3">
              <Wrench className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">Tool Repository</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {enabledIds.size} of {allTools.length} tools enabled for your agent
            </p>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border bg-card py-2.5 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Category tabs */}
          <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
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
                {categoryCounts[cat.key] ? ` (${categoryCounts[cat.key]})` : ""}
              </button>
            ))}
          </div>

          {/* Category description */}
          <p className="mb-5 text-xs text-muted-foreground">
            {CATEGORY_DESCRIPTIONS[activeCategory] || ""}
          </p>

          {/* Tool grid */}
          {filteredTools.length === 0 ? (
            <div className="rounded-lg border bg-card p-12 text-center">
              <Wrench className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                {searchQuery
                  ? "No tools match your search."
                  : "No tools in this category."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTools.map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  enabled={enabledIds.has(tool.id)}
                  onToggle={handleToggle}
                  loading={togglingIds.has(tool.id)}
                />
              ))}
            </div>
          )}

          {/* Summary footer */}
          {!loading && allTools.length > 0 && (
            <div className="mt-8 rounded-lg border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
              {enabledIds.size === 0
                ? "Enable tools to extend your agent's capabilities. Each tool gives your agent a new skill."
                : `Your agent has ${enabledIds.size} tool${enabledIds.size !== 1 ? "s" : ""} enabled across ${new Set(
                    allTools.filter((t) => enabledIds.has(t.id)).map((t) => t.category)
                  ).size} categories. These tools are available during conversations and workspace collaboration.`}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
