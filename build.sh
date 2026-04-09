#!/bin/bash
# ============================================================
# Rubicon Automated Build Script
# Launches a fresh Claude Code session per phase to minimize
# token costs. Each phase starts clean, builds, commits, exits.
#
# Usage:
#   ./build.sh              # Build all phases sequentially
#   ./build.sh 3            # Start from Phase 3
#   ./build.sh 2 4          # Build Phases 2 through 4
# ============================================================

set -euo pipefail

RUBICON_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$RUBICON_DIR/.build-logs"
SPEC="$RUBICON_DIR/RUBICON_SPEC.md"

mkdir -p "$LOG_DIR"

START_PHASE=${1:-1}
END_PHASE=${2:-8}

timestamp() { date "+%Y-%m-%d %H:%M:%S"; }

build_phase() {
    local phase=$1
    local prompt=$2
    local log_file="$LOG_DIR/phase-${phase}-$(date +%Y%m%d-%H%M%S).log"

    echo ""
    echo "╔══════════════════════════════════════════════════╗"
    echo "║  RUBICON BUILD — Phase $phase of 8                    ║"
    echo "║  $(timestamp)                        ║"
    echo "╚══════════════════════════════════════════════════╝"
    echo ""
    echo "  Log: $log_file"
    echo ""

    cd "$RUBICON_DIR"

    # Run Claude Code in non-interactive print mode
    # --dangerously-skip-permissions: allows file writes, bash, etc. without prompts
    # Each session is fresh — no accumulated context from prior phases
    claude -p "$prompt" \
        --dangerously-skip-permissions \
        2>&1 | tee "$log_file"

    local exit_code=${PIPESTATUS[0]}

    if [ $exit_code -eq 0 ]; then
        echo ""
        echo "  ✓ Phase $phase complete ($(timestamp))"
        echo ""
    else
        echo ""
        echo "  ✗ Phase $phase failed with exit code $exit_code"
        echo "  Check log: $log_file"
        echo ""
        echo "  To resume from this phase: ./build.sh $phase"
        exit $exit_code
    fi
}

# ============================================================
# Phase Prompts
# Each prompt is self-contained — the new session reads the
# spec file and builds only its assigned phase.
# ============================================================

PHASE_1='Read RUBICON_SPEC.md for full context. You are building Phase 1 of Rubicon — a collaborative digital twin platform.

BUILD PHASE 1 — Foundation:
1. Initialize git repo
2. Create Next.js 14 app in apps/web/ with Tailwind CSS and shadcn/ui
3. Create FastAPI skeleton in api/ with health check endpoint, CORS config, and config.py for env vars
4. Write the full Postgres migration SQL to supabase/migrations/001_initial_schema.sql (copy the schema from the spec exactly)
5. Build a login page at apps/web/app/(auth)/login/page.tsx using Supabase Auth (magic link + Google OAuth)
6. Build an empty dashboard shell at apps/web/app/dashboard/page.tsx with a nav sidebar
7. Set up Supabase client helpers in apps/web/lib/supabase.ts (browser + server)
8. Create .env.example with all required env vars
9. Create a root package.json with workspace scripts
10. Write a CLAUDE.md with build/run instructions for future sessions

Tech: Next.js 14 App Router, Tailwind, shadcn/ui, Supabase JS client, FastAPI with uvicorn.

When done, commit all files with message: "Phase 1: Foundation — repo, schema, auth, dashboard shell"'

PHASE_2='Read RUBICON_SPEC.md and CLAUDE.md for context. Previous phases have already been built and committed.

BUILD PHASE 2 — Agent Runtime + Chat:
1. Build agent profile CRUD API routes in api/routes/agents.py (create, read, update agent profiles)
2. Build the LangGraph agent worker in api/runtime/agent_worker.py — a ReAct loop using Claude API that represents a single user agent
3. Build api/runtime/agent_manager.py — manages spawning/stopping agent instances per user
4. Build the Doctrine orchestrator in api/doctrine/orchestrator.py — wraps agent_worker with Doctrine components
5. Build confidence scoring in api/doctrine/confidence.py — parse and attach confidence scores to agent outputs
6. Build a chat API route in api/routes/agents.py — POST /agents/{id}/chat endpoint
7. Build the chat UI at apps/web/app/chat/page.tsx — message list with input, shows agent responses with confidence badges
8. Build apps/web/components/confidence-badge.tsx — color-coded confidence indicator (red/yellow/green)
9. Build apps/web/components/agent-status.tsx — shows agent current status (idle/thinking/working)
10. Update dashboard to show agent status card

When done, commit with message: "Phase 2: Agent runtime, chat interface, confidence scoring"'

PHASE_3='Read RUBICON_SPEC.md and CLAUDE.md for context. Previous phases have already been built and committed.

BUILD PHASE 3 — Document-Based Onboarding:
1. Build the onboarding flow at apps/web/app/(auth)/onboarding/page.tsx — multi-step wizard:
   - Step 1: Display name + avatar
   - Step 2: Upload IDP (PDF) — Individual Development Plan
   - Step 3: Upload Ethics/Worldview paper (PDF/DOCX)
   - Step 4: Upload Insights personality profile (PDF)
   - Step 5: Review synthesized agent profile — show extracted goals, values, personality
   - Step 6: Name your agent + set autonomy level (1-5 slider)
2. Build apps/web/components/document-upload.tsx — drag-and-drop file upload component with progress indicator
3. Build API route api/routes/onboarding.py — handles file upload to Supabase Storage + triggers parsing
4. Build api/parsers/idp_parser.py — sends PDF to Claude API, extracts goals, development areas, leadership priorities
5. Build api/parsers/ethics_parser.py — sends PDF/DOCX to Claude API, extracts values, ethical framework, worldview
6. Build api/parsers/insights_parser.py — sends PDF to Claude API, extracts personality colors, strengths, communication style
7. Build the synthesis step — combines all three parser outputs into a system_prompt and structured agent_profile
8. Store parsed data in onboarding_docs table, synthesized profile in agent_profiles table
9. Add auth middleware to redirect new users (no agent_profile) to onboarding

When done, commit with message: "Phase 3: Document-based onboarding — IDP, Ethics, Insights parsing"'

PHASE_4='Read RUBICON_SPEC.md and CLAUDE.md for context. Previous phases have already been built and committed.

BUILD PHASE 4 — Approval System:
1. Build API routes in api/routes/approvals.py — list pending, approve, reject, get detail
2. Build the approvals page at apps/web/app/approvals/page.tsx — list of pending agent actions with count badge
3. Build apps/web/components/approval-card.tsx — shows action type, agent reasoning, confidence score, payload preview
4. Add approve/reject/edit-and-approve actions to each card
5. Wire agent_worker to submit actions to approval queue when autonomy_level requires it
6. Add approval count badge to nav sidebar
7. Add real-time updates — new approvals appear without page refresh (Supabase Realtime subscription)

When done, commit with message: "Phase 4: Approval queue — agent actions require human sign-off"'

PHASE_5='Read RUBICON_SPEC.md and CLAUDE.md for context. Previous phases have already been built and committed.

BUILD PHASE 5 — Workspaces + Shared Knowledge Graph:
1. Build workspace CRUD API in api/routes/workspaces.py — create, list, join, leave, get detail
2. Build workspace list page at apps/web/app/workspaces/page.tsx
3. Build workspace detail page at apps/web/app/workspaces/[id]/page.tsx with three tabs: Feed, Board, Graph
4. Build the Feed tab — chronological messages from humans and agents with confidence scores, color-coded by author
5. Build shared entity CRUD in api/routes/graph.py — create, query, update entities and relationships
6. Build api/doctrine/store.py — shared knowledge graph operations (entities, relationships, confidence)
7. Build confidence-scored entity publishing — agents can publish findings to workspace with confidence
8. Add workspace cards to dashboard
9. Implement workspace membership and invitations

When done, commit with message: "Phase 5: Workspaces, shared knowledge graph, workspace feed"'

PHASE_6='Read RUBICON_SPEC.md and CLAUDE.md for context. Previous phases have already been built and committed.

BUILD PHASE 6 — Inter-Agent Events:
1. Build api/doctrine/events.py — event bus with publish/subscribe pattern, persisted to agent_events table
2. Build api/runtime/inter_agent.py — agent-to-agent messaging via the event bus
3. Wire agents to react to other agents publications — when Agent A publishes an entity, Agent B evaluates it
4. Implement SUPPORTS and CONTRADICTS relationship creation — agents assess other agents findings
5. Build disagreement detection — when two agents contradict, flag for human review
6. Add event stream to workspace feed — show inter-agent activity
7. Build api/routes/events.py — API endpoints for event history and subscriptions

When done, commit with message: "Phase 6: Inter-agent event bus, agent collaboration, disagreement detection"'

PHASE_7='Read RUBICON_SPEC.md and CLAUDE.md for context. Previous phases have already been built and committed.

BUILD PHASE 7 — Graph Explorer + Board View:
1. Build the knowledge graph explorer at apps/web/app/graph/page.tsx — interactive node-link visualization
2. Use d3-force (or react-force-graph) for the graph layout
3. Nodes color-coded by authoring agent, sized by confidence score
4. CONTRADICTS edges highlighted in red, SUPPORTS in green
5. Click a node to see properties, relationships, confidence history
6. Filter controls: by workspace, entity type, author agent, confidence threshold
7. Build the Board tab in workspace detail — kanban columns (queued/working/needs_approval/done)
8. Build milestone tracking UI — milestones with status, due dates, assigned agents
9. Build api/routes/milestones.py — CRUD for milestones

When done, commit with message: "Phase 7: Knowledge graph explorer, kanban board, milestone tracking"'

PHASE_8='Read RUBICON_SPEC.md and CLAUDE.md for context. Previous phases have already been built and committed.

BUILD PHASE 8 — Background Workers + Polish:
1. Set up async agent task processing — agents work on tasks in the background via a task queue
2. Wire Supabase Realtime subscriptions throughout the app — live updates for messages, approvals, agent status, workspace feed
3. Build a notification system — in-app notifications for approvals, disagreements, milestone changes
4. Build the agent profile/settings page at apps/web/app/profile/page.tsx — view/edit extracted profile, autonomy slider, re-upload docs, activity log
5. Mobile-responsive design pass — ensure all pages work on tablet/phone
6. Add loading states, error boundaries, and empty states throughout
7. Update CLAUDE.md with final architecture notes and deployment instructions
8. Create a proper README.md for the repo

When done, commit with message: "Phase 8: Background workers, realtime, notifications, polish"'

# ============================================================
# Run phases
# ============================================================

PROMPTS=("" "$PHASE_1" "$PHASE_2" "$PHASE_3" "$PHASE_4" "$PHASE_5" "$PHASE_6" "$PHASE_7" "$PHASE_8")

echo ""
echo "  RUBICON AUTOMATED BUILD"
echo "  Phases $START_PHASE through $END_PHASE"
echo "  Each phase runs in a fresh Claude Code session"
echo "  Logs: $LOG_DIR/"
echo ""

for ((i=START_PHASE; i<=END_PHASE; i++)); do
    build_phase "$i" "${PROMPTS[$i]}"

    # After Phase 1: notify Hans via Telegram and wait for Supabase setup
    if [ "$i" -eq 1 ] && [ "$END_PHASE" -gt 1 ]; then
        echo ""
        echo "  ⏸  Phase 1 complete. Notifying you via Telegram..."
        echo ""

        # Send Telegram reminder via TOP's MCP
        claude -p "Use the mcp__local-mcp__send_telegram tool to send Hans this message. Title: 'Rubicon — Action Required'. Message: 'Phase 1 is done. Before I continue building, you need to: 1) Create a Supabase project at supabase.com  2) Copy .env.example to .env in /Projects/rubicon/  3) Fill in SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY  4) Run: supabase db push  Then come back and press Enter to continue the build.'" \
            --dangerously-skip-permissions \
            > "$LOG_DIR/telegram-notify.log" 2>&1

        echo "  Telegram sent. Set up Supabase, then press Enter to continue."
        echo ""
        read -p "  Press Enter when Supabase is ready → "
    fi
done

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  RUBICON BUILD COMPLETE                          ║"
echo "║  All phases $START_PHASE–$END_PHASE finished                          ║"
echo "║  $(timestamp)                        ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Next steps:"
echo "  1. cd apps/web && npm run dev"
echo "  2. cd api && uvicorn main:app --reload"
echo "  3. Open http://localhost:3000"
echo ""
