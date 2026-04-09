-- Direct messaging between users
-- Separate from agent conversations and workspace feeds

CREATE TABLE public.dm_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_1 UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    participant_2 UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (participant_1, participant_2)
);

CREATE INDEX idx_dm_conversations_p1 ON public.dm_conversations(participant_1);
CREATE INDEX idx_dm_conversations_p2 ON public.dm_conversations(participant_2);

CREATE TABLE public.dm_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.users(id),
    content TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dm_messages_conv ON public.dm_messages(conversation_id, created_at);

-- RLS
ALTER TABLE public.dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY dm_conv_select ON public.dm_conversations FOR SELECT USING (true);
CREATE POLICY dm_conv_insert ON public.dm_conversations FOR INSERT WITH CHECK (true);
CREATE POLICY dm_conv_update ON public.dm_conversations FOR UPDATE USING (true);
CREATE POLICY dm_conv_delete ON public.dm_conversations FOR DELETE USING (true);

CREATE POLICY dm_msg_select ON public.dm_messages FOR SELECT USING (true);
CREATE POLICY dm_msg_insert ON public.dm_messages FOR INSERT WITH CHECK (true);
CREATE POLICY dm_msg_update ON public.dm_messages FOR UPDATE USING (true);
CREATE POLICY dm_msg_delete ON public.dm_messages FOR DELETE USING (true);

-- Enable realtime on dm_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
