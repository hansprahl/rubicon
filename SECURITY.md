# Security Policy — Rubicon

Rubicon is a collaborative digital twin platform for EMBA Cohort 84 at the University of Denver. It is currently in private production use by 9 cohort members. This document describes what the system protects, the threats it is designed to resist, and how to report a vulnerability.

## What this system protects

| Data | Sensitivity | Where it lives |
|------|-------------|----------------|
| User identity documents (IDP, Ethics paper, Insights profile) | High — private, identity-defining | Supabase Storage bucket `documents/` |
| User DMs | High — interpersonal | Supabase `dm_messages` table |
| Workspace feeds and posts | Medium — cohort-internal | Supabase `messages` table |
| Agent system prompts (built from identity docs) | High — derived identity | Supabase `agent_profiles.system_prompt` |
| North Stars (mission, principles, non-negotiables) | Medium — professional reflection | Supabase `north_stars` table |
| Auth sessions | High — authentication material | Supabase Auth |

## Threat model

**In scope:**
- Cross-user data leak (User A reads User B's DMs, identity docs, approvals, or private agent context)
- Cross-user impersonation (posting, DMing, or taking actions as another user)
- Prompt injection via cross-user content flows (e.g. feed posts manipulating other members' agents)
- Unauthenticated access to any endpoint with user-scoped data
- Privilege escalation (non-admin obtaining admin rights)
- Dependency-borne CVEs that affect runtime behavior

**Out of scope:**
- Denial-of-service attacks against Vercel or Railway infrastructure (addressed at the platform layer)
- Attacks that require compromising a user's Supabase Auth account credentials
- Physical access to a user's logged-in browser session
- Malicious agent behavior within a user's own trust boundary (a user prompting their own agent to do something is not a security issue — it's a product issue)

**Threat actors:**
- Primary: a cohort member going rogue or having their account compromised
- Secondary: external attacker probing the public API at rubicon-production-cc7d.up.railway.app
- Tertiary: supply-chain (compromised npm/pip dependency)

## Defenses currently in place

- Every API endpoint requires a valid Supabase JWT
- User-scoped endpoints verify path/query `user_id` matches the authenticated caller
- Workspace-scoped endpoints verify caller membership
- Agent-scoped endpoints verify caller ownership
- Supabase Row Level Security as defense-in-depth (backend uses service_role but RLS protects any direct anon-key access)
- Cross-user content (workspace feed posts) is sanitized and delimited before embedding in other users' agent prompts
- `gitleaks` pre-commit hook blocks accidental secret commits
- GitHub Secret Scanning + Push Protection enabled
- Dependabot alerts + automatic security update PRs

## Known open risks (accepted or deferred)

- Next.js 14.2.35 has two high-severity DoS vulnerabilities in Server Components request handling. Rubicon sits behind Vercel's DDoS protection and serves only 9 known users; risk is low. A Next.js 14 → 16 migration is scheduled as a dedicated future session.
- Shared knowledge graph and historical feed reads by agents do not yet sanitize content at the read boundary. Only write-time sanitization is in place. Read-boundary hardening is tracked for a future pass.

## Reporting a vulnerability

Email **hans.t.prahl@gmail.com** with:
- A brief description of the vulnerability
- Reproduction steps (curl commands, screenshots, or a minimal PoC)
- Impact assessment (what data could be exposed or what actions could be taken)
- Your contact info

Please do **not** open a public GitHub issue for a security vulnerability.

### Response commitment

- Acknowledgement within 72 hours
- Initial assessment and CVSS score within 7 days
- Patch timeline communicated within 14 days of confirmation
- Credit given to reporter unless anonymity is requested

## Supported versions

Only the `main` branch is supported. Historical tags and experiment branches do not receive security patches.

## Incident response

If a real incident occurs:

1. **Contain** — identify the scope and stop the bleeding (disable affected endpoint, rotate compromised key, revoke session)
2. **Rotate** — all keys that may have been exposed:
   - Supabase service_role key (Supabase dashboard → Project Settings → API)
   - Anthropic API key (Anthropic console)
   - Any OAuth provider tokens
3. **Notify** — affected users via direct email within 72 hours
4. **Preserve** — capture logs (Railway, Supabase, Vercel) before they rotate out
5. **Remediate** — fix the root cause, write a regression test if possible
6. **Post-mortem** — document what happened, what worked, what failed. Update this SECURITY.md with lessons learned.

## Security-relevant dependencies

- **Supabase** — Auth, Postgres with RLS, Storage bucket, Realtime. Service-role key never leaves the backend.
- **Anthropic API** — all LLM calls. Keys stored only in Railway env vars.
- **Vercel** — frontend hosting. OAuth-gated access.
- **Railway** — backend hosting. OAuth-gated access.

## Changes to this policy

This document is versioned with the codebase. Material changes require a commit and are reviewed as part of the PR process (even for solo work — leaves an audit trail).
