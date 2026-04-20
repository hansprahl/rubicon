-- Fix wide-open DM RLS policies from 013.
-- Originals used USING (true) — any authenticated user could read/modify any
-- conversation or message. Replace with participant-based access.
-- Note: the API backend uses the service_role key which bypasses RLS, so the
-- real gate is the FastAPI JWT check (see api/auth.py). These policies are
-- defense-in-depth for any future code path that uses the anon key directly.

DROP POLICY IF EXISTS dm_conv_select ON public.dm_conversations;
DROP POLICY IF EXISTS dm_conv_insert ON public.dm_conversations;
DROP POLICY IF EXISTS dm_conv_update ON public.dm_conversations;
DROP POLICY IF EXISTS dm_conv_delete ON public.dm_conversations;

DROP POLICY IF EXISTS dm_msg_select ON public.dm_messages;
DROP POLICY IF EXISTS dm_msg_insert ON public.dm_messages;
DROP POLICY IF EXISTS dm_msg_update ON public.dm_messages;
DROP POLICY IF EXISTS dm_msg_delete ON public.dm_messages;

-- Conversations: caller must be one of the two participants.
CREATE POLICY dm_conv_select ON public.dm_conversations
    FOR SELECT USING (participant_1 = auth.uid() OR participant_2 = auth.uid());

CREATE POLICY dm_conv_insert ON public.dm_conversations
    FOR INSERT WITH CHECK (participant_1 = auth.uid() OR participant_2 = auth.uid());

CREATE POLICY dm_conv_update ON public.dm_conversations
    FOR UPDATE USING (participant_1 = auth.uid() OR participant_2 = auth.uid());

-- Intentionally no DELETE policy — DMs are not user-deletable.

-- Messages: caller must be a participant of the conversation.
CREATE POLICY dm_msg_select ON public.dm_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.dm_conversations c
            WHERE c.id = dm_messages.conversation_id
              AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
        )
    );

CREATE POLICY dm_msg_insert ON public.dm_messages
    FOR INSERT WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.dm_conversations c
            WHERE c.id = dm_messages.conversation_id
              AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
        )
    );

CREATE POLICY dm_msg_update ON public.dm_messages
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.dm_conversations c
            WHERE c.id = dm_messages.conversation_id
              AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
        )
    );
