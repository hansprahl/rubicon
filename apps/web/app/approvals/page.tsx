"use client";

import { useCallback, useEffect, useState } from "react";
import { NavSidebar } from "@/components/nav-sidebar";
import { ApprovalCard } from "@/components/approval-card";
import {
  getApprovals,
  approveAction,
  rejectAction,
  editAndApprove,
} from "@/lib/api";
import type { ApprovalWithAgent } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalWithAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">(
    "pending"
  );

  const load = useCallback(
    async (uid: string, status: string) => {
      try {
        const data = await getApprovals(uid, status);
        setApprovals(data);
      } catch {
        // failed to load
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    async function init() {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      load(user.id, filter);

      // Realtime subscription for new approvals
      const channel = supabase
        .channel("approvals-realtime")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "approvals",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            // Reload on any change to this user's approvals
            load(user.id, filter);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
    init();
  }, [filter, load]);

  async function handleApprove(id: string, note?: string) {
    await approveAction(id, note);
    setApprovals((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleReject(id: string, note?: string) {
    await rejectAction(id, note);
    setApprovals((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleEditApprove(
    id: string,
    payload: Record<string, unknown>,
    note?: string
  ) {
    await editAndApprove(id, payload, note);
    setApprovals((prev) => prev.filter((a) => a.id !== id));
  }

  const pendingCount = approvals.length;

  return (
    <div className="flex h-screen">
      <NavSidebar />
      <main className="flex-1 overflow-auto">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">Approvals</h1>
            {filter === "pending" && pendingCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-medium text-white">
                {pendingCount}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {(["pending", "approved", "rejected"] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setFilter(s);
                  setLoading(true);
                  if (userId) load(userId, s);
                }}
                className={`rounded px-3 py-1 text-sm font-medium capitalize transition-colors ${
                  filter === s
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </header>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : approvals.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border bg-card py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {filter === "pending"
                  ? "No pending approvals. Your agent hasn\u2019t proposed any actions yet."
                  : `No ${filter} approvals.`}
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-4">
              {approvals.map((approval) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onEditApprove={handleEditApprove}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
