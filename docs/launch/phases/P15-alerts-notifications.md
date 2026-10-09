# P15 - Alerts and notifications

**Launch-critical:** Partial  |  **Depends on:** P12, P13  |  **Spec sections:** 8
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P15`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
Opted-in users get matching, de-duplicated alerts through approved channels, with logs and unsubscribe.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- Alert and SavedSearch models store filters only; no matching or delivery code, no email/WhatsApp/push provider.
- Site says alerts are planned and not available.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| What do Alert.filters and SavedSearch store? | prisma models; my-alerts page |
| Is there a job runner for scheduled work? | api/cron/*, .github/workflows/tick.yml, SCHEDULER.md |
| Which channels and providers are approved? | DECISIONS.md D10 (providers) |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- Email first. WhatsApp/push only when providers, templates and consent are approved.
- Send only on new eligible listing or material change; de-duplicate by (user, property, event).
- Never expose masked premium fields in free-tier alerts.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP15.1 Alert model extension: channels, frequency, pause, consent link, last result.
- WP15.2 Matching engine reusing publishedWhere + lifecycle helper.
- WP15.3 Delivery log with queued/sent/failed and retry limits.
- WP15.4 Digest and immediate modes; unsubscribe link.
- WP15.5 Retention emails (weekly digest, day-14, day-60, renewal) behind flags.

## Step 4 - Tests required
- AT-11 alerts: opted-in only, dedupe, unsubscribe, failed delivery.

## Exit gate (all must be true before this phase is DONE)
- [ ] AT-11 passes with a test provider; no real sends without approval.

## Owner approvals needed
- Owner approves providers, costs, message templates.

## Rollback
Flag off; stop job.

## Report back (use the template in PROTOCOL.md section 9)
