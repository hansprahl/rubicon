"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { FolderOpen, User, Wrench } from "lucide-react";
import { getDirectoryUsers, getWorkspaces, listTools } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface MentionItem {
  id: string;
  label: string;
  sublabel?: string;
  category: "workspace" | "user" | "tool";
  insertText: string;
}

interface MentionPopupProps {
  query: string;
  onSelect: (item: MentionItem) => void;
  onClose: () => void;
  visible: boolean;
}

const CATEGORY_ICONS = {
  workspace: FolderOpen,
  user: User,
  tool: Wrench,
};

const CATEGORY_LABELS = {
  workspace: "Workspaces",
  user: "People",
  tool: "Tools",
};

export function MentionPopup({ query, onSelect, onClose, visible }: MentionPopupProps) {
  const [items, setItems] = useState<MentionItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const popupRef = useRef<HTMLDivElement>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [users, workspaces, tools] = await Promise.all([
        getDirectoryUsers(),
        getWorkspaces(user.id),
        listTools(),
      ]);

      const all: MentionItem[] = [];

      // Workspaces
      for (const ws of workspaces) {
        all.push({
          id: ws.id,
          label: ws.name,
          sublabel: ws.description || undefined,
          category: "workspace",
          insertText: `@workspace:${ws.name}`,
        });
      }

      // Users (exclude self)
      for (const u of users) {
        if (u.id === user.id) continue;
        all.push({
          id: u.id,
          label: u.display_name || u.email,
          sublabel: u.agent_name || u.email,
          category: "user",
          insertText: `@user:${u.display_name || u.email}`,
        });
      }

      // Tools
      for (const t of tools) {
        all.push({
          id: t.id,
          label: t.display_name,
          sublabel: t.category,
          category: "tool",
          insertText: `@tool:${t.name}`,
        });
      }

      setItems(all);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadItems();
    }
  }, [visible, loadItems]);

  // Filter by query
  const filtered = items.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()) ||
    (item.sublabel || "").toLowerCase().includes(query.toLowerCase())
  );

  // Group by category
  const grouped: Record<string, MentionItem[]> = {};
  for (const item of filtered) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }
  const flatFiltered = Object.values(grouped).flat();

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatFiltered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (flatFiltered[selectedIndex]) {
          onSelect(flatFiltered[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visible, flatFiltered, selectedIndex, onSelect, onClose]);

  if (!visible) return null;

  return (
    <div
      ref={popupRef}
      className="absolute bottom-full left-0 mb-2 w-[calc(100vw-2rem)] max-h-64 overflow-auto rounded-lg border bg-card shadow-lg sm:w-72"
    >
      {loading ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">Loading...</div>
      ) : flatFiltered.length === 0 ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">No matches</div>
      ) : (
        Object.entries(grouped).map(([category, categoryItems]) => {
          const Icon = CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS];
          return (
            <div key={category}>
              <div className="sticky top-0 bg-card px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}
              </div>
              {categoryItems.map((item) => {
                const globalIndex = flatFiltered.indexOf(item);
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                      globalIndex === selectedIndex && "bg-accent"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{item.label}</div>
                      {item.sublabel && (
                        <div className="truncate text-xs text-muted-foreground">
                          {item.sublabel}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}
