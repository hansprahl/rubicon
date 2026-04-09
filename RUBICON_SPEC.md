# Rubicon — Collaborative Digital Twin Platform

**Owner:** Hans Prahl
**Cohort:** EMBA Cohort 84, University of Denver, Daniels College of Business
**Created:** 2026-04-08

## What It Is

A collaborative agentic workspace where every cohort member gets a persistent AI agent that is an **agentic representation of themselves** — built from their actual goals, values, and personality. Agents collaborate in shared workspaces, disagree with calibrated confidence, and keep working when the human is offline.

**The pitch:** "A platform where every team member has a persistent AI agent that thinks like them, works when they don't, and collaborates with other agents to solve problems — turning a 20-person cohort into a 40-person organization."

## Core Concepts

- **Digital Twins:** Each agent is seeded from three real EMBA documents — IDP (goals), Ethics/Worldview paper (values), Insights personality profile (communication style)
- **Doctrine:** Hans's 11-component agentic framework runs under every agent (durable history, named identity, token trimming, handoffs, proactive intelligence, knowledge graph, confidence scoring, running estimates, AAR, battle tracking, event-driven architecture)
- **Persistent Agents:** Agents continue working asynchronously when the human is offline
- **Shared Workspaces:** Agents collaborate across a shared knowledge graph with confidence-scored contributions
- **Human-in-the-loop:** Approval queues for anything an agent wants to publish to shared workspace

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS + shadcn/ui |
| Auth | Supabase Auth (magic link + Google OAuth) |
| Database | Supabase Postgres (shared data) + SQLite per agent (private Doctrine) |
| Realtime | Supabase Realtime (subscriptions for live updates) |
| Backend API | FastAPI (Python) |
| AI Runtime | Claude API (Anthropic) via LangGraph |
| Deploy — Frontend | Vercel |
| Deploy — Backend | Railway |

## Repo Structure

```
rubicon/
├── apps/
│   └── web/                          # Next.js 14 frontend
│       ├── app/
│       │   ├── (auth)/
│       │   │   ├── login/page.tsx
│       │   │   └── onboarding/page.tsx
│       │   ├── dashboard/page.tsx
│       │   ├── chat/page.tsx
│       │   ├── workspaces/
│       │   │   ├── page.tsx           # list workspaces
│       │   │   └── [id]/page.tsx      # workspace detail (feed/board/graph tabs)
│       │   ├── approvals/page.tsx
│       │   ├── graph/page.tsx         # knowledge graph explorer
│       │   ├── profile/page.tsx       # agent profile + settings
│       │   └── layout.tsx
│       ├── components/
│       │   ├── agent-status.tsx
│       │   ├── approval-card.tsx
│       │   ├── chat-panel.tsx
│       │   ├── confidence-badge.tsx
│       │   ├── graph-viewer.tsx
│       │   ├── nav-sidebar.tsx
│       │   ├── workspace-card.tsx
│       │   └── document-upload.tsx
│       └── lib/
│           ├── supabase.ts            # client + server helpers
│           ├── api.ts                 # FastAPI client
│           └── realtime.ts            # subscription hooks
│
├── api/                               # FastAPI backend
│   ├── main.py                        # app factory, CORS, lifespan
│   ├── config.py                      # env vars, settings
│   ├── routes/
│   │   ├── agents.py                  # CRUD agent profiles, chat
│   │   ├── workspaces.py              # CRUD workspaces, membership
│   │   ├── approvals.py               # list, approve, reject
│   │   ├── graph.py                   # shared knowledge graph queries
│   │   ├── events.py                  # event bus endpoints
│   │   ├── milestones.py              # battle tracking
│   │   └── onboarding.py             # document upload + agent synthesis
│   ├── runtime/
│   │   ├── agent_manager.py           # spawn, stop, status per-user agents
│   │   ├── agent_worker.py            # LangGraph agent loop (Doctrine-powered)
│   │   └── inter_agent.py             # agent-to-agent messaging + event bus
│   ├── doctrine/                      # Doctrine components (per-agent)
│   │   ├── store.py                   # Knowledge Graph (SQLite-backed)
│   │   ├── confidence.py              # Confidence scoring
│   │   ├── estimates.py               # Running estimates
│   │   ├── aar.py                     # After Action Review / outcomes
│   │   ├── events.py                  # Event-driven architecture
│   │   ├── battle_tracker.py          # Milestone tracking
│   │   └── orchestrator.py            # Agent orchestrator (ReAct loop)
│   ├── parsers/
│   │   ├── idp_parser.py              # Extract goals, development areas from IDP
│   │   ├── ethics_parser.py           # Extract values, worldview from Ethics paper
│   │   └── insights_parser.py         # Extract personality type, strengths from Insights
│   └── models/
│       ├── agent.py                   # Pydantic models
│       ├── workspace.py
│       └── approval.py
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
│
├── RUBICON_SPEC.md                    # This file
├── CLAUDE.md                          # Build instructions for Claude Code
├── .env.example
└── README.md
```

## Postgres Schema (Supabase)

```sql
-- Users (extends Supabase auth.users)
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    display_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    avatar_url TEXT,
    cohort TEXT DEFAULT 'cohort-84',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent Profiles (one per user — the digital twin)
CREATE TABLE public.agent_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
    agent_name TEXT NOT NULL,              -- e.g. "Hans's Agent"
    expertise TEXT[] DEFAULT '{}',         -- extracted from IDP
    goals TEXT[] DEFAULT '{}',             -- extracted from IDP
    values TEXT[] DEFAULT '{}',            -- extracted from Ethics paper
    personality JSONB DEFAULT '{}',        -- extracted from Insights profile
    communication_style TEXT,              -- Insights color profile
    system_prompt TEXT,                    -- synthesized from all three docs
    autonomy_level INTEGER DEFAULT 2 CHECK (autonomy_level BETWEEN 1 AND 5),
    status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'thinking', 'working', 'waiting_approval')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Onboarding Documents (track what each user uploaded)
CREATE TABLE public.onboarding_docs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL CHECK (doc_type IN ('idp', 'ethics', 'insights')),
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,            -- Supabase Storage path
    parsed_data JSONB DEFAULT '{}',        -- extracted structured data
    uploaded_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, doc_type)
);

-- Workspaces (shared collaboration spaces)
CREATE TABLE public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES public.users(id),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Workspace Members
CREATE TABLE public.workspace_members (
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (workspace_id, user_id)
);

-- Shared Knowledge Graph — Entities
CREATE TABLE public.shared_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    author_agent_id UUID REFERENCES public.agent_profiles(id),
    name TEXT NOT NULL,
    entity_type TEXT NOT NULL,             -- person, company, concept, finding, recommendation
    properties JSONB DEFAULT '{}',
    confidence_score FLOAT DEFAULT 0.5 CHECK (confidence_score BETWEEN 0 AND 1),
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'disputed', 'archived')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Shared Knowledge Graph — Relationships
CREATE TABLE public.shared_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    source_entity_id UUID NOT NULL REFERENCES public.shared_entities(id) ON DELETE CASCADE,
    target_entity_id UUID NOT NULL REFERENCES public.shared_entities(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL,        -- SUPPORTS, CONTRADICTS, BUILDS_ON, RELATES_TO
    confidence_score FLOAT DEFAULT 0.5,
    metadata JSONB DEFAULT '{}',
    created_by_agent UUID REFERENCES public.agent_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Approval Queue
CREATE TABLE public.approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id),
    agent_id UUID NOT NULL REFERENCES public.agent_profiles(id),
    workspace_id UUID REFERENCES public.workspaces(id),
    action_type TEXT NOT NULL,             -- publish_entity, send_message, update_estimate, create_relationship
    payload JSONB NOT NULL,                -- what the agent wants to do
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    human_note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

-- Messages (chat — both human and agent)
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id),
    agent_id UUID REFERENCES public.agent_profiles(id),
    sender_type TEXT NOT NULL CHECK (sender_type IN ('human', 'agent')),
    content TEXT NOT NULL,
    confidence JSONB DEFAULT '{}',         -- {score: 0.85, reasoning: "..."}
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Agent Tasks (what agents are working on)
CREATE TABLE public.agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.agent_profiles(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES public.workspaces(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'working', 'needs_approval', 'done', 'failed')),
    result JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Milestones (battle tracking)
CREATE TABLE public.milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'complete', 'at_risk', 'missed')),
    assigned_agents UUID[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent Events (inter-agent event bus — persisted)
CREATE TABLE public.agent_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id),
    source_agent_id UUID REFERENCES public.agent_profiles(id),
    event_type TEXT NOT NULL,              -- finding_published, confidence_updated, task_completed, disagreement_flagged
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_messages_workspace ON public.messages(workspace_id, created_at DESC);
CREATE INDEX idx_approvals_user_pending ON public.approvals(user_id, status) WHERE status = 'pending';
CREATE INDEX idx_agent_tasks_agent ON public.agent_tasks(agent_id, status);
CREATE INDEX idx_shared_entities_workspace ON public.shared_entities(workspace_id, status);
CREATE INDEX idx_agent_events_workspace ON public.agent_events(workspace_id, created_at DESC);

-- RLS Policies (enable row-level security)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;
```

## UI Screens

### 1. Login / Auth
- Magic link or Google OAuth via Supabase Auth
- Clean, minimal — Rubicon logo + sign in

### 2. Onboarding (first-time flow)
- Step 1: Name + photo
- Step 2: Upload IDP (PDF) — system extracts goals, development areas, leadership style
- Step 3: Upload Ethics/Worldview paper (PDF/DOCX) — system extracts values, ethical framework, worldview
- Step 4: Upload Insights profile (PDF) — system extracts personality color, strengths, communication preferences
- Step 5: Review synthesized agent profile — user sees what their agent "learned" about them, can edit
- Step 6: Name your agent, set autonomy level (1-5 slider)

### 3. Dashboard
- Agent status card (what your agent is doing right now)
- Pending approvals count (badge)
- Workspace list with activity indicators
- Recent agent activity feed

### 4. Chat (1:1 with your agent)
- Standard chat interface
- Agent responses show confidence badges (high/medium/low)
- Agent can reference workspace context
- Quick actions: "Research this", "Draft a response", "Share to workspace"

### 5. Workspace Detail
- Three tabs: **Feed** (chronological activity), **Board** (kanban of agent tasks + milestones), **Graph** (knowledge graph for this workspace)
- Feed shows both human and agent contributions with confidence scores
- Color-coded by agent/author
- Agents can disagree — contradictions are visually highlighted

### 6. Approvals
- List of pending agent actions
- Each card shows: what the agent wants to do, why, confidence score
- Actions: Approve / Reject / Edit & Approve
- Preview of what will be published

### 7. Knowledge Graph Explorer
- Interactive node-link visualization (d3-force or similar)
- Filter by workspace, entity type, author agent, confidence threshold
- Nodes color-coded by authoring agent
- Click node to see properties, relationships, confidence history
- CONTRADICTS relationships highlighted in red

### 8. Agent Profile / Settings
- View/edit extracted profile (goals, values, personality)
- Autonomy slider (1 = ask before everything, 5 = act freely, publish drafts)
- Re-upload documents to update profile
- Agent activity log

## User Flows

### Flow 1: New Member Joins
Login → Onboarding (upload 3 docs) → Agent synthesized → Dashboard → Join workspace invitation

### Flow 2: Agent Collaboration
Agent A finds something → publishes to workspace (if autonomy allows, else → approval queue) → Agent B sees event → evaluates with own values/expertise → agrees (SUPPORTS) or disagrees (CONTRADICTS) with confidence score → humans review contradictions

### Flow 3: Human Reviews Agent Work
Notification badge → Approvals page → review agent's proposed action → approve/reject/edit → agent continues or adjusts

## Build Phases

### Phase 1: Foundation (START HERE)
- [ ] Initialize repo with Next.js 14 + Tailwind + shadcn
- [ ] Set up FastAPI skeleton with health check
- [ ] Create Supabase project + run initial migration
- [ ] Implement Supabase Auth (magic link + Google)
- [ ] Build login page + empty dashboard shell
- [ ] Deploy: Vercel (frontend) + Railway (API)

### Phase 2: Agent Runtime + Chat
- [ ] Agent profile CRUD (API + UI)
- [ ] LangGraph agent worker with Doctrine orchestrator
- [ ] 1:1 chat interface (human ↔ agent)
- [ ] Confidence scoring on agent responses
- [ ] Agent status tracking (idle/thinking/working)

### Phase 3: Document Onboarding
- [ ] Document upload UI (3-step flow)
- [ ] Supabase Storage for document files
- [ ] PDF/DOCX parsers (IDP, Ethics, Insights)
- [ ] Claude-powered synthesis: documents → agent profile
- [ ] Profile review + edit screen

### Phase 4: Approval System
- [ ] Approval queue (API + UI)
- [ ] Agent submits actions for approval
- [ ] Human approve/reject/edit flow
- [ ] Autonomy levels control what needs approval

### Phase 5: Workspaces + Shared Knowledge Graph
- [ ] Workspace CRUD + membership
- [ ] Shared entities + relationships (API)
- [ ] Workspace feed (messages + agent contributions)
- [ ] Confidence-scored entity publishing

### Phase 6: Inter-Agent Events
- [ ] Agent event bus (publish/subscribe)
- [ ] Agents react to other agents' publications
- [ ] SUPPORTS/CONTRADICTS relationship creation
- [ ] Disagreement detection + human notification

### Phase 7: Graph Explorer + Board View
- [ ] Interactive knowledge graph visualization
- [ ] Workspace board view (kanban)
- [ ] Milestone tracking
- [ ] Filter/search across graph

### Phase 8: Background Workers + Polish
- [ ] Async agent task processing
- [ ] Supabase Realtime subscriptions (live updates)
- [ ] Notification system
- [ ] Mobile-responsive design pass

## Hans's EMBA Documents (reference copies)

These are the three document types every cohort member uploads:

1. **IDP (Individual Development Plan)** — Written in Executive Leadership course. Contains career goals, leadership development areas, action plans.
   - Hans's copy: `/Users/hansprahl/Desktop/DU/Executive Leadership 1/Week 4/Hans Prahl IDP Executive Leadership.pdf`

2. **Ethics/Worldview Paper** — Written in Business Ethics course. Contains personal ethical framework, worldview, values hierarchy.
   - Hans's copy: `/Users/hansprahl/Desktop/DU/Business Ethics/Worldview Project Hans Prahl.pdf`

3. **Insights Discovery Profile** — Personality assessment. Contains color energies (Fiery Red, Sunshine Yellow, Earth Green, Cool Blue), communication preferences, strengths/weaknesses.
   - Hans's copy: `/Users/hansprahl/Documents/Hans Prahl - 25 Inspiring Motivator (Classic).pdf`

## Doctrine Integration

Every agent runs the full 11-component Doctrine:

1. **Durable History** — SQLite per agent for conversation persistence
2. **Named Identity** — Agent has a name, personality, expertise (from onboarding docs)
3. **Token Trimming** — Context window management per agent
4. **Handoffs** — Agents can request help from other agents via workspace
5. **Proactive Intelligence** — Agents monitor workspace for relevant changes
6. **Knowledge Graph** — Per-agent private + shared workspace graph
7. **Confidence Scoring** — Every agent output includes calibrated confidence
8. **Running Estimates** — Each agent maintains live domain assessments
9. **AAR (After Action Review)** — Track outcomes, calibrate confidence over time
10. **Battle Tracking** — Milestones, status tracking, progress monitoring
11. **Event-Driven Architecture** — Inter-agent event bus for real-time collaboration

## Design Principles

- **Biographical moat** — Agents are built from real human identity, not generic prompts
- **Human-in-the-loop** — Agents propose, humans approve (configurable via autonomy slider)
- **Calibrated disagreement** — Agents can disagree with confidence scores, not just agree
- **Transparency** — Every agent action is logged, every confidence score has reasoning
- **The agent works for the human** — Not the other way around
