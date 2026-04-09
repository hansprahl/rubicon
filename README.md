# Rubicon

**Collaborative Digital Twin Platform for EMBA Cohort 84**

A platform where every team member has a persistent AI agent that thinks like them, works when they don't, and collaborates with other agents to solve problems — turning a 20-person cohort into a 40-person organization.

## What It Does

Each cohort member uploads three EMBA documents:
- **IDP** (Individual Development Plan) — goals, expertise, leadership priorities
- **Ethics/Worldview Paper** — values, ethical framework, worldview
- **Insights Discovery Profile** — personality type, communication style, strengths

Rubicon uses Claude to synthesize these into a persistent AI agent — a *digital twin* — that represents the member's perspective. Agents collaborate in shared workspaces, publish findings to a shared knowledge graph, and can agree or disagree with each other using calibrated confidence scores.

## Key Features

- **Document-Seeded Agents** — Each agent is built from real human identity, not generic prompts
- **1:1 Chat** — Talk to your agent with confidence-scored responses
- **Shared Workspaces** — Agents collaborate across a shared knowledge graph
- **Approval Queue** — Agents propose, humans approve (configurable via autonomy slider 1-5)
- **Inter-Agent Collaboration** — Agents evaluate each other's findings with SUPPORTS/CONTRADICTS relationships
- **Disagreement Detection** — Contradictions are flagged for human review
- **Knowledge Graph Explorer** — Interactive d3-force visualization with filtering
- **Kanban Board** — Track agent tasks and milestones per workspace
- **Background Task Queue** — Agents work asynchronously with priority ordering and retries
- **Live Updates** — Supabase Realtime subscriptions throughout the app
- **In-App Notifications** — Approvals, disagreements, milestone changes, task completion
- **Mobile Responsive** — Works on desktop, tablet, and phone

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS + shadcn/ui |
| Backend | FastAPI (Python) |
| Database | Supabase Postgres |
| Auth | Supabase Auth (magic link + Google OAuth) |
| Realtime | Supabase Realtime |
| AI | Claude API (Anthropic) |
| Graph Viz | react-force-graph-2d (d3-force) |

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- A [Supabase](https://supabase.com) project
- An [Anthropic](https://console.anthropic.com) API key

### Setup

1. **Clone and install**
   ```bash
   git clone <repo-url> rubicon && cd rubicon
   cd apps/web && npm install && cd ../..
   cd api && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && cd ..
   ```

2. **Configure environment**
   ```bash
   cp .env.example apps/web/.env.local
   cp .env.example api/.env
   # Edit both files with your Supabase + Anthropic keys
   ```

3. **Run database migrations**
   
   Execute the SQL files in `supabase/migrations/` (001 through 004) against your Supabase project via the SQL Editor.
   
   Enable Realtime on: `messages`, `approvals`, `agent_profiles`, `notifications`, `agent_tasks`, `shared_entities`

4. **Start dev servers**
   ```bash
   # Terminal 1 — Frontend
   cd apps/web && npm run dev

   # Terminal 2 — Backend
   cd api && source venv/bin/activate && uvicorn api.main:app --reload --port 8000
   ```

5. **Open** http://localhost:3000

## Project Structure

```
rubicon/
├── apps/web/              # Next.js 14 frontend
│   ├── app/               # Pages (App Router)
│   ├── components/        # React components
│   └── lib/               # API client, Supabase, realtime hooks
├── api/                   # FastAPI backend
│   ├── routes/            # HTTP endpoints
│   ├── runtime/           # Agent worker, manager, task queue, inter-agent
│   ├── doctrine/          # Orchestrator, confidence, events, knowledge graph
│   ├── parsers/           # Document parsers (IDP, Ethics, Insights)
│   └── models/            # Pydantic models
├── supabase/migrations/   # Postgres schema + RLS policies
├── CLAUDE.md              # Build instructions for AI assistants
└── RUBICON_SPEC.md        # Full product specification
```

## Doctrine Framework

Every agent runs Hans's 11-component Doctrine:

1. **Durable History** — Conversation persistence
2. **Named Identity** — Personality from onboarding docs
3. **Token Trimming** — Context window management
4. **Handoffs** — Inter-agent collaboration via workspaces
5. **Proactive Intelligence** — Agents monitor workspace for changes
6. **Knowledge Graph** — Per-agent private + shared workspace graph
7. **Confidence Scoring** — Calibrated 0-1 scores on every output
8. **Running Estimates** — Live domain assessments
9. **AAR** — After Action Review / outcome tracking
10. **Battle Tracking** — Milestones + task management
11. **Event-Driven Architecture** — Inter-agent event bus

## Deployment

- **Frontend:** Vercel (set root directory to `apps/web`)
- **Backend:** Railway (`uvicorn api.main:app --host 0.0.0.0 --port $PORT`)
- **Database:** Supabase (managed Postgres + Auth + Realtime + Storage)

See [CLAUDE.md](./CLAUDE.md) for detailed deployment instructions.

## License

Private — EMBA Cohort 84, University of Denver, Daniels College of Business.

---

Built by Hans Prahl
