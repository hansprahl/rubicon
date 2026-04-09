-- 008: Agent Repository — custom agents created by users, shared across the cohort
-- Depends on: 001 (users, workspaces), 006 (tool_repository)

-- Custom agents created by users, stored in a shared repository
CREATE TABLE public.custom_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES public.users(id),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expertise TEXT[] DEFAULT '{}',
    system_prompt TEXT NOT NULL,
    tools TEXT[] DEFAULT '{}',
    category TEXT NOT NULL,
    icon TEXT DEFAULT '🤖',
    visibility TEXT NOT NULL DEFAULT 'cohort' CHECK (visibility IN ('private', 'workspace', 'cohort')),
    workspace_id UUID REFERENCES public.workspaces(id),
    clone_count INTEGER DEFAULT 0,
    rating_sum FLOAT DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
    doctrine_components JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Track which users have cloned/enabled which custom agents
CREATE TABLE public.user_custom_agents (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    custom_agent_id UUID NOT NULL REFERENCES public.custom_agents(id) ON DELETE CASCADE,
    enabled_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, custom_agent_id)
);

-- Ratings for custom agents
CREATE TABLE public.agent_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id),
    custom_agent_id UUID NOT NULL REFERENCES public.custom_agents(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, custom_agent_id)
);

-- Indexes
CREATE INDEX idx_custom_agents_category ON public.custom_agents(category, status);
CREATE INDEX idx_custom_agents_creator ON public.custom_agents(created_by);
CREATE INDEX idx_custom_agents_visibility ON public.custom_agents(visibility, status);
CREATE INDEX idx_user_custom_agents_user ON public.user_custom_agents(user_id);

-- RLS
ALTER TABLE public.custom_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_custom_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_ratings ENABLE ROW LEVEL SECURITY;

-- Custom agents: users can see cohort agents, their own, and workspace agents they belong to
CREATE POLICY "Read visible custom agents" ON public.custom_agents FOR SELECT USING (
    visibility = 'cohort'
    OR created_by = auth.uid()
    OR (visibility = 'workspace' AND workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    ))
);
CREATE POLICY "Users can create custom agents" ON public.custom_agents FOR INSERT
    WITH CHECK (created_by = auth.uid());
CREATE POLICY "Users can update their own custom agents" ON public.custom_agents FOR UPDATE
    USING (created_by = auth.uid());
CREATE POLICY "Users can delete their own custom agents" ON public.custom_agents FOR DELETE
    USING (created_by = auth.uid());

-- User custom agents junction
CREATE POLICY "Users can read their enabled custom agents" ON public.user_custom_agents FOR SELECT
    USING (user_id = auth.uid());
CREATE POLICY "Users can enable custom agents" ON public.user_custom_agents FOR INSERT
    WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can disable custom agents" ON public.user_custom_agents FOR DELETE
    USING (user_id = auth.uid());

-- Ratings
CREATE POLICY "Anyone can read ratings" ON public.agent_ratings FOR SELECT USING (true);
CREATE POLICY "Users can rate agents" ON public.agent_ratings FOR INSERT
    WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own ratings" ON public.agent_ratings FOR UPDATE
    USING (user_id = auth.uid());
