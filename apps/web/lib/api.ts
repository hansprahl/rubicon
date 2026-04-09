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

// --- Approvals ---

export interface ApprovalWithAgent {
  id: string;
  user_id: string;
  agent_id: string;
  workspace_id: string | null;
  action_type: string;
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "expired";
  human_note: string | null;
  created_at: string;
  resolved_at: string | null;
  agent_name: string | null;
  confidence_score: number | null;
  confidence_reasoning: string | null;
}

export function getApprovals(userId: string, status = "pending") {
  return request<ApprovalWithAgent[]>(
    `/approvals/user/${userId}?status=${status}`
  );
}

export function getApprovalCount(userId: string) {
  return request<{ count: number }>(`/approvals/user/${userId}/count`);
}

export function approveAction(id: string, humanNote?: string) {
  return request<ApprovalWithAgent>(`/approvals/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ human_note: humanNote || null }),
  });
}

export function rejectAction(id: string, humanNote?: string) {
  return request<ApprovalWithAgent>(`/approvals/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ human_note: humanNote || null }),
  });
}

export function editAndApprove(
  id: string,
  payload: Record<string, unknown>,
  humanNote?: string
) {
  return request<ApprovalWithAgent>(`/approvals/${id}/edit-approve`, {
    method: "POST",
    body: JSON.stringify({ payload, human_note: humanNote || null }),
  });
}

// --- Workspaces ---

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceWithMembers extends Workspace {
  member_count: number;
  role: string | null;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  display_name: string | null;
}

export interface FeedMessage {
  id: string;
  workspace_id: string;
  user_id: string | null;
  agent_id: string | null;
  sender_type: "human" | "agent";
  content: string;
  confidence: { score?: number; reasoning?: string };
  metadata: Record<string, unknown>;
  created_at: string;
  display_name: string | null;
  agent_name: string | null;
}

export function getWorkspaces(userId: string) {
  return request<WorkspaceWithMembers[]>(`/workspaces/user/${userId}`);
}

export function getWorkspace(workspaceId: string, userId?: string) {
  const params = userId ? `?user_id=${userId}` : "";
  return request<WorkspaceWithMembers>(`/workspaces/${workspaceId}${params}`);
}

export function createWorkspace(
  userId: string,
  name: string,
  description?: string
) {
  return request<Workspace>(`/workspaces/?user_id=${userId}`, {
    method: "POST",
    body: JSON.stringify({ name, description: description || null }),
  });
}

export function joinWorkspace(workspaceId: string, userId: string) {
  return request<WorkspaceMember>(
    `/workspaces/${workspaceId}/join?user_id=${userId}`,
    { method: "POST" }
  );
}

export function leaveWorkspace(workspaceId: string, userId: string) {
  return request<{ status: string }>(
    `/workspaces/${workspaceId}/leave?user_id=${userId}`,
    { method: "DELETE" }
  );
}

export function getWorkspaceMembers(workspaceId: string) {
  return request<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`);
}

export function inviteMember(
  workspaceId: string,
  userId: string,
  role = "member"
) {
  return request<WorkspaceMember>(`/workspaces/${workspaceId}/invite`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, role }),
  });
}

export function getWorkspaceFeed(
  workspaceId: string,
  limit = 50,
  offset = 0
) {
  return request<FeedMessage[]>(
    `/workspaces/${workspaceId}/feed?limit=${limit}&offset=${offset}`
  );
}

export function postToFeed(
  workspaceId: string,
  userId: string,
  content: string
) {
  return request<FeedMessage>(
    `/workspaces/${workspaceId}/feed?user_id=${userId}`,
    {
      method: "POST",
      body: JSON.stringify({ content }),
    }
  );
}

// --- Knowledge Graph ---

export interface GraphEntity {
  id: string;
  workspace_id: string;
  author_agent_id: string | null;
  name: string;
  entity_type: string;
  properties: Record<string, unknown>;
  confidence_score: number;
  status: "draft" | "published" | "disputed" | "archived";
  created_at: string;
  updated_at: string;
}

export interface GraphRelationship {
  id: string;
  workspace_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  confidence_score: number;
  metadata: Record<string, unknown>;
  created_by_agent: string | null;
  created_at: string;
}

export function getEntities(
  workspaceId: string,
  options?: {
    entityType?: string;
    status?: string;
    minConfidence?: number;
    limit?: number;
  }
) {
  const params = new URLSearchParams();
  if (options?.entityType) params.set("entity_type", options.entityType);
  if (options?.status) params.set("status", options.status);
  if (options?.minConfidence != null)
    params.set("min_confidence", String(options.minConfidence));
  if (options?.limit) params.set("limit", String(options.limit));
  const qs = params.toString();
  return request<GraphEntity[]>(
    `/graph/workspaces/${workspaceId}/entities${qs ? `?${qs}` : ""}`
  );
}

export function createEntity(
  workspaceId: string,
  entity: {
    name: string;
    entity_type: string;
    properties?: Record<string, unknown>;
    confidence_score?: number;
    status?: string;
  },
  agentId?: string
) {
  const params = agentId ? `?agent_id=${agentId}` : "";
  return request<GraphEntity>(
    `/graph/workspaces/${workspaceId}/entities${params}`,
    {
      method: "POST",
      body: JSON.stringify(entity),
    }
  );
}

export function getRelationships(
  workspaceId: string,
  options?: {
    relationshipType?: string;
    entityId?: string;
    limit?: number;
  }
) {
  const params = new URLSearchParams();
  if (options?.relationshipType)
    params.set("relationship_type", options.relationshipType);
  if (options?.entityId) params.set("entity_id", options.entityId);
  if (options?.limit) params.set("limit", String(options.limit));
  const qs = params.toString();
  return request<GraphRelationship[]>(
    `/graph/workspaces/${workspaceId}/relationships${qs ? `?${qs}` : ""}`
  );
}

export function createRelationship(
  workspaceId: string,
  rel: {
    source_entity_id: string;
    target_entity_id: string;
    relationship_type: string;
    confidence_score?: number;
    metadata?: Record<string, unknown>;
    created_by_agent?: string;
  }
) {
  return request<GraphRelationship>(
    `/graph/workspaces/${workspaceId}/relationships`,
    {
      method: "POST",
      body: JSON.stringify(rel),
    }
  );
}

// --- Onboarding ---

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
