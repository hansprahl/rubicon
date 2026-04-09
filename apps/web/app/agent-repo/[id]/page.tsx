"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Star,
  Users,
  Lock,
  Building,
  Package,
  Pencil,
  Archive,
  Check,
  X,
} from "lucide-react";
import { NavSidebar } from "@/components/nav-sidebar";
import {
  getCustomAgent,
  cloneCustomAgent,
  uncloneCustomAgent,
  rateCustomAgent,
  deleteCustomAgent,
  getMyEnabledAgents,
} from "@/lib/api";
import type { CustomAgent } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<string, string> = {
  financial: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  strategy: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  research: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  operations: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  custom: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  const [userId, setUserId] = useState<string | null>(null);
  const [agent, setAgent] = useState<CustomAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [toggling, setToggling] = useState(false);

  // Rating form
  const [showRating, setShowRating] = useState(false);
  const [ratingValue, setRatingValue] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);

  const loadAgent = useCallback(
    async (uid: string) => {
      try {
        const [agentData, enabledAgents] = await Promise.all([
          getCustomAgent(agentId),
          getMyEnabledAgents(uid).catch(() => []),
        ]);
        setAgent(agentData);
        setEnabled(enabledAgents.some((a) => a.id === agentId));
      } catch {
        // Agent not found
      } finally {
        setLoading(false);
      }
    },
    [agentId]
  );

  useEffect(() => {
    async function init() {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        loadAgent(user.id);
      } else {
        setLoading(false);
      }
    }
    init();
  }, [loadAgent]);

  async function handleToggle() {
    if (!userId || !agent) return;
    setToggling(true);
    try {
      if (enabled) {
        await uncloneCustomAgent(agentId, userId);
        setEnabled(false);
        setAgent({ ...agent, clone_count: Math.max(0, agent.clone_count - 1) });
      } else {
        const result = await cloneCustomAgent(agentId, userId);
        setEnabled(true);
        setAgent({ ...agent, clone_count: result.clone_count });
      }
    } catch (err) {
      console.error("Toggle failed:", err);
    } finally {
      setToggling(false);
    }
  }

  async function handleRate() {
    if (!userId || !agent || ratingValue < 1) return;
    setSubmittingRating(true);
    try {
      const result = await rateCustomAgent(agentId, userId, ratingValue, reviewText || undefined);
      setAgent({
        ...agent,
        rating_sum: result.average_rating * result.rating_count,
        rating_count: result.rating_count,
      });
      setShowRating(false);
      setRatingValue(0);
      setReviewText("");
      // Reload to get updated reviews
      loadAgent(userId);
    } catch (err) {
      console.error("Rating failed:", err);
    } finally {
      setSubmittingRating(false);
    }
  }

  async function handleArchive() {
    if (!userId || !agent) return;
    if (!confirm("Archive this agent? It will be hidden from the repository.")) return;
    try {
      await deleteCustomAgent(agentId, userId);
      router.push("/agent-repo");
    } catch (err) {
      console.error("Archive failed:", err);
    }
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

  if (!agent) {
    return (
      <div className="flex h-screen">
        <NavSidebar />
        <main className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <Package className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">Agent not found.</p>
            <button
              onClick={() => router.push("/agent-repo")}
              className="mt-4 inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Repository
            </button>
          </div>
        </main>
      </div>
    );
  }

  const isOwner = userId === agent.created_by;
  const avgRating = agent.rating_count > 0 ? agent.rating_sum / agent.rating_count : 0;
  const categoryColor = CATEGORY_COLORS[agent.category] || CATEGORY_COLORS.custom;

  return (
    <div className="flex min-h-screen">
      <NavSidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">
          {/* Back link */}
          <button
            onClick={() => router.push("/agent-repo")}
            className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Repository
          </button>

          {/* Agent header */}
          <div className="mb-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <span className="text-5xl">{agent.icon}</span>
                <div>
                  <h1 className="text-2xl font-bold">{agent.name}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {agent.description}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", categoryColor)}>
                      {agent.category}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      {agent.visibility === "cohort" && <Users className="h-3 w-3" />}
                      {agent.visibility === "workspace" && <Building className="h-3 w-3" />}
                      {agent.visibility === "private" && <Lock className="h-3 w-3" />}
                      {agent.visibility}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      by {agent.creator_name}
                    </span>
                  </div>
                </div>
              </div>

              {/* Enable/Disable toggle */}
              <button
                onClick={handleToggle}
                disabled={toggling}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  enabled
                    ? "border border-red-500/30 text-red-400 hover:bg-red-950/30"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                  "disabled:opacity-50"
                )}
              >
                {toggling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : enabled ? (
                  "Disable"
                ) : (
                  "Enable for My Account"
                )}
              </button>
            </div>

            {/* Stats */}
            <div className="mt-4 flex items-center gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {agent.clone_count} enabled
              </span>
              {agent.rating_count > 0 && (
                <span className="flex items-center gap-1.5">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  {avgRating.toFixed(1)} ({agent.rating_count} rating{agent.rating_count !== 1 ? "s" : ""})
                </span>
              )}
            </div>
          </div>

          {/* Purpose */}
          <section className="mb-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Purpose
            </h3>
            <p className="rounded-lg border bg-card p-4 text-sm leading-relaxed">
              {agent.purpose}
            </p>
          </section>

          {/* Expertise */}
          {agent.expertise.length > 0 && (
            <section className="mb-6">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Expertise
              </h3>
              <div className="flex flex-wrap gap-2">
                {agent.expertise.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full border bg-card px-3 py-1 text-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Tools */}
          {agent.tools.length > 0 && (
            <section className="mb-6">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Tools ({agent.tools.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {agent.tools.map((tool) => (
                  <span
                    key={tool}
                    className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Doctrine Components */}
          {Object.keys(agent.doctrine_components).length > 0 && (
            <section className="mb-6">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Doctrine Components
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(agent.doctrine_components).map(([key, val]) => (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm"
                  >
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        val ? "bg-green-500" : "bg-gray-400"
                      )}
                    />
                    <span className="capitalize">{key.replace(/_/g, " ")}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Rating section */}
          <section className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Reviews
              </h3>
              {!isOwner && (
                <button
                  onClick={() => setShowRating(!showRating)}
                  className="text-xs text-primary hover:text-primary/80"
                >
                  {showRating ? "Cancel" : "Rate this agent"}
                </button>
              )}
            </div>

            {/* Rating form */}
            {showRating && (
              <div className="mb-4 rounded-lg border bg-card p-4">
                <div className="mb-3">
                  <label className="mb-1.5 block text-sm font-medium">
                    Your Rating
                  </label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        onClick={() => setRatingValue(val)}
                        className="p-0.5"
                      >
                        <Star
                          className={cn(
                            "h-6 w-6 transition-colors",
                            val <= ratingValue
                              ? "fill-amber-400 text-amber-400"
                              : "text-muted-foreground/30"
                          )}
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mb-3">
                  <label className="mb-1.5 block text-sm font-medium">
                    Review (optional)
                  </label>
                  <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Share your experience with this agent..."
                    rows={3}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <button
                  onClick={handleRate}
                  disabled={ratingValue < 1 || submittingRating}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {submittingRating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Rating"
                  )}
                </button>
              </div>
            )}

            {/* Reviews list */}
            {agent.reviews && agent.reviews.length > 0 ? (
              <div className="space-y-3">
                {agent.reviews.map((review) => (
                  <div
                    key={review.id}
                    className="rounded-lg border bg-card p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {review.reviewer_name}
                      </span>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((val) => (
                          <Star
                            key={val}
                            className={cn(
                              "h-3 w-3",
                              val <= review.rating
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted-foreground/30"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    {review.review && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {review.review}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground/60">
                      {new Date(review.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No reviews yet. Be the first to rate this agent.
              </p>
            )}
          </section>

          {/* Owner actions */}
          {isOwner && (
            <section className="border-t pt-6">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Manage
              </h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push(`/agent-repo/build`)}
                  className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
                <button
                  onClick={handleArchive}
                  className="inline-flex items-center gap-2 rounded-md border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-950/30"
                >
                  <Archive className="h-4 w-4" />
                  Archive
                </button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
