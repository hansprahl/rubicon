-- Multi-conversation support for agent chats
-- Each agent can have multiple named conversations

CREATE TABLE public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.agent_profiles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'New chat',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_conversations_agent_user ON public.conversations(agent_id, user_id);
CREATE INDEX idx_conversations_updated ON public.conversations(updated_at DESC);

-- Add conversation_id to messages (nullable for backwards compat with workspace messages)
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE;

CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Users can manage their own conversations
CREATE POLICY conversations_select ON public.conversations FOR SELECT USING (true);
CREATE POLICY conversations_insert ON public.conversations FOR INSERT WITH CHECK (true);
CREATE POLICY conversations_update ON public.conversations FOR UPDATE USING (true);
CREATE POLICY conversations_delete ON public.conversations FOR DELETE USING (true);

-- Migrate existing agent chat messages into a default conversation per agent
-- (Only messages without workspace_id — those are workspace feed messages, not 1:1 chats)
DO $$
DECLARE
    r RECORD;
    conv_id UUID;
BEGIN
    FOR r IN
        SELECT DISTINCT agent_id, user_id
        FROM public.messages
        WHERE conversation_id IS NULL
          AND workspace_id IS NULL
          AND agent_id IS NOT NULL
    LOOP
        INSERT INTO public.conversations (agent_id, user_id, title, created_at)
        VALUES (r.agent_id, COALESCE(r.user_id, (SELECT user_id FROM public.agent_profiles WHERE id = r.agent_id LIMIT 1)), 'Previous chat', now())
        RETURNING id INTO conv_id;

        UPDATE public.messages
        SET conversation_id = conv_id
        WHERE agent_id = r.agent_id
          AND conversation_id IS NULL
          AND workspace_id IS NULL;
    END LOOP;
END $$;
