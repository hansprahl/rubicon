-- Phase: Progressive onboarding — template agents + fidelity tracking

-- Add fidelity tracking to agent_profiles
ALTER TABLE public.agent_profiles
  ADD COLUMN IF NOT EXISTS fidelity FLOAT DEFAULT 0.2
  CHECK (fidelity BETWEEN 0 AND 1);

-- Store enrichment answers persistently
ALTER TABLE public.agent_profiles
  ADD COLUMN IF NOT EXISTS enrichment_answers JSONB DEFAULT '{}';

-- Track which Google services are connected
ALTER TABLE public.agent_profiles
  ADD COLUMN IF NOT EXISTS google_services TEXT[] DEFAULT '{}';

-- Backfill fidelity for existing agents that already have docs
-- (Run this after migration — sets fidelity based on existing onboarding_docs)
DO $$
DECLARE
  r RECORD;
  doc_count INT;
  new_fidelity FLOAT;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.agent_profiles LOOP
    SELECT COUNT(*) INTO doc_count
    FROM public.onboarding_docs
    WHERE user_id = r.user_id;

    new_fidelity := 0.20;
    IF doc_count >= 1 THEN new_fidelity := new_fidelity + 0.20; END IF; -- IDP
    IF doc_count >= 2 THEN new_fidelity := new_fidelity + 0.15; END IF; -- Ethics
    IF doc_count >= 3 THEN new_fidelity := new_fidelity + 0.15; END IF; -- Insights

    -- Check if enrichment_answers is non-empty
    IF (SELECT enrichment_answers FROM public.agent_profiles WHERE user_id = r.user_id) != '{}'::jsonb THEN
      new_fidelity := new_fidelity + 0.10;
    END IF;

    UPDATE public.agent_profiles SET fidelity = new_fidelity WHERE user_id = r.user_id;
  END LOOP;
END $$;
