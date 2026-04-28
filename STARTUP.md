# STARTUP — Rubicon

> Last updated: 2026-04-27. When this file disagrees with the code, the code wins.

## Identity

Collaborative digital twin platform for EMBA Cohort 84 (University of Denver). Each member gets a persistent AI agent built from their IDP, Ethics paper, and Insights profile. Twin-to-twin messaging, shared workspaces, war-room scenario sims, knowledge graph, mobile-responsive.

**Stage:** **PAUSED 2026-04-13 behind tag `rubicon-cohort-v1`.** Production-deployed at `rubicon-gamma.vercel.app`. 9 active cohort members. Full feature set live — chat, DMs, workspaces, war room, knowledge graph. Phase 3 security hardening shipped before the pause. Re-entry happens when cohort interest or a clear next-phase trigger surfaces.

## Commander's intent

The platform proved the agentic thesis on real users (the Jibe Turkey moment, 2026-04-09 — Hans's twin autonomously created a workspace, wrote a business case, and invited the cohort from natural conversation). The intent now is **preserved durability**, not active growth: keep what's running running, don't accrue tech debt during the pause, re-engage when the conditions justify it.

## Active phase — paused

There is no active build queue. Re-entry triggers (any of):
- A cohort member sends a build request worth a session
- The MBA program asks for new functionality (capstone deliverables, etc.)
- A capability shipped elsewhere (TOP, Operator) is worth backporting
- The 6-month re-evaluation point (around 2026-10)

## Architecture (load-bearing)

- **Frontend:** Next.js 14 (App Router) + Tailwind + shadcn/ui in `apps/web/`
- **Backend:** FastAPI (Python) in `api/`
- **Database:** Supabase Postgres — migrations in `supabase/migrations/`
- **Auth:** Supabase Auth (magic link + Google OAuth) with JWT-gated routes (Phase 1+2 hardening shipped)
- **Realtime:** Supabase `postgres_changes` subscriptions
- **AI:** Claude API via Anthropic SDK
- **Twin engine:** each member's agent is built from IDP + Ethics paper + Insights profile, persistent across sessions
- **Tools the twins can call:** workspace creation, member invite, DM send, knowledge-graph query
- **Sanitization:** `api/utils/sanitize.py:sanitize_untrusted_content()` is the canonical pattern (used as reference for Operator's deferred sanitize layer)

## Active risks

1. **Pause drift** — paused projects accumulate dependency rot. Next.js 14 is fine today; in 6 months, security advisories may force a forced re-engagement.
2. **Cohort timeline** — EMBA Cohort 84 graduates eventually; member retention isn't permanent. Engagement window has a natural close.
3. **Supabase pricing tier** — free-tier limits could hit if any cohort member triggers a heavy real-time path; monitor usage if reactivated.

## Recent significant changes (pre-pause)

- `e2eafe4` Security section added to CLAUDE.md (Phase 3 final)
- `1b4f6ac` SECURITY.md — threat model, data classification, incident response
- `72101df` Phase 3 — patch hono JSX HTML injection (GHSA-458j-xx4x-4375)
- `2746619` Phase 3 — war-room prompt-injection sanitizer
- `fb9d633` Phase 3 — gitleaks pre-commit hook
- `4067c04` Phase 2 — JWT-gate remaining routes (11 files)
- `95c2f35` Phase 1 — JWT-gate DM, approvals, onboarding routes
- `c22526c` AUDIT.md cleanup plan + ignore snapshots/

## Hands-off

- **Live cohort data** — 9 active members; no destructive operations on production Supabase without explicit Hans approval.
- **`.env` + Vercel secrets + Supabase service-role key** — hardened, gitleaks-gated. Don't unlock to inspect.
- **`tag rubicon-cohort-v1`** — the durability anchor. If you cut a new branch for re-engagement, branch from this tag, don't move it.
- **Sanitize layer (`api/utils/sanitize.py`)** — referenced by Operator. If you change the API here, flag for backport.

## Pointer index

**Doctrine:** `CLAUDE.md`, `SECURITY.md`, `AUDIT.md`
**Story:** `STORY.md` — read tail for the Jibe Turkey moment + final pre-pause chapter
**Memory files:**
- `project_rubicon.md` — high-level
- `user_jibe_turkey_moment.md` — the agentic-thesis proof moment (2026-04-09)
- `user_quote_fucking_awesome.md` — Hans's reaction the first time the agent ran a full operation autonomously

**Production:** `rubicon-gamma.vercel.app` (live but quiet during pause)
**Tag for re-entry:** `rubicon-cohort-v1`
