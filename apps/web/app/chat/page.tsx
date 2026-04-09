"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Loader2, Plus, Trash2, MessageSquare, Pencil, Check, X, ChevronDown, User, Users2 } from "lucide-react";
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
  renameConversation,
  getDMConversations,
  getOrCreateDM,
  getDMMessages,
  sendDM,
  markDMRead,
  getDirectoryUsers,
} from "@/lib/api";
import type {
  ChatMessage as ChatMsg,
  AgentProfile,
  Conversation,
  DMConversation,
  DMMessage,
  DirectoryUser,
} from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useRealtimeMessages, useRealtimeAgentStatus } from "@/lib/realtime";
import { cn } from "@/lib/utils";

type ChatMode = "agent" | "dm";

export default function ChatPage() {
  // Shared state
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<ChatMode>("agent");

  // Agent chat state
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);

  // DM state
  const [dmConversations, setDmConversations] = useState<DMConversation[]>([]);
  const [currentDmId, setCurrentDmId] = useState<string | null>(null);
  const [dmMessages, setDmMessages] = useState<DMMessage[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [showNewDm, setShowNewDm] = useState(false);

  // UI state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [mobileChatsOpen, setMobileChatsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Agent chat handlers ---

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

  // --- DM handlers ---

  const loadDmConversations = useCallback(async (uid: string) => {
    try {
      const convs = await getDMConversations(uid);
      setDmConversations(convs);
      return convs;
    } catch {
      return [];
    }
  }, []);

  const loadDmMessages = useCallback(async (convId: string) => {
    try {
      const msgs = await getDMMessages(convId);
      setDmMessages(msgs);
    } catch {
      // ignore
    }
  }, []);

  // --- Init ---

  useEffect(() => {
    async function load() {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);

        const [profile, dmConvs] = await Promise.all([
          getAgentByUser(user.id).catch(() => null),
          getDMConversations(user.id).catch(() => []),
        ]);

        if (profile) {
          setAgent(profile);
          setLoadError(false);
          const convs = await loadConversations(profile.id);
          if (convs.length > 0) {
            setCurrentConvId(convs[0].id);
          }
        }

        setDmConversations(dmConvs);
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

  // Load agent messages when conversation changes
  useEffect(() => {
    if (chatMode === "agent" && agent && currentConvId) {
      getMessages(agent.id, currentConvId).then(setMessages).catch(() => {});
    } else if (chatMode === "agent") {
      setMessages([]);
    }
  }, [agent, currentConvId, chatMode]);

  // Load DM messages when DM conversation changes
  useEffect(() => {
    if (chatMode === "dm" && currentDmId) {
      loadDmMessages(currentDmId);
      if (userId) markDMRead(currentDmId, userId).catch(() => {});
    } else if (chatMode === "dm") {
      setDmMessages([]);
    }
  }, [currentDmId, chatMode, loadDmMessages, userId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, dmMessages]);

  // Realtime for agent messages
  useRealtimeMessages(agent?.id || null, "agent", loadMessages);
  useRealtimeAgentStatus(agent?.id || null, refreshAgentStatus);

  // --- Agent chat actions ---

  async function handleNewChat() {
    if (!agent) return;
    try {
      const conv = await createConversation(agent.id);
      setConversations((prev) => [conv, ...prev]);
      setCurrentConvId(conv.id);
      setMessages([]);
      setChatMode("agent");
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

  async function handleRenameConversation(convId: string) {
    if (!agent || !renameValue.trim()) return;
    try {
      const updated = await renameConversation(agent.id, convId, renameValue.trim());
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title: updated.title } : c))
      );
    } catch {
      // ignore
    } finally {
      setRenamingId(null);
      setRenameValue("");
    }
  }

  // --- DM actions ---

  async function handleStartDM(otherUserId: string) {
    if (!userId) return;
    try {
      const conv = await getOrCreateDM(userId, otherUserId);
      setChatMode("dm");
      setCurrentDmId(conv.id);
      setShowNewDm(false);
      await loadDmConversations(userId);
      inputRef.current?.focus();
    } catch {
      // ignore
    }
  }

  async function loadUsersForNewDM() {
    try {
      const users = await getDirectoryUsers();
      setDirectoryUsers(users.filter((u) => u.id !== userId));
    } catch {
      // ignore
    }
    setShowNewDm(true);
  }

  // --- Send handler ---

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const content = input.trim();
    setInput("");
    setSending(true);
    setError(null);

    if (chatMode === "dm" && currentDmId && userId) {
      // DM send
      const tempMsg: DMMessage = {
        id: crypto.randomUUID(),
        conversation_id: currentDmId,
        sender_id: userId,
        sender_name: "You",
        content,
        read_at: null,
        created_at: new Date().toISOString(),
      };
      setDmMessages((prev) => [...prev, tempMsg]);

      try {
        const sent = await sendDM(currentDmId, userId, content);
        setDmMessages((prev) => prev.map((m) => (m.id === tempMsg.id ? sent : m)));
        loadDmConversations(userId);
      } catch (err) {
        setDmMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
        setError(err instanceof Error ? err.message : "Failed to send");
      } finally {
        setSending(false);
      }
    } else if (chatMode === "agent" && agent) {
      // Agent chat send
      const convId = currentConvId;
      const tempMsg: ChatMsg = {
        id: crypto.randomUUID(),
        agent_id: agent.id,
        sender_type: "human",
        content,
        confidence: { score: 1, reasoning: "" },
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempMsg]);

      try {
        const response = await sendMessage(agent.id, content, convId || undefined);
        setMessages((prev) => [...prev, response]);
        if (!convId && response.conversation_id) {
          setCurrentConvId(response.conversation_id as unknown as string);
          await loadConversations(agent.id);
        } else {
          loadConversations(agent.id);
        }
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
        setError(err instanceof Error ? err.message : "Failed to send message");
      } finally {
        setSending(false);
      }
    } else {
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

  // Current DM partner name
  const currentDmName = dmConversations.find((d) => d.id === currentDmId)?.other_user_name;

  return (
    <div className="flex h-screen">
      <NavSidebar />
      <main className="flex flex-1 overflow-hidden max-md:pl-0">
        {/* Conversation Sidebar */}
        {(agent || userId) && (
          <div className="flex w-64 shrink-0 flex-col border-r bg-card max-md:hidden">
            {/* Mode tabs */}
            <div className="flex h-14 items-center border-b">
              <button
                onClick={() => setChatMode("agent")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 py-4 text-xs font-semibold transition-colors border-b-2",
                  chatMode === "agent"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Agent
              </button>
              <button
                onClick={() => setChatMode("dm")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 py-4 text-xs font-semibold transition-colors border-b-2 relative",
                  chatMode === "dm"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Users2 className="h-3.5 w-3.5" />
                Messages
                {dmConversations.reduce((n, d) => n + d.unread_count, 0) > 0 && (
                  <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
                    {dmConversations.reduce((n, d) => n + d.unread_count, 0)}
                  </span>
                )}
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              {chatMode === "agent" ? (
                /* Agent conversations */
                <>
                  <div className="flex items-center justify-between px-4 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Agent Chats</span>
                    <button
                      onClick={handleNewChat}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title="New chat"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {conversations.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                      No conversations yet.<br />Start one below.
                    </div>
                  ) : (
                    conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={cn(
                          "group flex items-start gap-2 border-b px-3 py-3 transition-colors cursor-pointer",
                          currentConvId === conv.id && chatMode === "agent"
                            ? "bg-accent"
                            : "hover:bg-accent/50"
                        )}
                        onClick={() => { setCurrentConvId(conv.id); setChatMode("agent"); }}
                      >
                        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          {renamingId === conv.id ? (
                            <form
                              className="flex items-center gap-1"
                              onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); handleRenameConversation(conv.id); }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                                className="w-full rounded border bg-background px-1.5 py-0.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                                onKeyDown={(e) => { if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); } }}
                              />
                              <button type="submit" className="rounded p-0.5 text-green-500 hover:bg-green-500/20"><Check className="h-3 w-3" /></button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setRenamingId(null); setRenameValue(""); }} className="rounded p-0.5 text-muted-foreground hover:bg-accent"><X className="h-3 w-3" /></button>
                            </form>
                          ) : (
                            <div className="truncate text-sm font-medium">{conv.title}</div>
                          )}
                          {conv.last_message && renamingId !== conv.id && (
                            <div className="truncate text-xs text-muted-foreground">{conv.last_message}</div>
                          )}
                          {renamingId !== conv.id && (
                            <div className="mt-0.5 text-[10px] text-muted-foreground/60">
                              {timeAgo(conv.updated_at)}
                              {conv.message_count > 0 && ` · ${conv.message_count} msgs`}
                            </div>
                          )}
                        </div>
                        {renamingId !== conv.id && (
                          <div className={cn("mt-0.5 flex gap-0.5 transition-opacity", currentConvId === conv.id ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                            <button onClick={(e) => { e.stopPropagation(); setRenamingId(conv.id); setRenameValue(conv.title); }} className="rounded p-1 text-muted-foreground/60 hover:bg-accent hover:text-foreground" title="Rename"><Pencil className="h-3 w-3" /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }} disabled={deletingId === conv.id} className="rounded p-1 text-muted-foreground/60 hover:bg-red-500/20 hover:text-red-400" title="Delete"><Trash2 className="h-3 w-3" /></button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </>
              ) : (
                /* DM conversations */
                <>
                  <div className="flex items-center justify-between px-4 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Direct Messages</span>
                    <button
                      onClick={loadUsersForNewDM}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title="New message"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* New DM user picker */}
                  {showNewDm && (
                    <div className="mx-3 mb-2 rounded-lg border bg-background p-2">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Send to:</span>
                        <button onClick={() => setShowNewDm(false)} className="rounded p-0.5 text-muted-foreground hover:bg-accent"><X className="h-3 w-3" /></button>
                      </div>
                      <div className="max-h-40 overflow-auto space-y-0.5">
                        {directoryUsers.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => handleStartDM(u.id)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
                          >
                            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1 text-left">
                              <div className="truncate font-medium">{u.display_name}</div>
                              {u.agent_name && <div className="truncate text-[10px] text-muted-foreground">{u.agent_name}</div>}
                            </div>
                          </button>
                        ))}
                        {directoryUsers.length === 0 && (
                          <div className="py-2 text-center text-xs text-muted-foreground">No users found</div>
                        )}
                      </div>
                    </div>
                  )}

                  {dmConversations.length === 0 && !showNewDm ? (
                    <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                      No messages yet.<br />Click + to start a conversation.
                    </div>
                  ) : (
                    dmConversations.map((dm) => (
                      <div
                        key={dm.id}
                        className={cn(
                          "flex items-start gap-2 border-b px-3 py-3 transition-colors cursor-pointer",
                          currentDmId === dm.id && chatMode === "dm" ? "bg-accent" : "hover:bg-accent/50"
                        )}
                        onClick={() => { setCurrentDmId(dm.id); setChatMode("dm"); }}
                      >
                        <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">{dm.other_user_name}</span>
                            {dm.unread_count > 0 && (
                              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
                                {dm.unread_count}
                              </span>
                            )}
                          </div>
                          {dm.last_message && (
                            <div className="truncate text-xs text-muted-foreground">{dm.last_message}</div>
                          )}
                          <div className="mt-0.5 text-[10px] text-muted-foreground/60">
                            {timeAgo(dm.last_message_at)}
                            {dm.message_count > 0 && ` · ${dm.message_count} msgs`}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="flex h-14 items-center justify-between border-b px-6 max-md:pl-14">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold max-md:hidden">
                {chatMode === "dm" && currentDmName ? currentDmName : "Chat"}
              </h1>
              {/* Mobile switcher */}
              <div className="relative md:hidden">
                <button
                  onClick={() => setMobileChatsOpen(!mobileChatsOpen)}
                  className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
                >
                  {chatMode === "dm" ? <User className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                  <span className="max-w-[140px] truncate">
                    {chatMode === "dm"
                      ? (currentDmName || "Messages")
                      : (conversations.find((c) => c.id === currentConvId)?.title || "Chats")}
                  </span>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", mobileChatsOpen && "rotate-180")} />
                </button>
                {mobileChatsOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMobileChatsOpen(false)} />
                    <div className="absolute left-0 top-full z-20 mt-1 w-[calc(100vw-5rem)] max-w-80 rounded-lg border bg-card shadow-lg">
                      {/* Mode tabs */}
                      <div className="flex border-b">
                        <button onClick={() => setChatMode("agent")} className={cn("flex-1 py-2 text-xs font-semibold", chatMode === "agent" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground")}>Agent</button>
                        <button onClick={() => setChatMode("dm")} className={cn("flex-1 py-2 text-xs font-semibold", chatMode === "dm" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground")}>
                          Messages
                          {dmConversations.reduce((n, d) => n + d.unread_count, 0) > 0 && (
                            <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] text-white">{dmConversations.reduce((n, d) => n + d.unread_count, 0)}</span>
                          )}
                        </button>
                      </div>
                      <div className="max-h-64 overflow-auto">
                        {chatMode === "agent" ? (
                          <>
                            <div className="flex items-center justify-between px-3 py-2 border-b">
                              <span className="text-xs font-semibold text-muted-foreground">Agent Chats</span>
                              <button onClick={() => { handleNewChat(); setMobileChatsOpen(false); }} className="rounded p-1 text-muted-foreground hover:bg-accent"><Plus className="h-3.5 w-3.5" /></button>
                            </div>
                            {conversations.map((conv) => (
                              <div key={conv.id} className={cn("flex items-center justify-between px-3 py-2.5 text-sm cursor-pointer", currentConvId === conv.id ? "bg-accent" : "hover:bg-accent/50")}
                                onClick={() => { setCurrentConvId(conv.id); setChatMode("agent"); setMobileChatsOpen(false); }}>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-medium">{conv.title}</div>
                                  <div className="text-[10px] text-muted-foreground/60">{timeAgo(conv.updated_at)}{conv.message_count > 0 && ` · ${conv.message_count} msgs`}</div>
                                </div>
                                <div className="ml-2 flex shrink-0 gap-1">
                                  <button onClick={(e) => { e.stopPropagation(); setRenamingId(conv.id); setRenameValue(conv.title); setMobileChatsOpen(false); }} className="rounded p-1 text-muted-foreground/60 hover:bg-accent"><Pencil className="h-3 w-3" /></button>
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); setMobileChatsOpen(false); }} className="rounded p-1 text-muted-foreground/60 hover:bg-red-500/20 hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
                                </div>
                              </div>
                            ))}
                          </>
                        ) : (
                          <>
                            <div className="flex items-center justify-between px-3 py-2 border-b">
                              <span className="text-xs font-semibold text-muted-foreground">Direct Messages</span>
                              <button onClick={() => { loadUsersForNewDM(); setMobileChatsOpen(false); }} className="rounded p-1 text-muted-foreground hover:bg-accent"><Plus className="h-3.5 w-3.5" /></button>
                            </div>
                            {dmConversations.map((dm) => (
                              <div key={dm.id} className={cn("flex items-center justify-between px-3 py-2.5 text-sm cursor-pointer", currentDmId === dm.id ? "bg-accent" : "hover:bg-accent/50")}
                                onClick={() => { setCurrentDmId(dm.id); setChatMode("dm"); setMobileChatsOpen(false); }}>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate font-medium">{dm.other_user_name}</span>
                                    {dm.unread_count > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] text-white">{dm.unread_count}</span>}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground/60">{timeAgo(dm.last_message_at)}</div>
                                </div>
                              </div>
                            ))}
                            {dmConversations.length === 0 && (
                              <div className="px-3 py-4 text-center text-xs text-muted-foreground">No messages yet.</div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            {chatMode === "agent" && agent && (
              <AgentStatus
                status={sending ? "thinking" : agent.status}
                agentName={agent.agent_name}
              />
            )}
            {chatMode === "dm" && currentDmName && (
              <span className="text-xs text-muted-foreground md:hidden">{currentDmName}</span>
            )}
          </header>

          {/* Mobile rename overlay */}
          {renamingId && agent && (
            <div className="flex items-center gap-2 border-b bg-card px-4 py-2 md:hidden">
              <span className="text-xs text-muted-foreground">Rename:</span>
              <form className="flex flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); handleRenameConversation(renamingId); }}>
                <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
                <button type="submit" className="rounded-md p-1.5 text-green-500 hover:bg-green-500/20"><Check className="h-4 w-4" /></button>
                <button type="button" onClick={() => { setRenamingId(null); setRenameValue(""); }} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
              </form>
            </div>
          )}

          {/* Mobile new DM picker */}
          {showNewDm && (
            <div className="border-b bg-card p-3 md:hidden">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium">Send message to:</span>
                <button onClick={() => setShowNewDm(false)} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
              </div>
              <div className="max-h-48 overflow-auto space-y-1">
                {directoryUsers.map((u) => (
                  <button key={u.id} onClick={() => handleStartDM(u.id)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent">
                    <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{u.display_name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-auto p-6">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...
              </div>
            ) : loadError ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                <p>Failed to load. Please try again.</p>
                <button
                  onClick={() => window.location.reload()}
                  className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >Retry</button>
              </div>
            ) : chatMode === "agent" && !agent ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <p>No agent configured yet.</p>
                <p>Complete onboarding to create your digital twin.</p>
              </div>
            ) : chatMode === "agent" && !currentConvId && messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
                <p>Start a new conversation with {agent?.agent_name}.</p>
                <p className="text-xs">Type a message below or click &ldquo;+&rdquo; to begin.</p>
              </div>
            ) : chatMode === "dm" && !currentDmId ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                <Users2 className="h-10 w-10 text-muted-foreground/30" />
                <p>Select a conversation or start a new one.</p>
                <button onClick={loadUsersForNewDM} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  New Message
                </button>
              </div>
            ) : chatMode === "dm" ? (
              /* DM messages */
              <div className="mx-auto max-w-2xl space-y-4">
                {dmMessages.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    Send a message to start the conversation.
                  </div>
                ) : (
                  dmMessages.map((msg) => (
                    <div key={msg.id} className={msg.sender_id === userId ? "flex justify-end" : "flex justify-start"}>
                      <div className={msg.sender_id === userId
                        ? "max-w-[85%] rounded-lg bg-primary px-4 py-2 text-primary-foreground sm:max-w-md"
                        : "max-w-[85%] rounded-lg border bg-card px-4 py-2 sm:max-w-md"
                      }>
                        {msg.sender_id !== userId && (
                          <p className="mb-1 text-xs font-medium text-muted-foreground">{msg.sender_name}</p>
                        )}
                        <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            ) : (
              /* Agent messages */
              <div className="mx-auto max-w-2xl space-y-4">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    Send a message to start this conversation.
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className={msg.sender_type === "human" ? "flex justify-end" : "flex justify-start"}>
                      <div className={msg.sender_type === "human"
                        ? "max-w-[85%] rounded-lg bg-primary px-4 py-2 text-primary-foreground sm:max-w-md"
                        : "max-w-[85%] rounded-lg border bg-card px-4 py-2 sm:max-w-md"
                      }>
                        <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                        {msg.sender_type === "agent" && msg.confidence && msg.confidence.score != null && (
                          <div className="mt-2"><ConfidenceBadge score={msg.confidence.score} reasoning={msg.confidence.reasoning} /></div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="border-t bg-red-50 px-6 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>
          )}

          {/* Input */}
          {(agent || (chatMode === "dm" && currentDmId)) && (
            <form onSubmit={handleSend} className="relative flex items-center gap-3 border-t px-4 py-4 sm:px-6">
              {chatMode === "agent" && (
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
              )}
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => {
                  const val = e.target.value;
                  setInput(val);
                  if (chatMode === "agent") {
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
                  }
                }}
                onKeyDown={(e) => {
                  if (mentionOpen && ["ArrowDown", "ArrowUp", "Tab"].includes(e.key)) e.preventDefault();
                  if (mentionOpen && e.key === "Enter") e.preventDefault();
                  if (mentionOpen && e.key === "Escape") { e.preventDefault(); setMentionOpen(false); }
                }}
                placeholder={chatMode === "dm" ? `Message ${currentDmName || ""}...` : "Type a message... Use @ to mention"}
                disabled={sending}
                maxLength={4000}
                className="flex-1 rounded-md border bg-background px-4 py-2 text-base outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 sm:text-sm"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
