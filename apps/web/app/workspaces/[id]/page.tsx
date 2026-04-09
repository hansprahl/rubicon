"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Send, Users, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { NavSidebar } from "@/components/nav-sidebar";
import { ConfidenceBadge } from "@/components/confidence-badge";
import {
  getWorkspace,
  getWorkspaceFeed,
  getWorkspaceMembers,
  getEntities,
  getRelationships,
  postToFeed,
} from "@/lib/api";
import type {
  WorkspaceWithMembers,
  WorkspaceMember,
  FeedMessage,
  GraphEntity,
  GraphRelationship,
} from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type Tab = "feed" | "board" | "graph";

// Consistent color palette for authors
const AUTHOR_COLORS = [
  "border-l-blue-500",
  "border-l-green-500",
  "border-l-purple-500",
  "border-l-orange-500",
  "border-l-pink-500",
  "border-l-teal-500",
  "border-l-yellow-500",
  "border-l-red-500",
];

function getAuthorColor(authorId: string | null, colorMap: Map<string, string>) {
  if (!authorId) return "border-l-gray-400";
  if (!colorMap.has(authorId)) {
    colorMap.set(authorId, AUTHOR_COLORS[colorMap.size % AUTHOR_COLORS.length]);
  }
  return colorMap.get(authorId)!;
}

// ---------------------------------------------------------------------------
// Feed Tab
// ---------------------------------------------------------------------------

function FeedTab({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}) {
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [colorMap] = useState(() => new Map<string, string>());

  const load = useCallback(async () => {
    try {
      const data = await getWorkspaceFeed(workspaceId);
      setMessages(data);
    } catch {
      // failed
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSend() {
    if (!input.trim()) return;
    setSending(true);
    try {
      await postToFeed(workspaceId, userId, input.trim());
      setInput("");
      load();
    } catch {
      // failed
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-auto p-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            No messages yet. Start the conversation.
          </div>
        ) : (
          messages.map((msg) => {
            const authorId = msg.sender_type === "human" ? msg.user_id : msg.agent_id;
            const authorColor = getAuthorColor(authorId, colorMap);
            const authorLabel =
              msg.sender_type === "human"
                ? msg.display_name || "Unknown User"
                : msg.agent_name || "Agent";
            const hasConfidence =
              msg.confidence?.score != null && msg.confidence.score > 0;

            return (
              <div
                key={msg.id}
                className={`rounded-md border-l-4 bg-card p-4 ${authorColor}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{authorLabel}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    {msg.sender_type}
                  </span>
                  {hasConfidence && (
                    <ConfidenceBadge
                      score={msg.confidence.score!}
                      reasoning={msg.confidence.reasoning}
                    />
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            );
          })
        )}
      </div>
      {/* Message input */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message..."
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="rounded-md bg-primary p-2 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board Tab (placeholder — full kanban in Phase 7)
// ---------------------------------------------------------------------------

function BoardTab({ workspaceId }: { workspaceId: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
      Board view (agent tasks &amp; milestones) coming in Phase 7.
      <br />
      Workspace: {workspaceId.slice(0, 8)}...
    </div>
  );
}

// ---------------------------------------------------------------------------
// Graph Tab — entity/relationship list view
// ---------------------------------------------------------------------------

function GraphTab({ workspaceId }: { workspaceId: string }) {
  const [entities, setEntities] = useState<GraphEntity[]>([]);
  const [relationships, setRelationships] = useState<GraphRelationship[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [ents, rels] = await Promise.all([
          getEntities(workspaceId),
          getRelationships(workspaceId),
        ]);
        setEntities(ents);
        setRelationships(rels);
      } catch {
        // failed
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading graph...
      </div>
    );
  }

  const entityMap = new Map(entities.map((e) => [e.id, e]));

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    published: "bg-green-100 text-green-700",
    disputed: "bg-red-100 text-red-700",
    archived: "bg-yellow-100 text-yellow-700",
  };

  const relColors: Record<string, string> = {
    SUPPORTS: "text-green-600",
    CONTRADICTS: "text-red-600",
    BUILDS_ON: "text-blue-600",
    RELATES_TO: "text-gray-600",
  };

  return (
    <div className="space-y-6 p-4">
      {/* Entities */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">
          Entities ({entities.length})
        </h3>
        {entities.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No entities yet. Agents will publish findings here.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {entities.map((entity) => (
              <div
                key={entity.id}
                className="flex items-center gap-3 rounded-md border bg-card p-3"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{entity.name}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                      {entity.entity_type}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[entity.status] || statusColors.draft}`}
                    >
                      {entity.status}
                    </span>
                  </div>
                </div>
                <ConfidenceBadge score={entity.confidence_score} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Relationships */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">
          Relationships ({relationships.length})
        </h3>
        {relationships.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No relationships yet.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {relationships.map((rel) => {
              const source = entityMap.get(rel.source_entity_id);
              const target = entityMap.get(rel.target_entity_id);
              return (
                <div
                  key={rel.id}
                  className="flex items-center gap-2 rounded-md border bg-card p-3 text-sm"
                >
                  <span className="font-medium">
                    {source?.name || rel.source_entity_id.slice(0, 8)}
                  </span>
                  <span
                    className={`font-semibold ${relColors[rel.relationship_type] || relColors.RELATES_TO}`}
                  >
                    {rel.relationship_type}
                  </span>
                  <span className="font-medium">
                    {target?.name || rel.target_entity_id.slice(0, 8)}
                  </span>
                  <span className="ml-auto">
                    <ConfidenceBadge score={rel.confidence_score} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function WorkspaceDetailPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  const [workspace, setWorkspace] = useState<WorkspaceWithMembers | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("feed");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      try {
        const [ws, mems] = await Promise.all([
          getWorkspace(workspaceId, user.id),
          getWorkspaceMembers(workspaceId),
        ]);
        setWorkspace(ws);
        setMembers(mems);
      } catch {
        // failed
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [workspaceId]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "feed", label: "Feed" },
    { key: "board", label: "Board" },
    { key: "graph", label: "Graph" },
  ];

  if (loading) {
    return (
      <div className="flex h-screen">
        <NavSidebar />
        <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading workspace...
        </main>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex h-screen">
        <NavSidebar />
        <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Workspace not found.
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <NavSidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 items-center gap-3 border-b px-6">
          <Link
            href="/workspaces"
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">{workspace.name}</h1>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {members.length} member{members.length !== 1 ? "s" : ""}
          </div>
        </header>

        {/* Tabs */}
        <div className="flex border-b px-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto">
          {tab === "feed" && userId && (
            <FeedTab workspaceId={workspaceId} userId={userId} />
          )}
          {tab === "board" && <BoardTab workspaceId={workspaceId} />}
          {tab === "graph" && <GraphTab workspaceId={workspaceId} />}
        </div>
      </main>
    </div>
  );
}
