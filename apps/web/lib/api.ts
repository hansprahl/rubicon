const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error: ${res.status}`);
  }
  return res.json();
}

// --- Agent Profile ---

export interface AgentProfile {
  id: string;
  user_id: string;
  agent_name: string;
  expertise: string[];
  goals: string[];
  values: string[];
  personality: Record<string, unknown>;
  communication_style: string | null;
  system_prompt: string | null;
  autonomy_level: number;
  status: "idle" | "thinking" | "working" | "waiting_approval";
  created_at: string;
  updated_at: string;
}

export function getAgent(agentId: string) {
  return request<AgentProfile>(`/agents/${agentId}`);
}

export function getAgentByUser(userId: string) {
  return request<AgentProfile>(`/agents/user/${userId}`);
}

// --- Chat ---

export interface ConfidenceScore {
  score: number;
  reasoning: string;
}

export interface ChatMessage {
  id: string;
  agent_id: string;
  sender_type: "human" | "agent";
  content: string;
  confidence: ConfidenceScore;
  created_at: string;
}

export function sendMessage(agentId: string, content: string) {
  return request<ChatMessage>(`/agents/${agentId}/chat`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export function getMessages(agentId: string, limit = 50) {
  return request<ChatMessage[]>(`/agents/${agentId}/messages?limit=${limit}`);
}
