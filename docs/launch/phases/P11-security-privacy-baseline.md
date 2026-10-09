# P11 - Security and privacy baseline

**Launch-critical:** Yes  |  **Depends on:** P02  |  **Spec sections:** 13
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P11`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
Standard web hardening and a lawful, minimal approach to personal data before any accounts or payments go live.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- Only HSTS present; no CSP, X-Frame-Options, nosniff, Referrer-Policy.
- No rate limiting on public forms/login found.
- Premium copy sells 'full borrower names and contact details'.
- No consent records, incident or deletion process.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| Which headers does the production site send? | curl -sI or fetch of /, /property/<slug>, /api/* |
| Where are forms and login actions and what validation do they use? | src/lib/validation; contact page action; admin/login/actions.ts; login/register |
| Where is borrower data stored and displayed? | grep -ri borrower src prisma; tests/borrowerExposure.test.ts |
| Which secrets and keys are used and how are they redacted in logs? | docs/SECURITY.md; src/lib/apiKeys.ts |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- Add headers in next.config with a CSP that works with Leaflet tiles and analytics; test in preview before production.
- Borrower names: do not display or sell them until D07 gives a documented lawful need. Default: remove from copy and mask.
- Rate limit by IP+route with a small in-DB or edge counter; no new paid service without approval.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP11.1 Security headers + tests.
- WP11.2 Rate limits on contact, login, register, API.
- WP11.3 Borrower-data policy implemented in UI and API shape (apiShape.ts).
- WP11.4 Consent and data-deletion process doc; privacy-policy page review with qualified reviewer.
- WP11.5 Dependency update policy and audit.

## Step 4 - Tests required
- Header presence test.
- Rate-limit tests.
- AT-17 (borrower minimisation part).

## Exit gate (all must be true before this phase is DONE)
- [ ] Headers present in production preview.
- [ ] No borrower names exposed publicly or via API.
- [ ] Rate limits proven by test.

## Owner approvals needed
- Owner: borrower-data policy (D07); legal review of privacy text.

## Rollback
Revert PR; headers in config only.

## Report back (use the template in PROTOCOL.md section 9)
