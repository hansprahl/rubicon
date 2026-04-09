-- Users (extends Supabase auth.users)
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    display_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    avatar_url TEXT,
    cohort TEXT DEFAULT 'cohort-84',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent Profiles (one per user — the digital twin)
CREATE TABLE public.agent_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
    agent_name TEXT NOT NULL,              -- e.g. "Hans's Agent"
    expertise TEXT[] DEFAULT '{}',         -- extracted from IDP
    goals TEXT[] DEFAULT '{}',             -- extracted from IDP
    values TEXT[] DEFAULT '{}',            -- extracted from Ethics paper
    personality JSONB DEFAULT '{}',        -- extracted from Insights profile
    communication_style TEXT,              -- Insights color profile
    system_prompt TEXT,                    -- synthesized from all three docs
    autonomy_level INTEGER DEFAULT 2 CHECK (autonomy_level BETWEEN 1 AND 5),
    status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'thinking', 'working', 'waiting_approval')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Onboarding Documents (track what each user uploaded)
CREATE TABLE public.onboarding_docs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL CHECK (doc_type IN ('idp', 'ethics', 'insights')),
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,            -- Supabase Storage path
    parsed_data JSONB DEFAULT '{}',        -- extracted structured data
    uploaded_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, doc_type)
);

-- Workspaces (shared collaboration spaces)
CREATE TABLE public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES public.users(id),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Workspace Members
CREATE TABLE public.workspace_members (
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (workspace_id, user_id)
);

-- Shared Knowledge Graph — Entities
CREATE TABLE public.shared_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    author_agent_id UUID REFERENCES public.agent_profiles(id),
    name TEXT NOT NULL,
    entity_type TEXT NOT NULL,             -- person, company, concept, finding, recommendation
    properties JSONB DEFAULT '{}',
    confidence_score FLOAT DEFAULT 0.5 CHECK (confidence_score BETWEEN 0 AND 1),
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'disputed', 'archived')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Shared Knowledge Graph — Relationships
CREATE TABLE public.shared_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    source_entity_id UUID NOT NULL REFERENCES public.shared_entities(id) ON DELETE CASCADE,
    target_entity_id UUID NOT NULL REFERENCES public.shared_entities(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL,        -- SUPPORTS, CONTRADICTS, BUILDS_ON, RELATES_TO
    confidence_score FLOAT DEFAULT 0.5,
    metadata JSONB DEFAULT '{}',
    created_by_agent UUID REFERENCES public.agent_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Approval Queue
CREATE TABLE public.approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id),
    agent_id UUID NOT NULL REFERENCES public.agent_profiles(id),
    workspace_id UUID REFERENCES public.workspaces(id),
    action_type TEXT NOT NULL,             -- publish_entity, send_message, update_estimate, create_relationship
    payload JSONB NOT NULL,                -- what the agent wants to do
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    human_note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

-- Messages (chat — both human and agent)
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id),
    agent_id UUID REFERENCES public.agent_profiles(id),
    sender_type TEXT NOT NULL CHECK (sender_type IN ('human', 'agent')),
    content TEXT NOT NULL,
    confidence JSONB DEFAULT '{}',         -- {score: 0.85, reasoning: "..."}
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Agent Tasks (what agents are working on)
CREATE TABLE public.agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.agent_profiles(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES public.workspaces(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'working', 'needs_approval', 'done', 'failed')),
    result JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Milestones (battle tracking)
CREATE TABLE public.milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'complete', 'at_risk', 'missed')),
    assigned_agents UUID[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent Events (inter-agent event bus — persisted)
CREATE TABLE public.agent_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id),
    source_agent_id UUID REFERENCES public.agent_profiles(id),
    event_type TEXT NOT NULL,              -- finding_published, confidence_updated, task_completed, disagreement_flagged
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_messages_workspace ON public.messages(workspace_id, created_at DESC);
CREATE INDEX idx_approvals_user_pending ON public.approvals(user_id, status) WHERE status = 'pending';
CREATE INDEX idx_agent_tasks_agent ON public.agent_tasks(agent_id, status);
CREATE INDEX idx_shared_entities_workspace ON public.shared_entities(workspace_id, status);
CREATE INDEX idx_agent_events_workspace ON public.agent_events(workspace_id, created_at DESC);

-- RLS Policies (enable row-level security)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;
