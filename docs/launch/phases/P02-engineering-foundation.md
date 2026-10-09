# P02 - Engineering foundation and release process

**Launch-critical:** Yes  |  **Depends on:** P01  |  **Spec sections:** 13 (last bullet), 19
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P02`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
Make every later change safe: reliable CI, tests runnable by any contributor, feature flags, migration and rollback rules, and a release checklist.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- Sandbox could not generate Prisma client or run next build; 4 test files fail only because of that.
- No documented feature-flag mechanism for hiding unfinished features (for example the Map toggle).
- Backups and restore are undocumented.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| What does .github/workflows/ci.yml run (lint, type-check, test, build)? | ci.yml |
| Do tests run without a database? Which need the Prisma client? | tests/*.test.ts; package.json scripts |
| Is there a feature-flag or env-switch pattern already (NEXT_PUBLIC_*, SiteSettings)? | src/lib/constants.ts; prisma model SiteSettings; docs/ENVIRONMENT.md |
| What are the documented deploy/rollback steps? | docs/DEPLOYMENT.md, docs/OPERATIONS.md |
| How are Prisma migrations applied in production, and by whom? | prisma/migrations; docs/DATABASE.md |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- If CI already runs lint+type-check+test+build, do not rebuild it; only fill gaps.
- If a flag mechanism exists, reuse it. Otherwise add ONE small helper (src/lib/flags.ts) backed by env vars; no new service.
- Migrations are written in a PR but NEVER applied by the LLM. The operator applies them after approval with a backup noted.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP2.1 Close CI gaps (type-check and build must run in CI).
- WP2.2 Add src/lib/flags.ts with documented flags and tests.
- WP2.3 Write docs/launch/RELEASE_CHECKLIST.md (PR, CI, preview review, owner approval, deploy, smoke test, rollback).
- WP2.4 Document backup and restore procedure with the hosting provider's real facts (ask owner).

## Step 4 - Tests required
- Unit tests for flags helper.
- CI run showing all stages green (link it).

## Exit gate (all must be true before this phase is DONE)
- [ ] CI runs lint, type-check, tests and build on every PR.
- [ ] Flags helper merged and used by at least one feature.
- [ ] RELEASE_CHECKLIST.md approved by owner.

## Owner approvals needed
- Owner approves checklist. Operator confirms backup facts.

## Rollback
Revert the PR. Flags default to current behaviour.

## Report back (use the template in PROTOCOL.md section 9)
