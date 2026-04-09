"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { getAdminUsers, updateUserStatus, toggleUserAdmin, type AdminUser } from "@/lib/api";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const loadUsers = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const data = await getAdminUsers(currentUserId);
      setUsers(data);
    } catch (err: unknown) {
      console.error("Failed to load users:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (currentUserId) loadUsers();
  }, [currentUserId, loadUsers]);

  const handleApprove = async (userId: string) => {
    setActionLoading(userId);
    try {
      await updateUserStatus(userId, "approved", currentUserId);
      await loadUsers();
    } catch (err: unknown) {
      console.error("Failed to approve:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (userId: string) => {
    setActionLoading(userId);
    try {
      await updateUserStatus(userId, "rejected", currentUserId);
      await loadUsers();
    } catch (err: unknown) {
      console.error("Failed to reject:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleAdmin = async (userId: string) => {
    setActionLoading(userId);
    try {
      await toggleUserAdmin(userId, currentUserId);
      await loadUsers();
    } catch (err: unknown) {
      console.error("Failed to toggle admin:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = filter === "all" ? users : users.filter((u) => u.status === filter);
  const pendingCount = users.filter((u) => u.status === "pending").length;

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-amber-500/20 text-amber-400",
      approved: "bg-green-500/20 text-green-400",
      rejected: "bg-red-500/20 text-red-400",
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || "bg-muted text-muted-foreground"}`}>
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-2 mb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">User Management</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {users.length} total users{pendingCount > 0 && ` \u2022 ${pendingCount} pending approval`}
            </p>
          </div>
          <a
            href="/dashboard"
            className="text-sm text-primary hover:text-primary/80 font-medium"
          >
            &larr; Back to Dashboard
          </a>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {(["all", "pending", "approved", "rejected"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-accent border"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === "pending" && pendingCount > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-xs">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Users — card layout on mobile, table on desktop */}
        {/* Mobile cards */}
        <div className="space-y-3 md:hidden">
          {filteredUsers.map((u) => (
            <div key={u.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-3">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium">
                    {u.display_name?.charAt(0) || "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground">{u.display_name}</span>
                    {u.is_admin && (
                      <span className="shrink-0 px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">Admin</span>
                    )}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">{u.email}</div>
                </div>
                {statusBadge(u.status)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {u.agent_name && <span>Agent: {u.agent_name}</span>}
                {u.fidelity != null && <span>Fidelity: {Math.round(u.fidelity * 100)}%</span>}
                <span>Joined {new Date(u.created_at).toLocaleDateString()}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {u.status === "pending" && (
                  <>
                    <button onClick={() => handleApprove(u.id)} disabled={actionLoading === u.id} className="flex-1 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">Approve</button>
                    <button onClick={() => handleReject(u.id)} disabled={actionLoading === u.id} className="flex-1 px-3 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50">Reject</button>
                  </>
                )}
                {u.status === "rejected" && (
                  <button onClick={() => handleApprove(u.id)} disabled={actionLoading === u.id} className="flex-1 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">Approve</button>
                )}
                {u.status === "approved" && u.id !== currentUserId && (
                  <>
                    <button onClick={() => handleToggleAdmin(u.id)} disabled={actionLoading === u.id} className="flex-1 px-3 py-2 bg-purple-500/20 text-purple-400 text-sm rounded-lg hover:bg-purple-500/30 disabled:opacity-50">{u.is_admin ? "Remove Admin" : "Make Admin"}</button>
                    <button onClick={() => handleReject(u.id)} disabled={actionLoading === u.id} className="flex-1 px-3 py-2 bg-muted text-muted-foreground text-sm rounded-lg hover:bg-muted/80 disabled:opacity-50">Revoke</button>
                  </>
                )}
              </div>
            </div>
          ))}
          {filteredUsers.length === 0 && (
            <div className="px-6 py-12 text-center text-muted-foreground">
              No {filter !== "all" ? filter : ""} users found
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block bg-card rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">User</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Agent</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Fidelity</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Joined</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-muted/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-medium">
                          {u.display_name?.charAt(0) || "?"}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-foreground">
                          {u.display_name}
                          {u.is_admin && (
                            <span className="ml-2 px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
                              Admin
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">{statusBadge(u.status)}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{u.agent_name || "—"}</td>
                  <td className="px-6 py-4">
                    {u.fidelity != null ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${Math.round(u.fidelity * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{Math.round(u.fidelity * 100)}%</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground/60">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {u.status === "pending" && (
                        <>
                          <button
                            onClick={() => handleApprove(u.id)}
                            disabled={actionLoading === u.id}
                            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(u.id)}
                            disabled={actionLoading === u.id}
                            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {u.status === "rejected" && (
                        <button
                          onClick={() => handleApprove(u.id)}
                          disabled={actionLoading === u.id}
                          className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                      )}
                      {u.status === "approved" && u.id !== currentUserId && (
                        <>
                          <button
                            onClick={() => handleToggleAdmin(u.id)}
                            disabled={actionLoading === u.id}
                            className="px-3 py-1.5 bg-purple-500/20 text-purple-400 text-sm rounded-lg hover:bg-purple-500/30 disabled:opacity-50"
                          >
                            {u.is_admin ? "Remove Admin" : "Make Admin"}
                          </button>
                          <button
                            onClick={() => handleReject(u.id)}
                            disabled={actionLoading === u.id}
                            className="px-3 py-1.5 bg-muted text-muted-foreground text-sm rounded-lg hover:bg-muted/80 disabled:opacity-50"
                          >
                            Revoke
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    No {filter !== "all" ? filter : ""} users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
}
