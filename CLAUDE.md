# Rubicon — Build & Run Instructions

## Project Overview
Collaborative digital twin platform for EMBA Cohort 84. Each member gets a persistent AI agent built from their IDP, Ethics paper, and Insights profile.

## Tech Stack
- **Frontend:** Next.js 14 (App Router) + Tailwind CSS + shadcn/ui — in `apps/web/`
- **Backend:** FastAPI (Python) — in `api/`
- **Database:** Supabase Postgres — migrations in `supabase/migrations/`
- **Auth:** Supabase Auth (magic link + Google OAuth)
- **Realtime:** Supabase Realtime (postgres_changes subscriptions)
- **AI:** Claude API via Anthropic SDK

## Quick Start

### Frontend
```bash
cd apps/web
cp ../../.env.example .env.local   # fill in Supabase keys
npm install
npm run dev                         # http://localhost:3000
```

### Backend API
```bash
cd api
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
```

Or from root: `npm run dev:api`

### Database
Run all migrations in order against your Supabase project via the SQL Editor or CLI:
1. `supabase/migrations/001_initial_schema.sql` — Core tables, indexes, RLS
2. `supabase/migrations/002_rls_policies.sql` — Row-level security policies
3. `supabase/migrations/003_event_subscriptions.sql` — Event subscriptions
4. `supabase/migrations/004_notifications_and_task_queue.sql` — Notifications + task queue columns

## Architecture

### Backend Architecture
- **API Layer:** FastAPI routes handle HTTP requests, Supabase service-role client for DB access
- **Doctrine Orchestrator:** Wraps agent worker with confidence scoring, approval queue, autonomy levels
- **Agent Worker:** ReAct loop using Claude Sonnet 4 API with per-agent system prompts
- **Task Queue:** Background polling loop (`api/runtime/task_queue.py`) claims queued tasks from `agent_tasks`, processes via Doctrine orchestrator, supports priority ordering and automatic retries
- **Event Bus:** In-memory pub/sub with persistent storage in `agent_events` table. Handlers for inter-agent evaluation, disagreement detection, feed posting
- **Notifications:** Server-side `_create_notification()` inserts into `notifications` table; triggered by approvals, task completion, disagreements, milestone changes

### Frontend Architecture
- **Realtime Hooks:** `apps/web/lib/realtime.ts` provides `useRealtime*` hooks wrapping Supabase channel subscriptions for live updates on messages, approvals, agent status, notifications, tasks, entities
- **Notification Bell:** `components/notification-bell.tsx` — dropdown with live unread count, mark-read, deep linking
- **Navigation:** Responsive sidebar with hamburger menu on mobile, approval badge, notification bell
- **Error Boundary:** `components/error-boundary.tsx` — catches render errors with reload button
- **Profile Page:** View/edit extracted profile, autonomy slider, re-upload docs, activity log

### Data Flow
1. User sends chat message → API saves to `messages`, runs Doctrine orchestrator, returns with confidence
2. Agent processes background task → Task queue claims from `agent_tasks`, runs ReAct loop, creates notification on completion
3. Agent publishes entity → Event bus notifies other agents → Each evaluates (SUPPORTS/CONTRADICTS) → Disagreements flagged for human review
4. Approval needed → Inserted into `approvals` + notification created → Supabase Realtime pushes to frontend

## Key Paths
- `apps/web/app/(auth)/login/page.tsx` — Login page (magic link + Google)
- `apps/web/app/(auth)/onboarding/page.tsx` — 6-step onboarding wizard
- `apps/web/app/dashboard/page.tsx` — Dashboard with agent status, approvals, workspaces, activity feed
- `apps/web/app/chat/page.tsx` — 1:1 chat with your agent (realtime messages + agent status)
- `apps/web/app/workspaces/page.tsx` — Workspace list with create flow
- `apps/web/app/workspaces/[id]/page.tsx` — Workspace detail (Feed/Board/Graph tabs, all with realtime)
- `apps/web/app/approvals/page.tsx` — Approval queue with realtime updates
- `apps/web/app/graph/page.tsx` — Knowledge graph explorer (d3-force visualization)
- `apps/web/app/profile/page.tsx` — Agent profile settings, re-upload docs, activity log
- `apps/web/middleware.ts` — Auth middleware (redirects unauthenticated → login, new users → onboarding)
- `apps/web/components/nav-sidebar.tsx` — Responsive navigation with mobile slide-out, notification bell
- `apps/web/components/notification-bell.tsx` — Notification dropdown with live count
- `apps/web/components/error-boundary.tsx` — React error boundary
- `apps/web/components/loading-spinner.tsx` — Reusable loading indicator
- `apps/web/components/empty-state.tsx` — Reusable empty state with icon, title, description
- `apps/web/components/confidence-badge.tsx` — Color-coded confidence indicator
- `apps/web/components/agent-status.tsx` — Agent status display (idle/thinking/working)
- `apps/web/components/document-upload.tsx` — Drag-and-drop file upload with progress
- `apps/web/components/workspace-card.tsx` — Workspace card with member count + role badge
- `apps/web/components/approval-card.tsx` — Approval action card
- `apps/web/lib/supabase.ts` — Supabase client helpers (browser + server)
- `apps/web/lib/api.ts` — FastAPI client (agents, chat, approvals, workspaces, graph, milestones, tasks, notifications)
- `apps/web/lib/realtime.ts` — Supabase Realtime subscription hooks
- `api/main.py` — FastAPI app with CORS, routers, lifespan (starts task queue worker)
- `api/config.py` — Environment config via pydantic-settings
- `api/routes/agents.py` — Agent CRUD + chat endpoints
- `api/routes/workspaces.py` — Workspace CRUD, membership, invitations, feed
- `api/routes/graph.py` — Shared knowledge graph entity + relationship CRUD
- `api/routes/milestones.py` — Milestone CRUD + agent task endpoints
- `api/routes/events.py` — Event history, subscriptions, and disagreement API endpoints
- `api/routes/notifications.py` — Notification list, unread count, mark read
- `api/routes/onboarding.py` — Document upload, parsing, and agent synthesis
- `api/runtime/task_queue.py` — Background task queue with priority, retries, notification triggers
- `api/runtime/agent_worker.py` — ReAct agent loop using Claude API
- `api/runtime/agent_manager.py` — Agent instance lifecycle management
- `api/runtime/inter_agent.py` — Agent-to-agent messaging, entity evaluation, disagreement detection
- `api/doctrine/orchestrator.py` — Doctrine-powered agent orchestrator with approval notifications
- `api/doctrine/confidence.py` — Confidence scoring for agent outputs
- `api/doctrine/store.py` — Shared knowledge graph operations (entities, relationships, confidence)
- `api/doctrine/events.py` — Event bus with publish/subscribe pattern (persisted to agent_events)
- `api/parsers/idp_parser.py` — Extract goals/expertise from IDP via Claude
- `api/parsers/ethics_parser.py` — Extract values/worldview from Ethics paper via Claude
- `api/parsers/insights_parser.py` — Extract personality/strengths from Insights via Claude
- `api/models/agent.py` — Pydantic models for agents and chat
- `api/models/onboarding.py` — Pydantic models for onboarding and parsed docs
- `api/models/workspace.py` — Pydantic models for workspaces, feed, entities, relationships
- `api/models/event.py` — Pydantic models for events, subscriptions, disagreements
- `api/models/milestone.py` — Pydantic models for milestones and agent tasks
- `supabase/migrations/001_initial_schema.sql` — Core tables + indexes + RLS enables
- `supabase/migrations/002_rls_policies.sql` — Row-level security policies
- `supabase/migrations/003_event_subscriptions.sql` — Event subscriptions table
- `supabase/migrations/004_notifications_and_task_queue.sql` — Notifications table + task queue columns

## Environment Variables
See `.env.example` for all required vars. The frontend needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Deployment

### Frontend (Vercel)
1. Connect repo to Vercel, set root directory to `apps/web`
2. Set environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`
3. Deploy — Vercel auto-detects Next.js

### Backend (Railway)
1. Create new Railway service from the repo
2. Set start command: `uvicorn api.main:app --host 0.0.0.0 --port $PORT`
3. Set environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`
4. The background task queue starts automatically with the app via the lifespan hook

### Database (Supabase)
1. Create a Supabase project
2. Run all 4 migration files in order via the SQL Editor
3. Enable Realtime on tables: `messages`, `approvals`, `agent_profiles`, `notifications`, `agent_tasks`, `shared_entities`
4. Create a Storage bucket named `documents` for onboarding file uploads

## Build Phases
See `RUBICON_SPEC.md` for the full 8-phase roadmap. All phases are complete.
