-- North Star: the soul layer of each agent
-- Each user has one North Star that anchors their agent's identity

-- User North Stars
CREATE TABLE public.north_stars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
    mission TEXT NOT NULL,                    -- One-sentence mission statement
    principles JSONB NOT NULL DEFAULT '[]',   -- Array of {title, description} guiding principles
    vision TEXT,                               -- 5-year vision statement
    non_negotiables TEXT[],                    -- Values/principles that never bend
    synthesis_source JSONB DEFAULT '{}',       -- Which docs contributed (idp, ethics, insights, enrichment)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_north_stars_user ON public.north_stars(user_id);

ALTER TABLE public.north_stars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all north stars"
    ON public.north_stars FOR SELECT USING (true);  -- Cohort members can see each other's north stars

CREATE POLICY "Users can manage their own north star"
    ON public.north_stars FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own north star"
    ON public.north_stars FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own north star"
    ON public.north_stars FOR DELETE
    USING (user_id = auth.uid());
