-- 009_intelligence.sql — Rubicon Intelligence suggestion storage
-- Stores platform-generated suggestions so they don't get regenerated

CREATE TABLE public.intelligence_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,  -- NULL = cohort-wide
    suggestion_type TEXT NOT NULL,  -- 'tool', 'agent', 'fidelity', 'north_star', 'workspace', 'creation'
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    action_url TEXT,
    priority INTEGER DEFAULT 0,
    dismissed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_intelligence_user ON public.intelligence_suggestions(user_id, dismissed, created_at DESC);

ALTER TABLE public.intelligence_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own suggestions" ON public.intelligence_suggestions FOR SELECT
    USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can dismiss their suggestions" ON public.intelligence_suggestions FOR UPDATE
    USING (user_id = auth.uid());
