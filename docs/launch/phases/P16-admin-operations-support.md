# P16 - Admin operations, audit log and support

**Launch-critical:** Yes  |  **Depends on:** P03, P04, P05, P06  |  **Spec sections:** 12, 5.3 (correction path)
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P16`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
The team can see data quality, source health, users and payments, fix errors with a trail, and answer users.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- Admin pages exist but were not audited live.
- No audit log, no support tickets, no correction workflow tied to a property.
- Exports not logged.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| Which admin pages exist and what does each do? | src/app/admin/(shell)/* |
| Which admin roles exist and what can each do? | AdminRole enum; adminAuth.ts |
| Is there any action logging? | grep -ri audit; PropertyChange model |
| Does the contact form create a Lead only? | contact page action; Lead model |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- Reuse existing admin shell and components.
- Every admin write logs actor, time, before/after.
- Exports are role-protected, minimised and logged.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP16.1 AuditLog model + hooks on admin writes.
- WP16.2 Data-quality dashboard from P04 counts and P05 report.
- WP16.3 Source health board from P06.
- WP16.4 SupportTicket model, 'Report an error' on property page, admin queue, first-response timestamp.
- WP16.5 Correction history preserved (prior value, actor, reason).
- WP16.6 Observability: structured logs, health check, error tracker choice.

## Step 4 - Tests required
- AT-19 support and correction.
- Audit-log tests.

## Exit gate (all must be true before this phase is DONE)
- [ ] AT-19 passes.
- [ ] Admin changes appear in the audit log.

## Owner approvals needed
- Owner: error-tracking tool and cost.

## Rollback
Revert PR; tables unused.

## Report back (use the template in PROTOCOL.md section 9)
