"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Loader2, Plus, Trash2, MessageSquare } from "lucide-react";
import { NavSidebar } from "@/components/nav-sidebar";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { AgentStatus } from "@/components/agent-status";
import { MentionPopup } from "@/components/mention-popup";
import {
  sendMessage,
  getMessages,
  getAgentByUser,
  getAgent,
  getConversations,
  createConversation,
  deleteConversation,
} from "@/lib/api";
import type {
  ChatMessage as ChatMsg,
  AgentProfile,
  Conversation,
} from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useRealtimeMessages, useRealtimeAgentStatus } from "@/lib/realtime";
import { cn } from "@/lib/utils";

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(async (agentId: string) => {
    try {
      const convs = await getConversations(agentId);
      setConversations(convs);
      return convs;
    } catch {
      return [];
    }
  }, []);

  const loadMessages = useCallback(async () => {
    if (!agent) return;
    try {
      const history = await getMessages(agent.id, currentConvId || undefined);
      setMessages(history);
    } catch {
      // ignore
    }
  }, [agent, currentConvId]);

  const refreshAgentStatus = useCallback(async () => {
    if (!agent) return;
    try {
      const updated = await getAgent(agent.id);
      setAgent(updated);
    } catch {
      // ignore
    }
  }, [agent]);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const profile = await getAgentByUser(user.id);
        setAgent(profile);
        setLoadError(false);

        const convs = await loadConversations(profile.id);
        if (convs.length > 0) {
          setCurrentConvId(convs[0].id);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("not found")) {
          setLoadError(false);
        } else {
          setLoadError(true);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [loadConversations]);

  // Load messages when conversation changes
  useEffect(() => {
    if (agent && currentConvId) {
      getMessages(agent.id, currentConvId).then(setMessages).catch(() => {});
    } else {
      setMessages([]);
    }
  }, [agent, currentConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime
  useRealtimeMessages(agent?.id || null, "agent", loadMessages);
  useRealtimeAgentStatus(agent?.id || null, refreshAgentStatus);

  async function handleNewChat() {
    if (!agent) return;
    try {
      const conv = await createConversation(agent.id);
      setConversations((prev) => [conv, ...prev]);
      setCurrentConvId(conv.id);
      setMessages([]);
      inputRef.current?.focus();
    } catch {
      // ignore
    }
  }

  async function handleDeleteConversation(convId: string) {
    if (!agent) return;
    setDeletingId(convId);
    try {
      await deleteConversation(agent.id, convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (currentConvId === convId) {
        const remaining = conversations.filter((c) => c.id !== convId);
        setCurrentConvId(remaining.length > 0 ? remaining[0].id : null);
        if (remaining.length === 0) setMessages([]);
      }
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !agent || sending) return;

    const userContent = input.trim();
    setInput("");
    setSending(true);
    setError(null);

    // If no conversation, one will be auto-created by the API
    const convId = currentConvId;

    // Optimistic user message
    const tempMsg: ChatMsg = {
      id: crypto.randomUUID(),
      agent_id: agent.id,
      sender_type: "human",
      content: userContent,
      confidence: { score: 1, reasoning: "" },
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const response = await sendMessage(agent.id, userContent, convId || undefined);
      setMessages((prev) => [...prev, response]);

      // If we didn't have a conversation, the API created one — refresh the list
      if (!convId && response.conversation_id) {
        setCurrentConvId(response.conversation_id as unknown as string);
        await loadConversations(agent.id);
      } else {
        // Update conversation list to reflect new message
        loadConversations(agent.id);
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  return (
    <div className="flex h-screen">
      <NavSidebar />
      <main className="flex flex-1 overflow-hidden max-md:pl-0">
        {/* Conversation Sidebar */}
        {agent && (
          <div className="flex w-64 shrink-0 flex-col border-r bg-card max-md:hidden">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <h2 className="text-sm font-semibold">Chats</h2>
              <button
                onClick={handleNewChat}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="New chat"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {conversations.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No conversations yet.
                  <br />
                  Start one below.
                </div>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={cn(
                      "group flex items-start gap-2 border-b px-3 py-3 transition-colors cursor-pointer",
                      currentConvId === conv.id
                        ? "bg-accent"
                        : "hover:bg-accent/50"
                    )}
                    onClick={() => setCurrentConvId(conv.id)}
                  >
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {conv.title}
                      </div>
                      {conv.last_message && (
                        <div className="truncate text-xs text-muted-foreground">
                          {conv.last_message}
                        </div>
                      )}
                      <div className="mt-0.5 text-[10px] text-muted-foreground/60">
                        {timeAgo(conv.updated_at)}
                        {conv.message_count > 0 && ` · ${conv.message_count} msgs`}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(conv.id);
                      }}
                      disabled={deletingId === conv.id}
                      className="mt-0.5 rounded p-1 text-muted-foreground/60 opacity-0 transition-opacity hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                      title="Delete chat"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="flex h-14 items-center justify-between border-b px-6 max-md:pl-14">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold">Chat</h1>
              {/* Mobile new chat button */}
              {agent && (
                <button
                  onClick={handleNewChat}
                  className="rounded-md border p-1.5 text-muted-foreground transition-colors hover:bg-accent md:hidden"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
            {agent && (
              <AgentStatus
                status={sending ? "thinking" : agent.status}
                agentName={agent.agent_name}
              />
            )}
          </header>

          {/* Messages */}
          <div className="flex-1 overflow-auto p-6">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : loadError ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                <p>Failed to load agent. Please try again.</p>
                <button
                  onClick={() => {
                    setLoading(true);
                    setLoadError(false);
                    (async () => {
                      try {
                        const supabase = createBrowserSupabaseClient();
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) return;
                        const profile = await getAgentByUser(user.id);
                        setAgent(profile);
                        setLoadError(false);
                        const convs = await loadConversations(profile.id);
                        if (convs.length > 0) {
                          setCurrentConvId(convs[0].id);
                        }
                      } catch {
                        setLoadError(true);
                      } finally {
                        setLoading(false);
                      }
                    })();
                  }}
                  className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >
                  Retry
                </button>
              </div>
            ) : !agent ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <p>No agent configured yet.</p>
                <p>Complete onboarding to create your digital twin.</p>
              </div>
            ) : !currentConvId && messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
                <p>Start a new conversation with {agent.agent_name}.</p>
                <p className="text-xs">Type a message below or click "+" to begin.</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Send a message to start this conversation.
              </div>
            ) : (
              <div className="mx-auto max-w-2xl space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={
                      msg.sender_type === "human" ? "flex justify-end" : "flex justify-start"
                    }
                  >
                    <div
                      className={
                        msg.sender_type === "human"
                          ? "max-w-[85%] rounded-lg bg-primary px-4 py-2 text-primary-foreground sm:max-w-md"
                          : "max-w-[85%] rounded-lg border bg-card px-4 py-2 sm:max-w-md"
                      }
                    >
                      <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                      {msg.sender_type === "agent" &&
                        msg.confidence &&
                        msg.confidence.score != null && (
                          <div className="mt-2">
                            <ConfidenceBadge
                              score={msg.confidence.score}
                              reasoning={msg.confidence.reasoning}
                            />
                          </div>
                        )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="border-t bg-red-50 px-6 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Input */}
          {agent && (
            <form
              onSubmit={handleSend}
              className="relative flex items-center gap-3 border-t px-4 py-4 sm:px-6"
            >
              <MentionPopup
                query={mentionQuery}
                visible={mentionOpen}
                onClose={() => setMentionOpen(false)}
                onSelect={(item) => {
                  const before = input.slice(0, mentionStart);
                  const after = input.slice(mentionStart + mentionQuery.length + 1);
                  setInput(before + item.insertText + " " + after.trimStart());
                  setMentionOpen(false);
                  setMentionQuery("");
                  setMentionStart(-1);
                  inputRef.current?.focus();
                }}
              />
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => {
                  const val = e.target.value;
                  setInput(val);
                  const cursor = e.target.selectionStart || val.length;
                  const textBeforeCursor = val.slice(0, cursor);
                  const atIndex = textBeforeCursor.lastIndexOf("@");
                  if (atIndex >= 0) {
                    const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : " ";
                    const queryAfterAt = textBeforeCursor.slice(atIndex + 1);
                    if ((charBefore === " " || atIndex === 0) && !queryAfterAt.includes(" ")) {
                      setMentionOpen(true);
                      setMentionQuery(queryAfterAt);
                      setMentionStart(atIndex);
                      return;
                    }
                  }
                  setMentionOpen(false);
                }}
                onKeyDown={(e) => {
                  if (mentionOpen && ["ArrowDown", "ArrowUp", "Tab"].includes(e.key)) {
                    e.preventDefault();
                  }
                  if (mentionOpen && e.key === "Enter") {
                    e.preventDefault();
                  }
                  if (mentionOpen && e.key === "Escape") {
                    e.preventDefault();
                    setMentionOpen(false);
                  }
                }}
                placeholder="Type a message... Use @ to mention"
                disabled={sending}
                maxLength={4000}
                className="flex-1 rounded-md border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
