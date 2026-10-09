# P13 - Plans, entitlements and premium access control

**Launch-critical:** Yes (paid launch)  |  **Depends on:** P11, P12  |  **Spec sections:** 7.2, 7.3, 2
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P13`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
Free and paid access is enforced on the server for every page, API and document, with no cache leakage.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- No tiers or entitlements; pricing page shows 2,500/4,000/7,000 vs spec proposals 1,499/2,699/4,999.
- Founding, single, team and Private Desk plans absent.
- Documents are open or unlock-gated only by UI.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| What fields and documents are gated today and how? | property page 'Unlock'; Document models; api routes |
| Which plan prices are approved? | DECISIONS.md D03 |
| How is caching configured for pages that vary by user? | unstable_cache usage, route segment config, Cache-Control headers |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- No plan goes live without D03 (prices, GST wording). Build plans as data, not code.
- Entitlement checks live in one server module; pages and APIs call it. Never mask only in the browser.
- Cache: any response that varies by entitlement is not shared-cached.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP13.1 Plan, Subscription, Entitlement models.
- WP13.2 Central access module + masked-field serializer.
- WP13.3 Document access via expiring signed links.
- WP13.4 Pricing page driven by approved plans.
- WP13.5 Free-tier delay/masking only if D-FREE approved.

## Step 4 - Tests required
- AT-08 premium access incl. direct URL and cache tests.

## Exit gate (all must be true before this phase is DONE)
- [ ] AT-08 passes.
- [ ] Pricing page equals approved plans.

## Owner approvals needed
- Owner approves prices, GST wording, free-tier rules (D03, D02b).

## Rollback
Flag off entitlements; public content stays visible.

## Report back (use the template in PROTOCOL.md section 9)
