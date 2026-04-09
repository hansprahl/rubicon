"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { NavSidebar } from "@/components/nav-sidebar";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { AgentStatus } from "@/components/agent-status";
import { sendMessage, getMessages, getAgentByUser } from "@/lib/api";
import type { ChatMessage as ChatMsg, AgentProfile } from "@/lib/api";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
        const history = await getMessages(profile.id);
        setMessages(history);
      } catch {
        // Agent may not exist yet — that's fine
      }
    }
    load();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b px-6">
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
          {!agent ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No agent configured yet. Complete onboarding to create your digital
              twin.
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
                        ? "max-w-md rounded-lg bg-primary px-4 py-2 text-primary-foreground"
                        : "max-w-md rounded-lg border bg-card px-4 py-2"
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
          <div className="border-t bg-red-50 px-6 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Input */}
        {agent && (
          <form
            onSubmit={handleSend}
            className="flex items-center gap-3 border-t px-6 py-4"
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
              <Send className="h-4 w-4" />
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
