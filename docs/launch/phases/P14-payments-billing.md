# P14 - Payments, invoices and refunds

**Launch-critical:** Yes (paid launch)  |  **Depends on:** P13  |  **Spec sections:** 7.4
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P14`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
Money is collected safely: verified payments grant access once; invoices and refunds follow approved rules. Sandbox only until sign-off.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- Payment model, PaymentSettings and admin payments page exist; no checkout or webhook route found.
- Site states online payment is not live.
- No invoices, credit notes, renewal or cancellation flows.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| What does lib/payments/settings.ts and the admin payments page do? | src/lib/payments/settings.ts; src/app/admin/(shell)/payments |
| Is there any order-creation or verification code? | grep -rn razorpay src; api routes |
| Which gateway and test keys does the owner have? | ENVIRONMENT.md; ask owner |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- Use test/sandbox keys only. Never charge a real customer during build.
- Server creates the order; client success redirect never grants access; only a signed webhook or server verification does.
- Idempotency key per order; duplicate webhooks are no-ops.
- Invoices and GST per CA rules; do not invent numbering.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP14.1 Order creation + verification + signed webhook + idempotency.
- WP14.2 Entitlement grant on verified payment.
- WP14.3 Failure, retry, duplicate handling and customer messages.
- WP14.4 Invoice generation and numbering (CA-approved).
- WP14.5 Refund, cancellation, renewal, expiry, grace period.
- WP14.6 Reconciliation view in admin.

## Step 4 - Tests required
- AT-09 payment integrity.
- AT-10 renewal/refund.

## Exit gate (all must be true before this phase is DONE)
- [ ] AT-09 and AT-10 pass in sandbox.
- [ ] CA/legal approvals recorded.

## Owner approvals needed
- Owner: gateway account, refund policy, CA invoice rules, go-live of live keys.

## Rollback
Disable checkout flag; entitlements granted in sandbox are removed by a documented script.

## Report back (use the template in PROTOCOL.md section 9)
