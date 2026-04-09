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
- `apps/web/app/dashboard/page.tsx` — Dashboard shell
- `apps/web/components/nav-sidebar.tsx` — Navigation sidebar
- `apps/web/lib/supabase.ts` — Supabase client helpers (browser + server)
- `api/main.py` — FastAPI app with CORS + health check
- `api/config.py` — Environment config via pydantic-settings
- `supabase/migrations/001_initial_schema.sql` — Full Postgres schema

## Environment Variables
See `.env.example` for all required vars. The frontend needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Build Phases
See `RUBICON_SPEC.md` for the full 8-phase roadmap. Phase 1 (foundation) is complete.
