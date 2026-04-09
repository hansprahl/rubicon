-- ============================================
-- RLS Policies for Rubicon
-- ============================================

-- Helper: get current user's ID from Supabase auth
-- auth.uid() returns the logged-in user's UUID

-- ============================================
-- USERS
-- ============================================
CREATE POLICY "Users can read all users in their cohort"
    ON public.users FOR SELECT
    USING (true);  -- cohort members can see each other

CREATE POLICY "Users can update their own profile"
    ON public.users FOR UPDATE
    USING (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
    ON public.users FOR INSERT
    WITH CHECK (id = auth.uid());

-- ============================================
-- AGENT PROFILES
-- ============================================
CREATE POLICY "Users can read all agents"
    ON public.agent_profiles FOR SELECT
    USING (true);  -- agents are visible to the cohort

CREATE POLICY "Users can insert their own agent"
    ON public.agent_profiles FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own agent"
    ON public.agent_profiles FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own agent"
    ON public.agent_profiles FOR DELETE
    USING (user_id = auth.uid());

-- ============================================
-- ONBOARDING DOCS
-- ============================================
CREATE POLICY "Users can read their own docs"
    ON public.onboarding_docs FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can upload their own docs"
    ON public.onboarding_docs FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own docs"
    ON public.onboarding_docs FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own docs"
    ON public.onboarding_docs FOR DELETE
    USING (user_id = auth.uid());

-- ============================================
-- WORKSPACES
-- ============================================
CREATE POLICY "Members can read their workspaces"
    ON public.workspaces FOR SELECT
    USING (
        id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Authenticated users can create workspaces"
    ON public.workspaces FOR INSERT
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Workspace owners can update"
    ON public.workspaces FOR UPDATE
    USING (
        id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    );

CREATE POLICY "Workspace owners can delete"
    ON public.workspaces FOR DELETE
    USING (
        id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    );

-- ============================================
-- WORKSPACE MEMBERS
-- ============================================
CREATE POLICY "Members can see who is in their workspace"
    ON public.workspace_members FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Owners and admins can add members"
    ON public.workspace_members FOR INSERT
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Owners can remove members"
    ON public.workspace_members FOR DELETE
    USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    );

-- ============================================
-- SHARED ENTITIES (Knowledge Graph)
-- ============================================
CREATE POLICY "Workspace members can read entities"
    ON public.shared_entities FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Workspace members can create entities"
    ON public.shared_entities FOR INSERT
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Workspace members can update entities"
    ON public.shared_entities FOR UPDATE
    USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

-- ============================================
-- SHARED RELATIONSHIPS (Knowledge Graph)
-- ============================================
CREATE POLICY "Workspace members can read relationships"
    ON public.shared_relationships FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Workspace members can create relationships"
    ON public.shared_relationships FOR INSERT
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

-- ============================================
-- APPROVALS
-- ============================================
CREATE POLICY "Users can read their own approvals"
    ON public.approvals FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can update their own approvals"
    ON public.approvals FOR UPDATE
    USING (user_id = auth.uid());

-- Service role handles inserts (agents create approval requests)

-- ============================================
-- MESSAGES
-- ============================================
CREATE POLICY "Workspace members can read messages"
    ON public.messages FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
        OR (workspace_id IS NULL AND user_id = auth.uid())  -- 1:1 chat with own agent
    );

CREATE POLICY "Users can send messages"
    ON public.messages FOR INSERT
    WITH CHECK (
        user_id = auth.uid() AND sender_type = 'human'
    );

-- Service role handles agent message inserts

-- ============================================
-- AGENT TASKS
-- ============================================
CREATE POLICY "Users can read their agent's tasks"
    ON public.agent_tasks FOR SELECT
    USING (
        agent_id IN (
            SELECT id FROM public.agent_profiles
            WHERE user_id = auth.uid()
        )
        OR workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

-- Service role handles task creation/updates

-- ============================================
-- MILESTONES
-- ============================================
CREATE POLICY "Workspace members can read milestones"
    ON public.milestones FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Workspace members can create milestones"
    ON public.milestones FOR INSERT
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Workspace members can update milestones"
    ON public.milestones FOR UPDATE
    USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

-- ============================================
-- AGENT EVENTS
-- ============================================
CREATE POLICY "Workspace members can read events"
    ON public.agent_events FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
        )
    );

-- Service role handles event inserts (agents emit events)
