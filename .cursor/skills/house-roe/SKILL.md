---
name: house-roe
description: "Use on every coding task in this repo — draft PR floors, Ghost for prose, no secrets in browser."
---

- Open a draft PR. Do not merge. Do not deploy unless the human stamp says merge.
- Finished human-facing prose goes through Ghost. Engineering notes and code comments only. Prefer deletion. If words are needed, list Needs Ghost copy in the PR body; do not invent copy.
- Do not print secrets, Stripe keys, or env values into HTML, client-visible logs, or PR bodies.
- Run the relevant tests (pytest web/, pnpm build in site/, worker tests) and report counts.
- Keep sitemaps and internal links free of dead targets after deletions.
- One branch per workstream; accept mid-run steer messages.
