"use client";

import { useCallback, useEffect, useState } from "react";
import { NavSidebar } from "@/components/nav-sidebar";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  listFeedback,
  createFeedback,
  upvoteFeedback,
  getFeedbackStats,
} from "@/lib/api";
import type { Feedback, FeedbackStats } from "@/lib/api";
import {
  ChevronUp,
  MessageSquarePlus,
  X,
  Bug,
  Lightbulb,
  Sparkles,
  MessageSquare,
} from "lucide-react";

// ── Badge helpers ──────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  bug: { label: "Bug", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400", icon: Bug },
  feature: { label: "Feature", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400", icon: Lightbulb },
  improvement: { label: "Improvement", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400", icon: Sparkles },
  general: { label: "General", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400", icon: MessageSquare },
} as const;

const STATUS_CONFIG = {
  open: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  in_review: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  planned: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
  fixed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  closed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  wont_fix: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
} as const;

function TypeBadge({ type }: { type: Feedback["type"] }) {
  const cfg = TYPE_CONFIG[type];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: Feedback["status"] }) {
  const cls = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
  const label = status.replace("_", " ");
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {label}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Submit Modal ───────────────────────────────────────────────────────────

interface SubmitModalProps {
  onClose: () => void;
  onSubmit: (data: { type: string; title: string; body: string; page_url?: string }) => Promise<void>;
  defaultPageUrl?: string;
}

function SubmitModal({ onClose, onSubmit, defaultPageUrl }: SubmitModalProps) {
  const [type, setType] = useState<string>("general");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError("Title and description are required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({ type, title: title.trim(), body: body.trim(), page_url: defaultPageUrl });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-[calc(100vw-2rem)] sm:max-w-md rounded-xl border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Submit Feedback</h2>
          <button onClick={onClose} className="rounded p-2 text-muted-foreground hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Type</label>
            <div className="grid grid-cols-4 gap-2">
              {(["bug", "feature", "improvement", "general"] as const).map((t) => {
                const cfg = TYPE_CONFIG[t];
                const Icon = cfg.icon;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs font-medium transition-colors ${
                      type === t
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Title</label>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
              placeholder="Short summary of the issue or idea"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Description</label>
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
              placeholder="Describe what happened, what you expected, or your idea in detail"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {defaultPageUrl && (
            <p className="text-xs text-muted-foreground">
              Page: <span className="font-mono">{defaultPageUrl}</span>
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Feedback Card ──────────────────────────────────────────────────────────

interface FeedbackCardProps {
  item: Feedback;
  onUpvote: (id: string) => void;
}

function FeedbackCard({ item, onUpvote }: FeedbackCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex gap-3">
        {/* Upvote button */}
        <button
          onClick={() => onUpvote(item.id)}
          className={`flex shrink-0 flex-col items-center gap-0.5 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
            item.user_upvoted
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          <ChevronUp className="h-4 w-4" />
          {item.upvotes}
        </button>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <TypeBadge type={item.type} />
            <StatusBadge status={item.status} />
          </div>
          <p className="mb-1 text-sm font-medium leading-snug">{item.title}</p>
          <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">{item.body}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {item.users?.display_name && <span>{item.users.display_name}</span>}
            {item.users?.display_name && <span>·</span>}
            <span>{timeAgo(item.created_at)}</span>
            {item.page_url && (
              <>
                <span>·</span>
                <span className="max-w-[160px] truncate font-mono">{item.page_url}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

type Tab = "all" | "bug" | "feature" | "improvement";
type Sort = "newest" | "upvotes" | "status";

export default function FeedbackPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Feedback[]>([]);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [showModal, setShowModal] = useState(false);
  const [pageUrl, setPageUrl] = useState("");

  const load = useCallback(
    async (uid: string, activeTab: Tab, activeSort: Sort) => {
      setLoading(true);
      try {
        const [feedbackData, statsData] = await Promise.all([
          listFeedback({
            type: activeTab === "all" ? undefined : activeTab,
            sort: activeSort,
            userId: uid,
          }),
          getFeedbackStats(),
        ]);
        setItems(feedbackData);
        setStats(statsData);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    async function init() {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      setPageUrl(window.location.pathname);
      load(user.id, tab, sort);
    }
    init();
  }, [load, tab, sort]);

  async function handleUpvote(feedbackId: string) {
    if (!userId) return;
    try {
      const { upvoted, upvotes } = await upvoteFeedback(feedbackId, userId);
      setItems((prev) =>
        prev.map((item) =>
          item.id === feedbackId
            ? { ...item, upvotes, user_upvoted: upvoted }
            : item
        )
      );
    } catch {
      // ignore
    }
  }

  async function handleSubmit(data: { type: string; title: string; body: string; page_url?: string }) {
    if (!userId) return;
    const created = await createFeedback(userId, data);
    // Reload to show the new item
    setItems((prev) => [{ ...created, user_upvoted: false }, ...prev]);
    if (stats) {
      setStats({ ...stats, total: stats.total + 1 });
    }
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "all", label: "All", count: stats?.total },
    { key: "bug", label: "Bugs", count: stats?.open_bugs },
    { key: "feature", label: "Features", count: stats?.open_features },
    { key: "improvement", label: "Improvements", count: stats?.open_improvements },
  ];

  return (
    <div className="flex h-screen">
      <NavSidebar />
      <main className="flex-1 overflow-auto">
        <header className="flex h-14 items-center justify-between border-b px-6 max-md:pl-14">
          <h1 className="text-lg font-semibold">Feedback</h1>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <MessageSquarePlus className="h-4 w-4" />
            Submit Feedback
          </button>
        </header>

        <div className="p-6">
          {/* Tabs + sort */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                    tab === t.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {t.label}
                  {t.count !== undefined && t.count > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                      tab === t.key ? "bg-white/20" : "bg-muted"
                    }`}>
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-1">
              {(["newest", "upvotes", "status"] as Sort[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                    sort === s
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {s === "upvotes" ? "Most Upvoted" : s === "newest" ? "Newest" : "By Status"}
                </button>
              ))}
            </div>
          </div>

          {/* Items */}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border bg-card py-12 text-center">
              <MessageSquarePlus className="mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">No feedback yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Be the first to submit feedback, a bug report, or feature request.
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Submit Feedback
              </button>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-3">
              {items.map((item) => (
                <FeedbackCard key={item.id} item={item} onUpvote={handleUpvote} />
              ))}
            </div>
          )}
        </div>
      </main>

      {showModal && (
        <SubmitModal
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          defaultPageUrl={pageUrl}
        />
      )}
    </div>
  );
}
