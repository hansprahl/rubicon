"use client";

import { Star, Users, Lock, Globe, Building } from "lucide-react";
import type { CustomAgent } from "@/lib/api";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<string, string> = {
  financial: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  strategy: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  research: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  operations: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  custom: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

const VISIBILITY_CONFIG: Record<string, { icon: typeof Globe; label: string; className: string }> = {
  cohort: {
    icon: Users,
    label: "Cohort",
    className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  },
  workspace: {
    icon: Building,
    label: "Workspace",
    className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  },
  private: {
    icon: Lock,
    label: "Private",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  },
};

interface CustomAgentCardProps {
  agent: CustomAgent;
  enabled: boolean;
  onToggle: (agentId: string, enable: boolean) => void;
  loading?: boolean;
  onClick?: () => void;
}

export function CustomAgentCard({ agent, enabled, onToggle, loading, onClick }: CustomAgentCardProps) {
  const categoryColor = CATEGORY_COLORS[agent.category] || CATEGORY_COLORS.custom;
  const visConfig = VISIBILITY_CONFIG[agent.visibility] || VISIBILITY_CONFIG.cohort;
  const VisIcon = visConfig.icon;

  const avgRating = agent.rating_count > 0 ? agent.rating_sum / agent.rating_count : 0;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 transition-all hover:shadow-sm",
        enabled ? "border-primary/40 ring-1 ring-primary/20" : "border-border"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex items-start gap-3 min-w-0 cursor-pointer flex-1"
          onClick={onClick}
        >
          <span className="text-2xl shrink-0" role="img" aria-label={agent.name}>
            {agent.icon}
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm leading-tight">{agent.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {agent.description}
            </p>
          </div>
        </div>

        {/* Enable toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(agent.id, !enabled);
          }}
          disabled={loading}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            enabled ? "bg-primary" : "bg-muted"
          )}
          role="switch"
          aria-checked={enabled}
          aria-label={enabled ? "Disable agent" : "Enable agent"}
        >
          <span
            className={cn(
              "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
              enabled ? "translate-x-5" : "translate-x-0"
            )}
          />
        </button>
      </div>

      {/* Badges */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", categoryColor)}>
          {agent.category}
        </span>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", visConfig.className)}>
          <VisIcon className="h-2.5 w-2.5" />
          {visConfig.label}
        </span>
      </div>

      {/* Footer: creator, clones, rating */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="truncate">by {agent.creator_name || "Unknown"}</span>
        <div className="flex items-center gap-3 shrink-0">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {agent.clone_count}
          </span>
          {agent.rating_count > 0 && (
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {avgRating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
