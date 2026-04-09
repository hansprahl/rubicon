-- ============================================
-- Phase 6: Event subscriptions table + indexes
-- ============================================

-- Persistent event subscriptions — tracks which agents subscribe to which event types
CREATE TABLE public.event_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES public.agent_profiles(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(workspace_id, agent_id, event_type)
);

-- Index for quick lookup of active subscriptions by workspace
CREATE INDEX idx_event_subscriptions_workspace
    ON public.event_subscriptions(workspace_id, event_type)
    WHERE active = true;

-- Index for looking up subscriptions by agent
CREATE INDEX idx_event_subscriptions_agent
    ON public.event_subscriptions(agent_id)
    WHERE active = true;

-- Add index on shared_relationships for disagreement detection queries
CREATE INDEX idx_shared_relationships_target_type
    ON public.shared_relationships(target_entity_id, relationship_type);

-- Add index on agent_events for event type filtering
CREATE INDEX idx_agent_events_type
    ON public.agent_events(workspace_id, event_type, created_at DESC);

-- RLS for event_subscriptions
ALTER TABLE public.event_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can read subscriptions"
    ON public.event_subscriptions FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage their agent subscriptions"
    ON public.event_subscriptions FOR INSERT
    WITH CHECK (
        agent_id IN (
            SELECT id FROM public.agent_profiles
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their agent subscriptions"
    ON public.event_subscriptions FOR UPDATE
    USING (
        agent_id IN (
            SELECT id FROM public.agent_profiles
            WHERE user_id = auth.uid()
        )
    );
