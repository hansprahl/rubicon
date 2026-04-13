# Rubicon Codebase Audit — April 12, 2026

**~9,300 lines | FastAPI + Next.js | EMBA cohort digital twin platform**

Start fixing from Tier 1 down. Read each file before editing. Commit after each tier.

---

## TIER 1: BUGS (fix first)

### 1. Sync Anthropic client blocks event loop
- **File:** `api/routes/agent_repository.py`
- **Issue:** `_synthesize_system_prompt()` (line ~96) and `build_agent` endpoint (line ~373) use synchronous `anthropic.Anthropic` inside async route handlers. All other Claude calls use `AsyncAnthropic`.
- **Fix:** Change to `AsyncAnthropic` with `await`.

### 2. Task queue semaphore doesn't work
- **File:** `api/runtime/task_queue.py` (line ~245)
- **Issue:** `asyncio.create_task()` inside `async with semaphore` returns immediately, releasing the semaphore before the task runs. `MAX_CONCURRENT_TASKS = 3` is never enforced.
- **Fix:** `await _execute_task(task)` inside the semaphore block, or wrap in a coroutine that holds the semaphore.

### 3. Auth bypass via query param
- **File:** `api/auth.py` (line ~21)
- **Issue:** `admin_id` query param fallback bypasses JWT auth. Anyone with a UUID can impersonate admin.
- **Fix:** Remove the fallback once frontend sends JWTs. At minimum, add a log warning.

---

## TIER 2: DESIGN ISSUES (fix or document)

### 4. `build_progressive_prompt()` bypassed at runtime
- **Files:** `api/runtime/agent_worker.py`, `api/runtime/agent_manager.py`, `api/runtime/prompt_builder.py`
- **Issue:** The rich prompt builder (North Star, anatomy, enrichment, Insights personality) is only applied when re-uploading docs. At chat time, `AgentManager.get_or_create()` uses the simpler `build_system_prompt()` from `agent_worker.py`. Users get a worse prompt.
- **Fix:** Have `AgentManager.get_or_create()` call `build_progressive_prompt()` instead of `build_system_prompt()`.

### 5. Two divergent prompt synthesis paths
- **File:** `api/routes/onboarding.py`
- **Issue:** `_synthesize_system_prompt()` (raw Claude call, ~75 lines) vs `build_progressive_prompt()` (structured builder). Full onboarding wizard uses the former; doc re-upload uses the latter. Inconsistent quality.
- **Fix:** Deprecate `_synthesize_system_prompt()` in favor of `build_progressive_prompt()`.

### 6. AgentManager memory leak
- **File:** `api/runtime/agent_manager.py`
- **Issue:** In-memory `AgentContext` with full conversation history, no TTL, no eviction, no size cap. Long-lived deployments accumulate unbounded memory.
- **Fix:** Add TTL or max history length. Or evict on LRU basis.

---

## TIER 3: DEAD CODE (delete)

| # | What | File |
|---|---|---|
| 7 | 4 of 7 functions never called: `publish_entity`, `query_relationships`, `get_entity_with_relationships`, `update_entity_confidence` | `api/doctrine/store.py` |
| 8 | `stop()`, `is_active()`, `active_count()`, `get()` — zero callers | `api/runtime/agent_manager.py` |
| 9 | `notify_disagreement()`, `notify_milestone_change()` — zero callers | `api/runtime/task_queue.py` |
| 10 | `POST /agents/` (`create_agent`) — dead endpoint | `api/routes/agents.py` |
| 11 | `EventQuery` model — never imported | `api/models/event.py` |
| 12 | `database_url` field — never referenced | `api/config.py` |
| 13 | Unused imports: `Conversation` in agents.py, `IDPParsed`/`EthicsParsed`/`InsightsParsed` in onboarding.py, `query_entities` in inter_agent.py | Various |
| 14 | `idp_data` variable assigned but never used | `api/runtime/anatomy.py:182` |
| 15 | `task_completed` event subscribed but never published | `api/runtime/inter_agent.py` |
| 16 | `EventBus.unsubscribe()` — never called | `api/doctrine/events.py` |

---

## TIER 4: UNUSED ENDPOINTS (no frontend callers — delete or document as admin-only)

| # | Endpoint | File |
|---|---|---|
| 17 | All 8 endpoints in `events.py` (event bus works internally, HTTP surface unwired) | `api/routes/events.py` |
| 18 | `GET /tools/agent/{agent_id}/stats` | `api/routes/tool_repository.py` |
| 19 | `POST /intelligence/check` (full cohort, no user_id) | `api/routes/intelligence.py` |
| 20 | `DELETE /milestones/tasks/{task_id}` | `api/routes/milestones.py` |
| 21 | `GET /agent-repo/categories` | `api/routes/agent_repository.py` |

---

## TIER 5: DUPLICATE CODE (consolidate)

| # | Pattern | Scope |
|---|---|---|
| 22 | `_sb()` / `_supabase()` — identical Supabase client creation | **27 copies** across all files. Extract to `api/db.py`. |
| 23 | JSON fence-stripping + `json.loads` in all 3 parsers | `api/parsers/*.py` — extract to shared helper |
| 24 | Top-tools-by-count query duplicated | `api/runtime/rubicon_intelligence.py` (digest + trends) |
| 25 | `seven_days_ago` computed 4x in same function | `api/runtime/rubicon_intelligence.py` |
| 26 | Autonomy level fetched independently by 3 tool handlers | `api/runtime/tool_executor.py` |
| 27 | New `AsyncAnthropic` client created on every `run_react_loop()` call | `api/runtime/agent_worker.py` — reuse a module-level client |

---

## MINOR

- `InsightsParsed.weaknesses` — extracted by parser, stored in DB, never read back anywhere.
- `_rebuild_agent_prompt` imported circularly between onboarding.py and north_star.py — move to a shared service module.
- `api/healthcheck.py` hardcodes port 8001 but dev default is 8000.
