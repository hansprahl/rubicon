# Rubicon — Build & Run Instructions

## Project Overview
Collaborative digital twin platform for EMBA Cohort 84. Each member gets a persistent AI agent built from their IDP, Ethics paper, and Insights profile.

## Tech Stack
- **Frontend:** Next.js 14 (App Router) + Tailwind CSS + shadcn/ui — in `apps/web/`
- **Backend:** FastAPI (Python) — in `api/`
- **Database:** Supabase Postgres — migrations in `supabase/migrations/`
- **Auth:** Supabase Auth (magic link + Google OAuth)
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
Run `supabase/migrations/001_initial_schema.sql` against your Supabase project via the SQL Editor or CLI.

## Key Paths
- `apps/web/app/(auth)/login/page.tsx` — Login page (magic link + Google)
- `apps/web/app/(auth)/onboarding/page.tsx` — 6-step onboarding wizard
- `apps/web/app/dashboard/page.tsx` — Dashboard with agent status card + workspace cards
- `apps/web/app/chat/page.tsx` — 1:1 chat with your agent
- `apps/web/app/workspaces/page.tsx` — Workspace list with create flow
- `apps/web/app/workspaces/[id]/page.tsx` — Workspace detail (Feed/Board/Graph tabs)
- `apps/web/middleware.ts` — Auth middleware (redirects new users to onboarding)
- `apps/web/components/nav-sidebar.tsx` — Navigation sidebar
- `apps/web/components/confidence-badge.tsx` — Color-coded confidence indicator
- `apps/web/components/agent-status.tsx` — Agent status display (idle/thinking/working)
- `apps/web/components/document-upload.tsx` — Drag-and-drop file upload with progress
- `apps/web/components/workspace-card.tsx` — Workspace card with member count + role badge
- `apps/web/lib/supabase.ts` — Supabase client helpers (browser + server)
- `apps/web/lib/api.ts` — FastAPI client helpers (agents, onboarding, workspaces, graph)
- `api/main.py` — FastAPI app with CORS + health check
- `api/config.py` — Environment config via pydantic-settings
- `api/routes/agents.py` — Agent CRUD + chat endpoints
- `api/routes/workspaces.py` — Workspace CRUD, membership, invitations, feed
- `api/routes/graph.py` — Shared knowledge graph entity + relationship CRUD
- `api/routes/onboarding.py` — Document upload, parsing, and agent synthesis
- `api/parsers/idp_parser.py` — Extract goals/expertise from IDP via Claude
- `api/parsers/ethics_parser.py` — Extract values/worldview from Ethics paper via Claude
- `api/parsers/insights_parser.py` — Extract personality/strengths from Insights via Claude
- `api/runtime/agent_worker.py` — ReAct agent loop using Claude API
- `api/runtime/agent_manager.py` — Agent instance lifecycle management
- `api/doctrine/orchestrator.py` — Doctrine-powered agent orchestrator
- `api/doctrine/confidence.py` — Confidence scoring for agent outputs
- `api/doctrine/store.py` — Shared knowledge graph operations (entities, relationships, confidence)
- `api/doctrine/events.py` — Event bus with publish/subscribe pattern (persisted to agent_events)
- `api/runtime/inter_agent.py` — Agent-to-agent messaging, entity evaluation, disagreement detection
- `api/routes/events.py` — Event history, subscriptions, and disagreement API endpoints
- `api/models/agent.py` — Pydantic models for agents and chat
- `api/models/onboarding.py` — Pydantic models for onboarding and parsed docs
- `api/models/workspace.py` — Pydantic models for workspaces, feed, entities, relationships
- `api/models/event.py` — Pydantic models for events, subscriptions, disagreements
- `supabase/migrations/001_initial_schema.sql` — Full Postgres schema
- `supabase/migrations/003_event_subscriptions.sql` — Event subscriptions table + indexes

## Environment Variables
See `.env.example` for all required vars. The frontend needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Build Phases
See `RUBICON_SPEC.md` for the full 8-phase roadmap. Phases 1-6 are complete.
