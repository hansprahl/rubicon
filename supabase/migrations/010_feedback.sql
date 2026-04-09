CREATE TABLE public.feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('bug', 'feature', 'improvement', 'general')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    page_url TEXT,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'planned', 'fixed', 'closed', 'wont_fix')),
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    upvotes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.feedback_upvotes (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    feedback_id UUID NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, feedback_id)
);

CREATE INDEX idx_feedback_status ON public.feedback(status, created_at DESC);
CREATE INDEX idx_feedback_type ON public.feedback(type, status);
CREATE INDEX idx_feedback_user ON public.feedback(user_id);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_upvotes ENABLE ROW LEVEL SECURITY;

-- All cohort members can read feedback
CREATE POLICY "Anyone can read feedback" ON public.feedback FOR SELECT USING (true);
CREATE POLICY "Users can create feedback" ON public.feedback FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own feedback" ON public.feedback FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Anyone can read upvotes" ON public.feedback_upvotes FOR SELECT USING (true);
CREATE POLICY "Users can upvote" ON public.feedback_upvotes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can remove upvote" ON public.feedback_upvotes FOR DELETE USING (user_id = auth.uid());

-- Helper functions for atomic upvote counting
CREATE OR REPLACE FUNCTION increment_feedback_upvotes(fid UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.feedback SET upvotes = upvotes + 1, updated_at = now() WHERE id = fid;
$$;

CREATE OR REPLACE FUNCTION decrement_feedback_upvotes(fid UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.feedback SET upvotes = GREATEST(upvotes - 1, 0), updated_at = now() WHERE id = fid;
$$;
