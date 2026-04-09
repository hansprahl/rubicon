"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Wrench,
  Bot,
  HeartPulse,
  Star,
  FolderOpen,
  Plus,
  X,
  Lightbulb,
} from "lucide-react";
import { getSuggestions, dismissSuggestion } from "@/lib/api";
import type { Suggestion } from "@/lib/api";

const typeIcons: Record<string, typeof Wrench> = {
  tool: Wrench,
  agent: Bot,
  fidelity: HeartPulse,
  north_star: Star,
  workspace: FolderOpen,
  creation: Plus,
};

const typeColors: Record<string, string> = {
  tool: "text-orange-500",
  agent: "text-purple-500",
  fidelity: "text-rose-500",
  north_star: "text-yellow-500",
  workspace: "text-green-500",
  creation: "text-blue-500",
};

export function SuggestionsPanel({ userId }: { userId: string }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getSuggestions(userId);
      setSuggestions(data.filter((s) => !s.dismissed).slice(0, 5));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDismiss(id: string) {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    try {
      await dismissSuggestion(id);
    } catch {
      // re-fetch on error
      load();
    }
  }

  if (loading || suggestions.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-medium text-muted-foreground">
          Suggestions for you
        </h2>
      </div>
      <div className="space-y-2">
        {suggestions.map((s) => {
          const Icon = typeIcons[s.suggestion_type] || Lightbulb;
          const color = typeColors[s.suggestion_type] || "text-gray-500";
          return (
            <div
              key={s.id}
              className="flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50"
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
              <div className="min-w-0 flex-1">
                {s.action_url ? (
                  <Link href={s.action_url} className="text-sm font-medium hover:underline">
                    {s.title}
                  </Link>
                ) : (
                  <p className="text-sm font-medium">{s.title}</p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">{s.body}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {s.action_url && (
                  <Link
                    href={s.action_url}
                    className="rounded-md px-2 py-1 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Go
                  </Link>
                )}
                <button
                  onClick={() => handleDismiss(s.id)}
                  className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
