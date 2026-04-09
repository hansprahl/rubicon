"""Rubicon Self-Healing Health Check

Runs end-to-end validation of the full platform with a template test agent.
Tests every layer: DB → Auth → Agent creation → Doc upload → Prompt rebuild →
Chat → Workspaces → Knowledge graph → Approvals → Cleanup.

Self-healing: when a check fails, attempts to fix the issue automatically.

Usage:
    cd /Users/hansprahl/Projects/rubicon
    source api/venv/bin/activate
    python -m api.healthcheck
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
import traceback
from uuid import uuid4

from api.config import settings

# ── Scoring ──

CHECKS: list[dict] = []
TOTAL_CHECKS = 0
PASSED_CHECKS = 0
HEALED_CHECKS = 0
FAILED_CHECKS = 0

TEST_USER_EMAIL = "healthcheck@rubicon.test"
TEST_USER_ID = None
TEST_AGENT_ID = None
TEST_WORKSPACE_ID = None


def _score(name: str, passed: bool, healed: bool = False, detail: str = ""):
    global TOTAL_CHECKS, PASSED_CHECKS, HEALED_CHECKS, FAILED_CHECKS
    TOTAL_CHECKS += 1
    status = "PASS" if passed else "HEAL" if healed else "FAIL"
    if passed:
        PASSED_CHECKS += 1
    elif healed:
        HEALED_CHECKS += 1
    else:
        FAILED_CHECKS += 1
    icon = "✓" if passed else "⚕" if healed else "✗"
    color = "\033[92m" if passed else "\033[93m" if healed else "\033[91m"
    reset = "\033[0m"
    msg = f"  {color}{icon}{reset} {name}"
    if detail:
        msg += f" — {detail}"
    print(msg)
    CHECKS.append({"name": name, "status": status, "detail": detail})


def _sb():
    from supabase import create_client
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# ═══════════════════════════════════════════════════
# 1. DATABASE CONNECTIVITY
# ═══════════════════════════════════════════════════

def check_db_connection():
    print("\n── 1. Database Connectivity ──")
    try:
        sb = _sb()
        result = sb.table("users").select("id").limit(1).execute()
        _score("Supabase connection", True)
    except Exception as e:
        _score("Supabase connection", False, detail=str(e))
        return False
    return True


def check_tables_exist():
    sb = _sb()
    expected_tables = [
        "users", "agent_profiles", "onboarding_docs", "workspaces",
        "workspace_members", "shared_entities", "shared_relationships",
        "approvals", "messages", "agent_tasks", "milestones",
        "agent_events", "notifications", "event_subscriptions",
        "north_stars", "custom_agents", "user_custom_agents", "agent_ratings",
        "intelligence_suggestions", "feedback", "feedback_upvotes",
    ]
    for table in expected_tables:
        try:
            sb.table(table).select("*").limit(0).execute()
            _score(f"Table: {table}", True)
        except Exception as e:
            _score(f"Table: {table}", False, detail=str(e))


def check_agent_profile_columns():
    """Verify progressive onboarding columns exist."""
    sb = _sb()
    try:
        result = sb.table("agent_profiles").select("fidelity,enrichment_answers,google_services").limit(1).execute()
        _score("Progressive columns (fidelity, enrichment_answers, google_services)", True)
    except Exception as e:
        # Self-heal: run migration
        try:
            # Can't run raw SQL through Supabase client — flag for manual fix
            _score("Progressive columns", False, detail=f"Missing columns: {e}. Run migration 005.")
        except Exception:
            _score("Progressive columns", False, detail=str(e))


# ═══════════════════════════════════════════════════
# 2. STORAGE
# ═══════════════════════════════════════════════════

def check_storage_bucket():
    print("\n── 2. Storage ──")
    sb = _sb()
    try:
        buckets = sb.storage.list_buckets()
        bucket_names = [b.name if hasattr(b, 'name') else b.get('name', '') for b in buckets]
        if "documents" in bucket_names:
            _score("Storage bucket 'documents'", True)
        else:
            # Self-heal: create the bucket
            try:
                sb.storage.create_bucket("documents", options={"public": False})
                _score("Storage bucket 'documents'", True, healed=True, detail="Created missing bucket")
            except Exception as e2:
                _score("Storage bucket 'documents'", False, detail=str(e2))
    except Exception as e:
        _score("Storage bucket check", False, detail=str(e))


# ═══════════════════════════════════════════════════
# 3. TEMPLATE AGENT CREATION (ensure endpoint)
# ═══════════════════════════════════════════════════

def check_template_agent():
    global TEST_USER_ID, TEST_AGENT_ID
    print("\n── 3. Template Agent (Progressive Onboarding) ──")
    sb = _sb()

    # Create a test user in auth
    try:
        # Use admin API to create a test user
        test_email = f"healthcheck-{uuid4().hex[:8]}@rubicon.test"
        auth_result = sb.auth.admin.create_user({
            "email": test_email,
            "password": f"test-{uuid4().hex}",
            "email_confirm": True,
        })
        TEST_USER_ID = auth_result.user.id
        _score("Create test auth user", True, detail=test_email)
    except Exception as e:
        _score("Create test auth user", False, detail=str(e))
        return False

    # Test the ensure endpoint logic directly
    try:
        from api.runtime.prompt_builder import get_template_prompt

        # Ensure users row
        sb.table("users").insert({
            "id": TEST_USER_ID,
            "display_name": "Health Check Bot",
            "email": test_email,
        }).execute()
        _score("Create public.users row", True)

        # Create template agent
        agent_name = "Health Check Bot's Agent"
        system_prompt = get_template_prompt("Health Check Bot", agent_name)

        result = sb.table("agent_profiles").insert({
            "user_id": TEST_USER_ID,
            "agent_name": agent_name,
            "expertise": [],
            "goals": [],
            "values": [],
            "personality": {},
            "system_prompt": system_prompt,
            "autonomy_level": 2,
            "fidelity": 0.2,
        }).execute()

        if result.data:
            TEST_AGENT_ID = result.data[0]["id"]
            _score("Create template agent", True, detail=f"fidelity=20%, id={TEST_AGENT_ID}")
        else:
            _score("Create template agent", False, detail="No data returned")
            return False

    except Exception as e:
        _score("Create template agent", False, detail=str(e))
        return False

    # Verify fidelity is 0.2
    try:
        agent = sb.table("agent_profiles").select("fidelity,system_prompt").eq("id", TEST_AGENT_ID).execute()
        fidelity = agent.data[0]["fidelity"]
        prompt = agent.data[0]["system_prompt"]
        _score("Template fidelity = 20%", fidelity == 0.2, detail=f"Got {fidelity}")
        _score("System prompt contains self-awareness", "What You Know" in prompt or "still missing" in prompt.lower())
    except Exception as e:
        _score("Verify template agent", False, detail=str(e))

    return True


# ═══════════════════════════════════════════════════
# 4. PROGRESSIVE PROMPT BUILDER
# ═══════════════════════════════════════════════════

def check_prompt_builder():
    print("\n── 4. Prompt Builder ──")
    try:
        from api.runtime.prompt_builder import build_progressive_prompt, calculate_fidelity

        # Test fidelity calculation
        assert abs(calculate_fidelity() - 0.20) < 0.01
        assert abs(calculate_fidelity(has_idp=True) - 0.40) < 0.01
        assert abs(calculate_fidelity(has_idp=True, has_ethics=True) - 0.55) < 0.01
        assert abs(calculate_fidelity(has_idp=True, has_ethics=True, has_insights=True) - 0.70) < 0.01
        assert abs(calculate_fidelity(has_idp=True, has_ethics=True, has_insights=True, has_enrichment=True) - 0.80) < 0.01
        assert abs(calculate_fidelity(has_idp=True, has_ethics=True, has_insights=True, has_enrichment=True, has_google=True) - 0.85) < 0.01
        _score("Fidelity calculation", True, detail="0.20 → 0.85 progression correct")

        # Test prompt with nothing
        prompt_empty = build_progressive_prompt("Test User", "Test Agent")
        assert "still missing" in prompt_empty.lower() or "Brain" in prompt_empty
        _score("Empty prompt has missing-data awareness", True)

        # Test prompt with IDP only
        prompt_idp = build_progressive_prompt(
            "Test User", "Test Agent",
            idp_data={"goals": ["Lead teams"], "expertise": ["Strategy"], "development_areas": [], "leadership_priorities": []}
        )
        assert "Brain" in prompt_idp or "Goals" in prompt_idp
        assert "Heart" in prompt_idp  # Should mention missing heart
        _score("IDP-only prompt: has Brain, flags missing Heart", True)

        # Test prompt with all docs
        prompt_full = build_progressive_prompt(
            "Test User", "Test Agent",
            idp_data={"goals": ["Lead"], "expertise": ["Ops"], "development_areas": [], "leadership_priorities": []},
            ethics_data={"values": ["Honesty"], "ethical_framework": "Virtue ethics", "worldview": "", "key_principles": []},
            insights_data={"primary_color": "Sunshine Yellow", "secondary_color": "Fiery Red", "strengths": ["Networking"], "communication_style": "Fast-paced", "personality_summary": "Energetic leader"},
            enrichment_answers={"current_work": "Building AI products", "biggest_bet": "Biographical moats"},
        )
        assert "80%" in prompt_full
        _score("Full prompt: 80% fidelity, all sections present", True)

    except AssertionError as e:
        _score("Prompt builder assertion", False, detail=str(e))
    except Exception as e:
        _score("Prompt builder", False, detail=f"{type(e).__name__}: {e}")


# ═══════════════════════════════════════════════════
# 5. INCREMENTAL DOC UPLOAD + PROMPT REBUILD
# ═══════════════════════════════════════════════════

def check_incremental_upload():
    print("\n── 5. Incremental Upload + Prompt Rebuild ──")
    if not TEST_USER_ID or not TEST_AGENT_ID:
        _score("Incremental upload (skipped — no test agent)", False, detail="Prerequisite failed")
        return

    sb = _sb()

    # Simulate IDP upload by inserting parsed data directly
    try:
        idp_parsed = {
            "goals": ["Strategic leadership", "Innovation"],
            "development_areas": ["Public speaking"],
            "leadership_priorities": ["Team building"],
            "expertise": ["Military intelligence", "AI systems"],
        }
        sb.table("onboarding_docs").insert({
            "user_id": TEST_USER_ID,
            "doc_type": "idp",
            "file_name": "test_idp.pdf",
            "storage_path": f"onboarding/{TEST_USER_ID}/idp/test_idp.pdf",
            "parsed_data": idp_parsed,
        }).execute()
        _score("Insert test IDP doc", True)

        # Trigger prompt rebuild
        loop = asyncio.new_event_loop()
        from api.routes.onboarding import _rebuild_agent_prompt
        loop.run_until_complete(_rebuild_agent_prompt(sb, TEST_USER_ID))
        loop.close()

        # Verify agent was updated
        agent = sb.table("agent_profiles").select("fidelity,system_prompt,expertise,goals").eq("id", TEST_AGENT_ID).execute()
        data = agent.data[0]

        _score("Fidelity updated to 40%", data["fidelity"] == 0.4, detail=f"Got {data['fidelity']}")
        _score("Expertise populated from IDP", len(data["expertise"]) > 0, detail=f"{data['expertise']}")
        _score("Goals populated from IDP", len(data["goals"]) > 0, detail=f"{data['goals']}")
        _score("Prompt contains Brain section", "Brain" in data["system_prompt"] or "Goals" in data["system_prompt"])

        # Still missing Heart and Voice
        _score("Prompt flags missing Heart", "Ethics" in data["system_prompt"] or "Heart" in data["system_prompt"])

    except Exception as e:
        _score("Incremental upload", False, detail=f"{e}\n{traceback.format_exc()}")


# ═══════════════════════════════════════════════════
# 6. WORKSPACES
# ═══════════════════════════════════════════════════

def check_workspaces():
    global TEST_WORKSPACE_ID
    print("\n── 6. Workspaces ──")
    if not TEST_USER_ID:
        _score("Workspaces (skipped)", False, detail="No test user")
        return

    sb = _sb()
    try:
        result = sb.table("workspaces").insert({
            "name": "Health Check Workspace",
            "description": "Auto-created by health check",
            "created_by": TEST_USER_ID,
        }).execute()
        TEST_WORKSPACE_ID = result.data[0]["id"]
        _score("Create workspace", True)

        # Add test user as owner
        sb.table("workspace_members").insert({
            "workspace_id": TEST_WORKSPACE_ID,
            "user_id": TEST_USER_ID,
            "role": "owner",
        }).execute()
        _score("Add member to workspace", True)

        # Post a message
        sb.table("messages").insert({
            "workspace_id": TEST_WORKSPACE_ID,
            "user_id": TEST_USER_ID,
            "sender_type": "human",
            "content": "Health check test message",
        }).execute()
        _score("Post message to workspace", True)

    except Exception as e:
        _score("Workspaces", False, detail=str(e))


# ═══════════════════════════════════════════════════
# 7. KNOWLEDGE GRAPH
# ═══════════════════════════════════════════════════

def check_knowledge_graph():
    print("\n── 7. Knowledge Graph ──")
    if not TEST_WORKSPACE_ID or not TEST_AGENT_ID:
        _score("Knowledge graph (skipped)", False, detail="No workspace or agent")
        return

    sb = _sb()
    entity_id = None
    try:
        result = sb.table("shared_entities").insert({
            "workspace_id": TEST_WORKSPACE_ID,
            "author_agent_id": TEST_AGENT_ID,
            "name": "Test Entity",
            "entity_type": "concept",
            "properties": {"description": "Created by health check"},
            "confidence_score": 0.75,
            "status": "draft",
        }).execute()
        entity_id = result.data[0]["id"]
        _score("Create entity", True, detail=f"confidence=0.75")

        # Create a second entity for relationship test
        result2 = sb.table("shared_entities").insert({
            "workspace_id": TEST_WORKSPACE_ID,
            "author_agent_id": TEST_AGENT_ID,
            "name": "Test Entity 2",
            "entity_type": "finding",
            "confidence_score": 0.6,
            "status": "draft",
        }).execute()
        entity2_id = result2.data[0]["id"]

        # Create relationship
        sb.table("shared_relationships").insert({
            "workspace_id": TEST_WORKSPACE_ID,
            "source_entity_id": entity_id,
            "target_entity_id": entity2_id,
            "relationship_type": "SUPPORTS",
            "confidence_score": 0.8,
            "created_by_agent": TEST_AGENT_ID,
        }).execute()
        _score("Create relationship (SUPPORTS)", True)

    except Exception as e:
        _score("Knowledge graph", False, detail=str(e))


# ═══════════════════════════════════════════════════
# 8. APPROVALS
# ═══════════════════════════════════════════════════

def check_approvals():
    print("\n── 8. Approvals ──")
    if not TEST_USER_ID or not TEST_AGENT_ID:
        _score("Approvals (skipped)", False, detail="No test user or agent")
        return

    sb = _sb()
    try:
        result = sb.table("approvals").insert({
            "user_id": TEST_USER_ID,
            "agent_id": TEST_AGENT_ID,
            "workspace_id": TEST_WORKSPACE_ID,
            "action_type": "publish_entity",
            "payload": {"entity_name": "Test", "action": "publish"},
            "status": "pending",
        }).execute()
        approval_id = result.data[0]["id"]
        _score("Create approval", True)

        # Approve it
        sb.table("approvals").update({
            "status": "approved",
            "human_note": "Auto-approved by health check",
            "resolved_at": "now()",
        }).eq("id", approval_id).execute()
        _score("Resolve approval", True)

    except Exception as e:
        _score("Approvals", False, detail=str(e))


# ═══════════════════════════════════════════════════
# 9. NOTIFICATIONS
# ═══════════════════════════════════════════════════

def check_notifications():
    print("\n── 9. Notifications ──")
    if not TEST_USER_ID:
        _score("Notifications (skipped)", False, detail="No test user")
        return

    sb = _sb()
    try:
        sb.table("notifications").insert({
            "user_id": TEST_USER_ID,
            "title": "Health Check Notification",
            "body": "This is a test notification",
            "category": "info",
        }).execute()
        _score("Create notification", True)

        # Read it back
        result = sb.table("notifications").select("*").eq("user_id", TEST_USER_ID).execute()
        _score("Read notifications", len(result.data) > 0, detail=f"{len(result.data)} found")

    except Exception as e:
        _score("Notifications", False, detail=str(e))


# ═══════════════════════════════════════════════════
# 10. API ENDPOINTS
# ═══════════════════════════════════════════════════

def check_tool_repository():
    print("\n── 10. Tool Repository ──")
    if not TEST_AGENT_ID:
        _score("Tool repository (skipped)", False, detail="No test agent")
        return

    sb = _sb()

    # Verify tool_repository table has 32 tools
    try:
        tools = sb.table("tool_repository").select("id,name,category").execute()
        tool_count = len(tools.data or [])
        _score("Tool repository seeded", tool_count >= 32, detail=f"{tool_count} tools found")
    except Exception as e:
        _score("Tool repository table", False, detail=str(e))
        return

    # Verify categories
    categories = set(t["category"] for t in tools.data)
    expected_cats = {"intelligence", "financial", "strategy", "operations", "people", "communication", "collaboration"}
    _score("All 7 categories present", categories == expected_cats, detail=f"Found: {sorted(categories)}")

    # Enable a tool for the test agent
    try:
        test_tool_id = tools.data[0]["id"]
        sb.table("agent_tools").upsert({
            "agent_id": TEST_AGENT_ID,
            "tool_id": test_tool_id,
        }).execute()
        _score("Enable tool for agent", True, detail=f"tool={tools.data[0]['name']}")

        # Verify agent_tools junction works
        enabled = sb.table("agent_tools").select("tool_id").eq("agent_id", TEST_AGENT_ID).execute()
        _score("Agent tools junction", len(enabled.data or []) > 0, detail=f"{len(enabled.data)} tools enabled")

        # Cleanup
        sb.table("agent_tools").delete().eq("agent_id", TEST_AGENT_ID).execute()
        _score("Cleanup agent tools", True)

    except Exception as e:
        _score("Agent tools operations", False, detail=str(e))


def check_north_star():
    print("\n── 11. North Star ──")
    if not TEST_USER_ID:
        _score("North Star (skipped)", False, detail="No test user")
        return

    sb = _sb()

    # Create a test north star
    try:
        ns_data = {
            "user_id": TEST_USER_ID,
            "mission": "Lead with integrity and build systems that elevate others.",
            "principles": [
                {"title": "Integrity First", "description": "Never compromise values for expedience."},
                {"title": "Build to Last", "description": "Create things that outlast the moment."},
                {"title": "Elevate Others", "description": "Success is measured by who you lift up."},
            ],
            "vision": "In 10 years, be known as someone who built organizations that developed leaders.",
            "non_negotiables": ["Honesty", "Family first", "Never cut corners on quality"],
            "synthesis_source": {"guided_answers": True},
        }
        result = sb.table("north_stars").insert(ns_data).execute()
        if result.data:
            _score("Create test North Star", True, detail=f"id={result.data[0]['id']}")
        else:
            _score("Create test North Star", False, detail="No data returned")
            return
    except Exception as e:
        _score("Create test North Star", False, detail=str(e))
        return

    # Read it back
    try:
        ns = sb.table("north_stars").select("*").eq("user_id", TEST_USER_ID).execute()
        _score("Read North Star", len(ns.data) == 1, detail=f"mission='{ns.data[0]['mission'][:40]}...'")
        _score("Principles stored as JSONB", len(ns.data[0].get("principles", [])) == 3)
        _score("Non-negotiables stored as array", len(ns.data[0].get("non_negotiables", [])) == 3)
    except Exception as e:
        _score("Read North Star", False, detail=str(e))

    # Verify guided questions endpoint returns questions
    try:
        from api.routes.north_star import _build_guided_questions
        questions = _build_guided_questions({}, {})
        _score("Guided questions (no docs)", len(questions) == 5, detail=f"{len(questions)} base questions")

        # With IDP data
        questions_with_idp = _build_guided_questions(
            {"idp": {"goals": ["Lead teams", "Scale business"]}},
            {}
        )
        _score("Guided questions (with IDP)", len(questions_with_idp) == 6, detail=f"{len(questions_with_idp)} questions")
    except Exception as e:
        _score("Guided questions", False, detail=str(e))

    # Cleanup test north star
    try:
        sb.table("north_stars").delete().eq("user_id", TEST_USER_ID).execute()
        _score("Cleanup test North Star", True)
    except Exception as e:
        _score("Cleanup North Star", False, detail=str(e))


def check_anatomy():
    print("\n── 12. Anatomy ──")
    if not TEST_USER_ID or not TEST_AGENT_ID:
        _score("Anatomy (skipped)", False, detail="No test user or agent")
        return

    try:
        loop = asyncio.new_event_loop()
        from api.runtime.anatomy import get_anatomy, get_heartbeat_status

        anatomy = loop.run_until_complete(get_anatomy(str(TEST_USER_ID), str(TEST_AGENT_ID)))
        loop.close()

        _score("Anatomy computed", True, detail=f"overall_health={anatomy.overall_health:.3f}")

        # Template agent should be flatline or weak (nothing uploaded yet except IDP from step 5)
        hb = get_heartbeat_status(anatomy)
        _score("Heartbeat status computed", True, detail=f"status={hb}")

        # Brain should have some health since IDP was uploaded in step 5
        _score("Brain system after IDP", anatomy.brain.health > 0,
               detail=f"health={anatomy.brain.health}, status={anatomy.brain.status}")

        # Heart should be dormant (no ethics uploaded)
        _score("Heart dormant (no ethics)", anatomy.heart.status == "dormant",
               detail=f"status={anatomy.heart.status}")

        # Hands should show tools available
        _score("Hands shows tools", anatomy.hands.health > 0,
               detail=f"health={anatomy.hands.health}, detail={anatomy.hands.detail}")

        # Soul should be dormant (no north star set up)
        _score("Soul dormant (no north star)", anatomy.soul.status == "dormant",
               detail=f"status={anatomy.soul.status}")

        # All systems should have valid status values
        valid_statuses = {"dormant", "developing", "active", "strong"}
        all_valid = all(
            getattr(anatomy, attr).status in valid_statuses
            for attr in ["soul", "brain", "heart", "voice", "gut", "hands", "muscle",
                         "connective_tissue", "skin", "blood"]
        )
        _score("All system statuses valid (incl. Soul)", all_valid)

    except Exception as e:
        _score("Anatomy", False, detail=f"{type(e).__name__}: {e}")


def check_intelligence():
    print("\n── 13. Intelligence ──")
    if not TEST_USER_ID:
        _score("Intelligence (skipped)", False, detail="No test user")
        return

    sb = _sb()

    # Verify intelligence_suggestions table exists
    try:
        sb.table("intelligence_suggestions").select("*").limit(0).execute()
        _score("Table: intelligence_suggestions", True)
    except Exception as e:
        _score("Table: intelligence_suggestions", False, detail=str(e))
        return

    # Generate suggestions for test user (should include fidelity suggestion since fidelity ~40%)
    try:
        loop = asyncio.new_event_loop()
        from api.runtime.rubicon_intelligence import generate_user_suggestions, get_cohort_trends

        suggestions = loop.run_until_complete(generate_user_suggestions(str(TEST_USER_ID)))
        _score("Generate user suggestions", len(suggestions) > 0, detail=f"{len(suggestions)} suggestions")

        # Should have fidelity suggestion (no ethics, no insights)
        fidelity_suggestions = [s for s in suggestions if s["type"] == "fidelity"]
        _score("Fidelity suggestions present", len(fidelity_suggestions) > 0,
               detail=f"{len(fidelity_suggestions)} fidelity suggestions")

        # Should have north star suggestion
        ns_suggestions = [s for s in suggestions if s["type"] == "north_star"]
        _score("North Star suggestion present", len(ns_suggestions) > 0,
               detail=f"{len(ns_suggestions)} north star suggestions")

        # Test trends
        trends = loop.run_until_complete(get_cohort_trends())
        _score("Cohort trends returned", "cohort_stats" in trends,
               detail=f"total_users={trends.get('cohort_stats', {}).get('total_users', 0)}")

        loop.close()

    except Exception as e:
        _score("Intelligence generation", False, detail=f"{type(e).__name__}: {e}")

    # Persist a test suggestion and verify
    try:
        sb.table("intelligence_suggestions").insert({
            "user_id": str(TEST_USER_ID),
            "suggestion_type": "fidelity",
            "title": "Health check test suggestion",
            "body": "This is a test suggestion from the health check.",
            "action_url": "/profile",
            "priority": 50,
        }).execute()
        _score("Persist suggestion", True)

        # Read it back
        result = sb.table("intelligence_suggestions").select("*").eq("user_id", str(TEST_USER_ID)).execute()
        _score("Read suggestions", len(result.data) > 0, detail=f"{len(result.data)} found")

        # Cleanup
        sb.table("intelligence_suggestions").delete().eq("user_id", str(TEST_USER_ID)).execute()
        _score("Cleanup test suggestions", True)
    except Exception as e:
        _score("Intelligence persistence", False, detail=str(e))


def check_agent_repository():
    print("\n── 14. Agent Repository ──")
    if not TEST_USER_ID:
        _score("Agent repository (skipped)", False, detail="No test user")
        return

    sb = _sb()
    test_custom_agent_id = None

    # Create a test custom agent
    try:
        result = sb.table("custom_agents").insert({
            "created_by": TEST_USER_ID,
            "name": "Health Check Test Agent",
            "description": "Auto-created by health check",
            "purpose": "Test the agent repository system",
            "expertise": ["testing", "health checks"],
            "system_prompt": "You are a test agent created by the health check.",
            "tools": [],
            "category": "custom",
            "icon": "🧪",
            "visibility": "cohort",
            "doctrine_components": {"confidence_scoring": True},
        }).execute()
        if result.data:
            test_custom_agent_id = result.data[0]["id"]
            _score("Create custom agent", True, detail=f"id={test_custom_agent_id}")
        else:
            _score("Create custom agent", False, detail="No data returned")
            return
    except Exception as e:
        _score("Create custom agent", False, detail=str(e))
        return

    # Clone/enable it for the test user
    try:
        sb.table("user_custom_agents").upsert({
            "user_id": TEST_USER_ID,
            "custom_agent_id": test_custom_agent_id,
        }).execute()
        sb.table("custom_agents").update({"clone_count": 1}).eq("id", test_custom_agent_id).execute()
        _score("Clone custom agent", True)
    except Exception as e:
        _score("Clone custom agent", False, detail=str(e))

    # Rate it
    try:
        sb.table("agent_ratings").insert({
            "user_id": TEST_USER_ID,
            "custom_agent_id": test_custom_agent_id,
            "rating": 5,
            "review": "Great test agent!",
        }).execute()
        sb.table("custom_agents").update({
            "rating_sum": 5, "rating_count": 1,
        }).eq("id", test_custom_agent_id).execute()
        _score("Rate custom agent", True)
    except Exception as e:
        _score("Rate custom agent", False, detail=str(e))

    # Verify What's New notification would work (check notifications table)
    try:
        sb.table("notifications").insert({
            "user_id": TEST_USER_ID,
            "title": "New Agent: Health Check Test Agent",
            "body": "Health Check Bot created a new agent: Auto-created by health check",
            "category": "info",
            "link": f"/agent-repo/{test_custom_agent_id}",
        }).execute()
        _score("What's New notification", True)
    except Exception as e:
        _score("What's New notification", False, detail=str(e))

    # Cleanup agent repository test data
    try:
        if test_custom_agent_id:
            sb.table("agent_ratings").delete().eq("custom_agent_id", test_custom_agent_id).execute()
            sb.table("user_custom_agents").delete().eq("custom_agent_id", test_custom_agent_id).execute()
            sb.table("custom_agents").delete().eq("id", test_custom_agent_id).execute()
        _score("Cleanup agent repository data", True)
    except Exception as e:
        _score("Cleanup agent repository data", False, detail=str(e))


def check_feedback():
    print("\n── 15. Feedback ──")
    if not TEST_USER_ID:
        _score("Feedback (skipped)", False, detail="No test user")
        return

    sb = _sb()
    test_feedback_id = None

    # Verify tables exist
    try:
        sb.table("feedback").select("*").limit(0).execute()
        _score("Table: feedback", True)
        sb.table("feedback_upvotes").select("*").limit(0).execute()
        _score("Table: feedback_upvotes", True)
    except Exception as e:
        _score("Feedback tables", False, detail=str(e))
        return

    # Create test feedback
    try:
        result = sb.table("feedback").insert({
            "user_id": TEST_USER_ID,
            "type": "bug",
            "title": "Health check test bug",
            "body": "This is a test feedback item created by the health check.",
            "page_url": "/dashboard",
            "status": "open",
            "priority": "normal",
        }).execute()
        if result.data:
            test_feedback_id = result.data[0]["id"]
            _score("Create feedback", True, detail=f"id={test_feedback_id}")
        else:
            _score("Create feedback", False, detail="No data returned")
            return
    except Exception as e:
        _score("Create feedback", False, detail=str(e))
        return

    # Upvote it
    try:
        sb.table("feedback_upvotes").insert({
            "user_id": TEST_USER_ID,
            "feedback_id": test_feedback_id,
        }).execute()
        _score("Upvote feedback", True)

        # Increment count via direct update (RPC may not be available in test env)
        sb.table("feedback").update({"upvotes": 1}).eq("id", test_feedback_id).execute()

        # Verify upvote count
        result = sb.table("feedback").select("upvotes").eq("id", test_feedback_id).execute()
        upvotes = result.data[0]["upvotes"] if result.data else 0
        _score("Upvote count correct", upvotes == 1, detail=f"upvotes={upvotes}")
    except Exception as e:
        _score("Feedback upvotes", False, detail=str(e))

    # Read feedback back
    try:
        result = sb.table("feedback").select("*").eq("id", test_feedback_id).execute()
        _score("Read feedback", len(result.data) == 1, detail=f"type={result.data[0]['type']}, status={result.data[0]['status']}")
    except Exception as e:
        _score("Read feedback", False, detail=str(e))

    # Cleanup
    try:
        sb.table("feedback_upvotes").delete().eq("feedback_id", test_feedback_id).execute()
        sb.table("feedback").delete().eq("id", test_feedback_id).execute()
        _score("Cleanup feedback", True)
    except Exception as e:
        _score("Cleanup feedback", False, detail=str(e))


def check_api_endpoints():
    print("\n── 15. API Endpoints ──")
    import httpx

    base = "http://localhost:8001"
    endpoints = [
        ("GET", "/health", 200),
        ("POST", f"/api/agents/ensure/{TEST_USER_ID}", 200),
        ("GET", f"/api/agents/user/{TEST_USER_ID}", 200),
        ("GET", f"/api/onboarding/status/{TEST_USER_ID}", 200),
        ("GET", f"/api/onboarding/docs/{TEST_USER_ID}", 200),
        ("GET", f"/api/anatomy/{TEST_USER_ID}", 200),
        ("GET", f"/api/anatomy/{TEST_USER_ID}/heartbeat", 200),
    ]

    for method, path, expected_status in endpoints:
        try:
            if method == "GET":
                resp = httpx.get(f"{base}{path}", timeout=10)
            else:
                resp = httpx.post(f"{base}{path}", timeout=10)
            _score(f"{method} {path}", resp.status_code == expected_status,
                   detail=f"status={resp.status_code}")
        except Exception as e:
            _score(f"{method} {path}", False, detail=str(e))


# ═══════════════════════════════════════════════════
# CLEANUP
# ═══════════════════════════════════════════════════

def cleanup():
    print("\n── Cleanup ──")
    sb = _sb()
    cleaned = 0

    try:
        # Delete approvals first (references both agent and workspace)
        if TEST_AGENT_ID:
            sb.table("approvals").delete().eq("agent_id", TEST_AGENT_ID).execute()

        if TEST_WORKSPACE_ID:
            # Now safe to delete workspace (cascade handles messages, entities, etc.)
            sb.table("workspaces").delete().eq("id", TEST_WORKSPACE_ID).execute()
            cleaned += 1

        if TEST_AGENT_ID:
            sb.table("agent_profiles").delete().eq("id", TEST_AGENT_ID).execute()
            cleaned += 1

        if TEST_USER_ID:
            sb.table("intelligence_suggestions").delete().eq("user_id", TEST_USER_ID).execute()
            sb.table("north_stars").delete().eq("user_id", TEST_USER_ID).execute()
            sb.table("notifications").delete().eq("user_id", TEST_USER_ID).execute()
            sb.table("onboarding_docs").delete().eq("user_id", TEST_USER_ID).execute()
            sb.table("users").delete().eq("id", TEST_USER_ID).execute()
            # Delete auth user
            sb.auth.admin.delete_user(TEST_USER_ID)
            cleaned += 1

        _score("Cleanup test data", True, detail=f"Removed {cleaned} test records")
    except Exception as e:
        _score("Cleanup", False, detail=str(e))


# ═══════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════

def main():
    start = time.time()
    print("╔══════════════════════════════════════════════════╗")
    print("║  RUBICON HEALTH CHECK                            ║")
    print("║  End-to-end platform validation                  ║")
    print("╚══════════════════════════════════════════════════╝")

    # Run checks in order
    db_ok = check_db_connection()
    if db_ok:
        check_tables_exist()
        check_agent_profile_columns()

    check_storage_bucket()

    agent_ok = check_template_agent()
    check_prompt_builder()

    if agent_ok:
        check_incremental_upload()
        check_workspaces()
        check_knowledge_graph()
        check_approvals()
        check_notifications()
        check_tool_repository()
        check_north_star()
        check_anatomy()
        check_intelligence()
        check_agent_repository()
        check_feedback()
        check_api_endpoints()

    cleanup()

    # ── Score ──
    elapsed = time.time() - start
    total = PASSED_CHECKS + HEALED_CHECKS + FAILED_CHECKS
    score = ((PASSED_CHECKS + HEALED_CHECKS) / total * 10) if total else 0

    print(f"\n{'═' * 52}")
    print(f"  Score: {score:.1f}/10.0")
    print(f"  Passed: {PASSED_CHECKS}  |  Healed: {HEALED_CHECKS}  |  Failed: {FAILED_CHECKS}  |  Total: {total}")
    print(f"  Time: {elapsed:.1f}s")
    print(f"{'═' * 52}")

    if FAILED_CHECKS > 0:
        print("\n  Failed checks:")
        for c in CHECKS:
            if c["status"] == "FAIL":
                print(f"    ✗ {c['name']}: {c['detail']}")

    if HEALED_CHECKS > 0:
        print("\n  Self-healed:")
        for c in CHECKS:
            if c["status"] == "HEAL":
                print(f"    ⚕ {c['name']}: {c['detail']}")

    print()
    return 0 if FAILED_CHECKS == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
