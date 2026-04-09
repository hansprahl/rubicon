const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://rubicon-production-cc7d.up.railway.app/api";

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
  fidelity?: number;
  created_at: string;
  updated_at: string;
}

export function ensureAgent(userId: string) {
  return request<{ status: string; agent_id: string }>(`/agents/ensure/${userId}`, {
    method: "POST",
  });
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

export function sendMessage(agentId: string, content: string, conversationId?: string) {
  return request<ChatMessage>(`/agents/${agentId}/chat`, {
    method: "POST",
    body: JSON.stringify({ content, conversation_id: conversationId || null }),
  });
}

export function getMessages(agentId: string, conversationId?: string, limit = 50) {
  const params = conversationId ? `?conversation_id=${conversationId}&limit=${limit}` : `?limit=${limit}`;
  return request<ChatMessage[]>(`/agents/${agentId}/messages${params}`);
}

// --- Conversations ---

export interface Conversation {
  id: string;
  agent_id: string;
  user_id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_message: string | null;
  message_count: number;
}

export function getConversations(agentId: string) {
  return request<Conversation[]>(`/agents/${agentId}/conversations`);
}

export function createConversation(agentId: string, title = "New chat") {
  return request<Conversation>(`/agents/${agentId}/conversations?title=${encodeURIComponent(title)}`, {
    method: "POST",
  });
}

export function deleteConversation(agentId: string, conversationId: string) {
  return request<{ status: string }>(`/agents/${agentId}/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

export function renameConversation(agentId: string, conversationId: string, title: string) {
  return request<Conversation>(`/agents/${agentId}/conversations/${conversationId}?title=${encodeURIComponent(title)}`, {
    method: "PATCH",
  });
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

export interface DirectoryUser {
  id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  agent_name: string | null;
}

export function getDirectoryUsers() {
  return request<DirectoryUser[]>("/workspaces/directory/users");
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

export function deleteWorkspace(workspaceId: string, userId: string) {
  return request<{ status: string }>(`/workspaces/${workspaceId}?user_id=${userId}`, {
    method: "DELETE",
  });
}

export function renameWorkspace(workspaceId: string, name: string, description?: string) {
  const body: Record<string, string> = { name };
  if (description !== undefined) body.description = description;
  return request<Workspace>(`/workspaces/${workspaceId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
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

// --- Direct Messages ---

export interface DMConversation {
  id: string;
  other_user_id: string;
  other_user_name: string;
  last_message: string | null;
  last_message_at: string;
  unread_count: number;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface DMMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  read_at: string | null;
  created_at: string;
}

export function getDMConversations(userId: string) {
  return request<DMConversation[]>(`/dm/conversations?user_id=${userId}`);
}

export function getOrCreateDM(userId: string, otherUserId: string) {
  return request<{ id: string; participant_1: string; participant_2: string }>(
    `/dm/conversations?user_id=${userId}&other_user_id=${otherUserId}`,
    { method: "POST" }
  );
}

export function getDMMessages(conversationId: string, limit = 50) {
  return request<DMMessage[]>(`/dm/conversations/${conversationId}/messages?limit=${limit}`);
}

export function sendDM(conversationId: string, userId: string, content: string) {
  return request<DMMessage>(
    `/dm/conversations/${conversationId}/messages?user_id=${userId}`,
    { method: "POST", body: JSON.stringify({ content }) }
  );
}

export function markDMRead(conversationId: string, userId: string) {
  return request<{ status: string }>(
    `/dm/conversations/${conversationId}/read?user_id=${userId}`,
    { method: "POST" }
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

// --- Milestones ---

export interface Milestone {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: "pending" | "in_progress" | "complete" | "at_risk" | "missed";
  assigned_agents: string[];
  created_at: string;
  updated_at: string;
}

export function getMilestones(
  workspaceId: string,
  status?: string
) {
  const params = status ? `?status=${status}` : "";
  return request<Milestone[]>(
    `/milestones/workspaces/${workspaceId}${params}`
  );
}

export function createMilestone(
  workspaceId: string,
  milestone: {
    title: string;
    description?: string;
    due_date?: string;
    assigned_agents?: string[];
  }
) {
  return request<Milestone>(`/milestones/workspaces/${workspaceId}`, {
    method: "POST",
    body: JSON.stringify(milestone),
  });
}

export function updateMilestone(
  milestoneId: string,
  data: {
    title?: string;
    description?: string;
    due_date?: string;
    status?: string;
    assigned_agents?: string[];
  }
) {
  return request<Milestone>(`/milestones/${milestoneId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteMilestone(milestoneId: string) {
  return request<{ status: string }>(`/milestones/${milestoneId}`, {
    method: "DELETE",
  });
}

// --- Agent Tasks ---

export interface AgentTask {
  id: string;
  agent_id: string;
  workspace_id: string | null;
  title: string;
  description: string | null;
  status: "queued" | "working" | "needs_approval" | "done" | "failed";
  result: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function getWorkspaceTasks(
  workspaceId: string,
  status?: string
) {
  const params = status ? `?status=${status}` : "";
  return request<AgentTask[]>(
    `/milestones/tasks/workspace/${workspaceId}${params}`
  );
}

export function updateTask(
  taskId: string,
  data: { title?: string; description?: string; status?: string; result?: Record<string, unknown> }
) {
  return request<AgentTask>(`/milestones/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// --- Notifications ---

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  category: "approval" | "disagreement" | "milestone" | "agent" | "workspace" | "info";
  link: string | null;
  read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function getNotifications(userId: string, unreadOnly = false, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (unreadOnly) params.set("unread_only", "true");
  return request<Notification[]>(`/notifications/user/${userId}?${params}`);
}

export function getUnreadNotificationCount(userId: string) {
  return request<{ count: number }>(`/notifications/user/${userId}/count`);
}

export function markNotificationRead(notificationId: string) {
  return request<Notification>(`/notifications/${notificationId}/read`, {
    method: "POST",
  });
}

export function markAllNotificationsRead(userId: string) {
  return request<{ status: string }>(`/notifications/user/${userId}/read-all`, {
    method: "POST",
  });
}

// --- North Star ---

export interface NorthStar {
  id: string;
  user_id: string;
  mission: string;
  principles: { title: string; description: string }[];
  vision: string | null;
  non_negotiables: string[];
  synthesis_source: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface GuidedQuestion {
  id: string;
  question: string;
  context?: string;
  required: boolean;
}

export function getNorthStar(userId: string) {
  return request<NorthStar>(`/north-star/${userId}`);
}

export function saveNorthStar(
  userId: string,
  data: { mission: string; principles: { title: string; description: string }[]; vision?: string | null; non_negotiables: string[] }
) {
  return request<NorthStar>(`/north-star/${userId}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function guidedSynthesis(userId: string, answers: Record<string, string>) {
  return request<NorthStar>(`/north-star/${userId}/guided`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
}

export function getNorthStarQuestions(userId: string) {
  return request<{ questions: GuidedQuestion[] }>(`/north-star/${userId}/questions`);
}

export function deleteNorthStar(userId: string) {
  return request<{ status: string }>(`/north-star/${userId}`, {
    method: "DELETE",
  });
}

// --- Anatomy ---

export interface BodySystem {
  name: string;
  status: "dormant" | "developing" | "active" | "strong";
  health: number;
  detail: string;
}

export interface AgentAnatomy {
  soul: BodySystem;
  brain: BodySystem;
  heart: BodySystem;
  voice: BodySystem;
  gut: BodySystem;
  hands: BodySystem;
  muscle: BodySystem;
  connective_tissue: BodySystem;
  skin: BodySystem;
  blood: BodySystem;
  heartbeat: {
    status: string;
    bpm: number;
    health: number;
  };
  overall_health: number;
}

export function getAnatomy(userId: string) {
  return request<AgentAnatomy>(`/anatomy/${userId}`);
}

export function getHeartbeat(userId: string) {
  return request<{ heartbeat: { status: string; bpm: number; health: number }; overall_health: number }>(
    `/anatomy/${userId}/heartbeat`
  );
}

// --- Agent Profile Update ---

export function updateAgent(
  agentId: string,
  data: {
    agent_name?: string;
    expertise?: string[];
    goals?: string[];
    values?: string[];
    communication_style?: string;
    autonomy_level?: number;
  }
) {
  return request<AgentProfile>(`/agents/${agentId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// --- Tool Repository ---

export interface RepoTool {
  id: string;
  name: string;
  display_name: string;
  description: string;
  category: string;
  icon: string;
  is_workspace_aware: boolean;
  requires_google: boolean;
  input_schema: Record<string, unknown>;
  enabled_at?: string;
}

export function listTools(category?: string) {
  const params = category ? `?category=${category}` : "";
  return request<RepoTool[]>(`/tools${params}`);
}

export function getAgentTools(agentId: string) {
  return request<RepoTool[]>(`/tools/agent/${agentId}`);
}

export function enableTool(agentId: string, toolId: string) {
  return request<{ status: string }>(`/tools/agent/${agentId}/${toolId}`, { method: "POST" });
}

export function disableTool(agentId: string, toolId: string) {
  return request<{ status: string }>(`/tools/agent/${agentId}/${toolId}`, { method: "DELETE" });
}

export function bulkEnableTools(agentId: string, toolIds: string[]) {
  return request<{ status: string }>(`/tools/agent/${agentId}/bulk`, {
    method: "POST",
    body: JSON.stringify({ tool_ids: toolIds }),
  });
}

export function getToolCategories() {
  return request<{ category: string; count: number }[]>(`/tools/categories`);
}

// --- Custom Agent Repository ---

export interface CustomAgent {
  id: string;
  created_by: string;
  name: string;
  description: string;
  purpose: string;
  expertise: string[];
  system_prompt: string;
  tools: string[];
  category: string;
  icon: string;
  visibility: "private" | "workspace" | "cohort";
  workspace_id: string | null;
  clone_count: number;
  rating_sum: number;
  rating_count: number;
  status: "active" | "draft" | "archived";
  doctrine_components: Record<string, boolean>;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  enabled_at?: string;
  reviews?: AgentReview[];
}

export interface AgentReview {
  id: string;
  user_id: string;
  custom_agent_id: string;
  rating: number;
  review: string | null;
  created_at: string;
  reviewer_name?: string;
}

export interface BuildAgentPayload {
  name: string;
  purpose: string;
  category: string;
  expertise: string[];
  tools: string[];
  visibility: string;
  workspace_id: string | null;
  doctrine_config: {
    confidence_scoring: boolean;
    knowledge_graph: boolean;
    approval_required: boolean;
    proactive: boolean;
  };
  icon: string;
}

export function listCustomAgents(options?: {
  category?: string;
  visibility?: string;
  search?: string;
  sort?: string;
  user_id?: string;
}) {
  const params = new URLSearchParams();
  if (options?.category) params.set("category", options.category);
  if (options?.visibility) params.set("visibility", options.visibility);
  if (options?.search) params.set("search", options.search);
  if (options?.sort) params.set("sort", options.sort);
  if (options?.user_id) params.set("user_id", options.user_id);
  const qs = params.toString();
  return request<CustomAgent[]>(`/agent-repo${qs ? `?${qs}` : ""}`);
}

export function getCustomAgent(agentId: string) {
  return request<CustomAgent>(`/agent-repo/${agentId}`);
}

export function createCustomAgent(userId: string, data: {
  name: string;
  description: string;
  purpose: string;
  expertise: string[];
  tools: string[];
  category: string;
  icon: string;
  visibility: string;
  workspace_id: string | null;
  doctrine_components: Record<string, boolean>;
}) {
  return request<CustomAgent>(`/agent-repo?user_id=${userId}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function buildCustomAgent(userId: string, data: BuildAgentPayload) {
  return request<CustomAgent>(`/agent-repo/build?user_id=${userId}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateCustomAgent(agentId: string, userId: string, data: Partial<CustomAgent>) {
  return request<CustomAgent>(`/agent-repo/${agentId}?user_id=${userId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteCustomAgent(agentId: string, userId: string) {
  return request<{ status: string }>(`/agent-repo/${agentId}?user_id=${userId}`, {
    method: "DELETE",
  });
}

export function cloneCustomAgent(agentId: string, userId: string) {
  return request<{ status: string; clone_count: number }>(`/agent-repo/${agentId}/clone?user_id=${userId}`, {
    method: "POST",
  });
}

export function uncloneCustomAgent(agentId: string, userId: string) {
  return request<{ status: string }>(`/agent-repo/${agentId}/clone?user_id=${userId}`, {
    method: "DELETE",
  });
}

export function rateCustomAgent(agentId: string, userId: string, rating: number, review?: string) {
  return request<{ status: string; average_rating: number; rating_count: number }>(
    `/agent-repo/${agentId}/rate?user_id=${userId}`,
    {
      method: "POST",
      body: JSON.stringify({ rating, review: review || null }),
    }
  );
}

export function getAgentRepoCategories() {
  return request<{ category: string; count: number }[]>(`/agent-repo/categories`);
}

export function getMyCustomAgents(userId: string) {
  return request<CustomAgent[]>(`/agent-repo/my-agents?user_id=${userId}`);
}

export function getMyEnabledAgents(userId: string) {
  return request<CustomAgent[]>(`/agent-repo/my-enabled?user_id=${userId}`);
}

// --- Intelligence ---

export interface Suggestion {
  id: string;
  user_id: string | null;
  suggestion_type: "tool" | "agent" | "fidelity" | "north_star" | "workspace" | "creation";
  title: string;
  body: string;
  action_url: string | null;
  priority: number;
  dismissed: boolean;
  created_at: string;
}

export interface CohortDigest {
  new_agents: { name: string; creator: string; id: string }[];
  trending_tools: { name: string; display_name: string; usage_count: number }[];
  active_workspaces: { name: string; id: string; message_count: number }[];
  suggested_creations: string[];
}

export interface CohortTrends {
  top_tools: { name: string; display_name: string; enabled_count: number }[];
  active_workspaces: { name: string; id: string; member_count: number; recent_messages: number }[];
  trending_agents: { name: string; id: string; clone_count: number; avg_rating: number }[];
  cohort_stats: { total_users: number; agents_with_north_star: number; avg_fidelity: number; total_custom_agents: number };
}

export function getSuggestions(userId: string) {
  return request<Suggestion[]>(`/intelligence/suggestions/${userId}`);
}

export function dismissSuggestion(suggestionId: string) {
  return request<{ status: string }>(`/intelligence/suggestions/${suggestionId}/dismiss`, {
    method: "POST",
  });
}

export function getCohortDigest() {
  return request<CohortDigest>(`/intelligence/digest`);
}

export function getCohortTrends() {
  return request<CohortTrends>(`/intelligence/trends`);
}

export function triggerIntelligenceCheck(userId: string) {
  return request<{ users_checked: number; suggestions_created: number }>(
    `/intelligence/check/${userId}`,
    { method: "POST" }
  );
}

// --- Onboarding ---

// --- Feedback ---

export interface Feedback {
  id: string;
  user_id: string;
  type: "bug" | "feature" | "improvement" | "general";
  title: string;
  body: string;
  page_url: string | null;
  status: "open" | "in_review" | "planned" | "fixed" | "closed" | "wont_fix";
  priority: "low" | "normal" | "high" | "critical";
  upvotes: number;
  created_at: string;
  updated_at: string;
  user_upvoted?: boolean;
  users?: { display_name: string | null };
}

export interface FeedbackStats {
  total: number;
  open_bugs: number;
  open_features: number;
  open_improvements: number;
  by_status: Record<string, number>;
  by_type: Record<string, number>;
}

export function listFeedback(options?: {
  type?: string;
  status?: string;
  sort?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (options?.type) params.set("type", options.type);
  if (options?.status) params.set("status", options.status);
  if (options?.sort) params.set("sort", options.sort);
  if (options?.userId) params.set("user_id", options.userId);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  const qs = params.toString();
  return request<Feedback[]>(`/feedback${qs ? `?${qs}` : ""}`);
}

export function createFeedback(
  userId: string,
  data: { type: string; title: string; body: string; page_url?: string }
) {
  return request<Feedback>(`/feedback?user_id=${userId}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function upvoteFeedback(feedbackId: string, userId: string) {
  return request<{ upvoted: boolean; upvotes: number }>(
    `/feedback/${feedbackId}/upvote?user_id=${userId}`,
    { method: "POST" }
  );
}

export function getFeedbackStats() {
  return request<FeedbackStats>(`/feedback/stats`);
}

// --- Onboarding ---

// --- Admin ---

export interface AdminUser {
  id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  status: "pending" | "approved" | "rejected";
  is_admin: boolean;
  cohort: string;
  created_at: string;
  agent_name: string | null;
  fidelity: number | null;
}

export function getAdminUsers(adminId: string) {
  return request<AdminUser[]>(`/admin/users?admin_id=${adminId}`);
}

export function updateUserStatus(userId: string, status: "approved" | "rejected", adminId: string) {
  return request<{ status: string; user_id: string; new_status: string }>(
    `/admin/users/${userId}/status?admin_id=${adminId}`,
    {
      method: "POST",
      body: JSON.stringify({ status }),
    }
  );
}

export function toggleUserAdmin(userId: string, adminId: string) {
  return request<{ status: string; user_id: string; is_admin: boolean }>(
    `/admin/users/${userId}/admin?admin_id=${adminId}`,
    { method: "POST" }
  );
}

export function checkUserStatus(userId: string) {
  return request<{ status: string; is_admin: boolean }>(`/admin/users/${userId}/check`);
}

// --- Onboarding ---

export function synthesizeProfile(
  userId: string,
  agentName: string,
  autonomyLevel: number,
  enrichmentAnswers?: Record<string, string>
) {
  return request<Record<string, unknown>>(`/onboarding/synthesize/${userId}`, {
    method: "POST",
    body: JSON.stringify({
      agent_name: agentName,
      autonomy_level: autonomyLevel,
      enrichment_answers: enrichmentAnswers,
    }),
  });
}
