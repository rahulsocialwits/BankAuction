# P20 - Hardening, full acceptance and launch readiness

**Launch-critical:** Yes  |  **Depends on:** all launch-critical phases  |  **Spec sections:** 14, 15, 19, 20
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P20`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
Prove the whole system works together, then take a go/no-go decision with evidence.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- Accessibility, performance targets, load test, backup restore and full acceptance suite not yet done.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| Which phases are Done in PHASE_STATUS.md and which launch mode applies? | PHASE_STATUS.md; DECISIONS.md D06 (launch mode) |
| Which acceptance tests AT-01..AT-20 already pass, with evidence? | data/acceptance_tests.csv; CI; live smoke results |
| When was the last backup restore test? | OPERATIONS.md; owner |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- A feature is 'live' only if it is deployed AND production-smoke-tested.
- Any failed launch-critical AT blocks launch. Optional phases (15, 17-19) can ship later behind flags if the owner says so.
- Do not deploy; prepare the release and ask for explicit owner approval.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP20.1 Accessibility audit and fixes (keyboard, focus, labels, contrast).
- WP20.2 Core Web Vitals targets set and measured.
- WP20.3 Load test to the owner-approved target (D13) on a test environment.
- WP20.4 Backup restore test and rollback rehearsal.
- WP20.5 Run AT-01..AT-20 and record evidence in data/acceptance_tests.csv.
- WP20.6 Production smoke test script: homepage, search, city, map, detail, sign-in, pricing, payment sandbox, alerts, admin health (AT-20).
- WP20.7 Release notes, monitoring signals, owner sign-off sheet.

## Step 4 - Tests required
- AT-01 to AT-20.

## Exit gate (all must be true before this phase is DONE)
- [ ] All launch-critical ATs pass with evidence.
- [ ] Owner signs the release checklist.
- [ ] Post-deploy smoke test passes.

## Owner approvals needed
- Owner go/no-go and explicit deploy approval.

## Rollback
Documented rollback tested in WP20.4.

## Report back (use the template in PROTOCOL.md section 9)
