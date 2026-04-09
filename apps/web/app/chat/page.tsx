"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { NavSidebar } from "@/components/nav-sidebar";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { AgentStatus } from "@/components/agent-status";
import { sendMessage, getMessages, getAgentByUser, getAgent } from "@/lib/api";
import type { ChatMessage as ChatMsg, AgentProfile } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useRealtimeMessages, useRealtimeAgentStatus } from "@/lib/realtime";

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    if (!agent) return;
    try {
      const history = await getMessages(agent.id);
      setMessages(history);
    } catch {
      // ignore
    }
  }, [agent]);

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
        const history = await getMessages(profile.id);
        setMessages(history);
      } catch (err) {
        // Distinguish "no agent" (404-like) from actual failures
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
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime: new messages + agent status changes
  useRealtimeMessages(agent?.id || null, "agent", loadMessages);
  useRealtimeAgentStatus(agent?.id || null, refreshAgentStatus);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !agent || sending) return;

    const userContent = input.trim();
    setInput("");
    setSending(true);
    setError(null);

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
      const response = await sendMessage(agent.id, userContent);
      setMessages((prev) => [...prev, response]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-screen">
      <NavSidebar />
      <main className="flex flex-1 flex-col overflow-hidden max-md:pl-0">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b px-6 max-md:pl-14">
          <h1 className="text-lg font-semibold">Chat</h1>
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
                      const history = await getMessages(profile.id);
                      setMessages(history);
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
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Send a message to start chatting with {agent.agent_name}.
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
            className="flex items-center gap-3 border-t px-4 py-4 sm:px-6"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              disabled={sending}
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
      </main>
    </div>
  );
}
