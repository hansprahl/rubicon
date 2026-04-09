"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { NavSidebar } from "@/components/nav-sidebar";
import { WorkspaceCard } from "@/components/workspace-card";
import { getWorkspaces, createWorkspace, deleteWorkspace, renameWorkspace } from "@/lib/api";
import type { WorkspaceWithMembers } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const load = useCallback(async (uid: string) => {
    try {
      const data = await getWorkspaces(uid);
      setWorkspaces(data);
    } catch {
      // failed to load
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
      if (!user) return;
      setUserId(user.id);
      load(user.id);
    }
    init();
  }, [load]);

  async function handleCreate() {
    if (!userId || !newName.trim()) return;
    setCreating(true);
    try {
      await createWorkspace(userId, newName.trim(), newDesc.trim() || undefined);
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
      load(userId);
    } catch {
      // failed
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(wsId: string) {
    if (!renameValue.trim()) return;
    try {
      await renameWorkspace(wsId, renameValue.trim());
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === wsId ? { ...w, name: renameValue.trim() } : w))
      );
    } catch {
      // failed
    } finally {
      setRenamingId(null);
      setRenameValue("");
    }
  }

  return (
    <div className="flex h-screen">
      <NavSidebar />
      <main className="flex-1 overflow-auto">
        <header className="flex h-14 items-center justify-between border-b px-6 max-md:pl-14">
          <h1 className="text-lg font-semibold">Workspaces</h1>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Workspace
          </button>
        </header>

        <div className="p-6">
          {/* Create form */}
          {showCreate && (
            <div className="mb-6 rounded-lg border bg-card p-5">
              <h3 className="font-medium">Create Workspace</h3>
              <div className="mt-3 space-y-3">
                <input
                  type="text"
                  placeholder="Workspace name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
                />
                <textarea
                  placeholder="Description (optional)"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={creating || !newName.trim()}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    {creating ? "Creating..." : "Create"}
                  </button>
                  <button
                    onClick={() => setShowCreate(false)}
                    className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Workspace list */}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : workspaces.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border bg-card py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No workspaces yet. Create one to start collaborating with your
                cohort.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {workspaces.map((ws) => (
                <div key={ws.id} className="group relative">
                  {renamingId === ws.id ? (
                    <div className="rounded-lg border bg-card p-4">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleRename(ws.id);
                        }}
                        className="flex items-center gap-2"
                      >
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setRenamingId(null);
                              setRenameValue("");
                            }
                          }}
                        />
                        <button type="submit" className="rounded-md p-1.5 text-green-500 hover:bg-green-500/20">
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(null);
                            setRenameValue("");
                          }}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </form>
                    </div>
                  ) : (
                    <>
                      <WorkspaceCard workspace={ws} />
                      {ws.role === "owner" && userId && (
                        <div className="absolute right-2 top-2 flex gap-1 opacity-100 md:opacity-0 transition-opacity md:group-hover:opacity-100">
                          <button
                            onClick={() => {
                              setRenamingId(ws.id);
                              setRenameValue(ws.name);
                            }}
                            className="rounded-md p-1.5 text-muted-foreground/60 hover:bg-accent hover:text-foreground"
                            title="Rename workspace"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm(`Delete "${ws.name}" and all its data? This cannot be undone.`)) return;
                              try {
                                await deleteWorkspace(ws.id, userId);
                                setWorkspaces((prev) => prev.filter((w) => w.id !== ws.id));
                              } catch {
                                // failed
                              }
                            }}
                            className="rounded-md p-1.5 text-muted-foreground/60 hover:bg-red-500/20 hover:text-red-400"
                            title="Delete workspace"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
