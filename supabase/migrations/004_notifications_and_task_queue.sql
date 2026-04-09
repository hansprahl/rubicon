-- Phase 8: Notifications table + task queue improvements

-- Notifications (in-app notification system)
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    category TEXT NOT NULL DEFAULT 'info'
        CHECK (category IN ('approval', 'disagreement', 'milestone', 'agent', 'workspace', 'info')),
    link TEXT,                                     -- optional deep link, e.g. /approvals
    read BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread
    ON public.notifications(user_id, created_at DESC) WHERE read = false;
CREATE INDEX idx_notifications_user_all
    ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS: users can only see their own notifications
CREATE POLICY "Users can view own notifications"
    ON public.notifications FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
    ON public.notifications FOR UPDATE
    USING (user_id = auth.uid());

-- Add priority and retry columns to agent_tasks for queue processing
ALTER TABLE public.agent_tasks
    ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3,
    ADD COLUMN IF NOT EXISTS error_message TEXT,
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX idx_agent_tasks_queue
    ON public.agent_tasks(priority DESC, created_at ASC) WHERE status = 'queued';
