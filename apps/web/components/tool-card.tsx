"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Globe } from "lucide-react";
import type { RepoTool } from "@/lib/api";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<string, string> = {
  intelligence: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  financial: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  strategy: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  operations: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  people: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  communication: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  collaboration: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
};

interface ToolCardProps {
  tool: RepoTool;
  enabled: boolean;
  onToggle: (toolId: string, enabled: boolean) => void;
  loading?: boolean;
}

export function ToolCard({ tool, enabled, onToggle, loading }: ToolCardProps) {
  const [expanded, setExpanded] = useState(false);

  const categoryColor = CATEGORY_COLORS[tool.category] || "bg-gray-100 text-gray-800";

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 transition-all",
        enabled ? "border-primary/40 ring-1 ring-primary/20" : "border-border",
        "hover:shadow-sm"
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="text-2xl shrink-0" role="img" aria-label={tool.display_name}>
            {tool.icon}
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm leading-tight">{tool.display_name}</h3>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {tool.description}
            </p>
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={() => onToggle(tool.id, !enabled)}
          disabled={loading}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            enabled ? "bg-primary" : "bg-muted"
          )}
          role="switch"
          aria-checked={enabled}
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
          {tool.category}
        </span>
        {tool.is_workspace_aware && (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
            <Globe className="h-2.5 w-2.5" />
            workspace-aware
          </span>
        )}
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? "Hide details" : "Show schema"}
      </button>

      {/* Expanded schema */}
      {expanded && (
        <div className="mt-2 rounded-md bg-muted/50 p-3">
          <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
            Input Schema
          </h4>
          <pre className="text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap text-muted-foreground">
            {JSON.stringify(tool.input_schema, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
