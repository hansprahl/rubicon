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

// --- Onboarding ---

export interface OnboardingDocData {
  id: string;
  user_id: string;
  doc_type: "idp" | "ethics" | "insights";
  file_name: string;
  storage_path: string;
  parsed_data: Record<string, unknown>;
  uploaded_at: string;
}

export interface OnboardingStatus {
  completed: boolean;
  uploaded_docs: string[];
  has_idp: boolean;
  has_ethics: boolean;
  has_insights: boolean;
}

export function updateOnboardingProfile(
  userId: string,
  displayName: string,
  avatarUrl?: string
) {
  return request<{ status: string; display_name: string }>(
    `/onboarding/profile/${userId}`,
    {
      method: "POST",
      body: JSON.stringify({
        display_name: displayName,
        avatar_url: avatarUrl || null,
      }),
    }
  );
}

export async function uploadOnboardingDoc(
  userId: string,
  docType: "idp" | "ethics" | "insights",
  file: File
): Promise<OnboardingDocData> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(
    `${API_BASE}/onboarding/upload/${userId}/${docType}`,
    { method: "POST", body: formData }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export function getOnboardingDocs(userId: string) {
  return request<OnboardingDocData[]>(`/onboarding/docs/${userId}`);
}

export function getOnboardingStatus(userId: string) {
  return request<OnboardingStatus>(`/onboarding/status/${userId}`);
}

export function synthesizeProfile(
  userId: string,
  agentName: string,
  autonomyLevel: number
) {
  return request<Record<string, unknown>>(`/onboarding/synthesize/${userId}`, {
    method: "POST",
    body: JSON.stringify({
      agent_name: agentName,
      autonomy_level: autonomyLevel,
    }),
  });
}
