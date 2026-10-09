# P12 - Accounts, consent and preferences

**Launch-critical:** Yes  |  **Depends on:** P11  |  **Spec sections:** 7.1, 8
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P12`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
Users can sign in, recover access, save things and control communication consent.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- Email/password exists; no phone/OTP and no recovery flow found.
- No consent records or channel opt-ins.
- Saved properties/searches pages exist; alert history, invoices and support requests do not.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| What auth exists and how are sessions stored? | src/lib/auth/userSession.ts, password.ts; login/register pages; /api/me |
| What do SavedProperty and SavedSearch store? | prisma models; saved-properties and my-alerts pages |
| Is there any email sending capability? | grep for mail providers; env vars (none found on 9 Oct) |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- Choose the simplest secure recovery path (email link). Phone OTP only if the owner approves a provider.
- Consent is per channel and purpose with timestamp and source; opt-out is one click.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP12.1 Password reset and email verification.
- WP12.2 ConsentRecord model + preferences page.
- WP12.3 Account page: saved items, subscriptions placeholder, support link.
- WP12.4 Session hardening tests.

## Step 4 - Tests required
- Auth flow tests with a test mail transport.
- Consent record tests.

## Exit gate (all must be true before this phase is DONE)
- [ ] Sign-up, sign-in, recovery and preference changes work in preview with a sandbox mail provider.
- [ ] Consent stored with timestamp.

## Owner approvals needed
- Owner approves mail provider and cost; never send real campaigns while testing.

## Rollback
Revert PR; new tables unused.

## Report back (use the template in PROTOCOL.md section 9)
