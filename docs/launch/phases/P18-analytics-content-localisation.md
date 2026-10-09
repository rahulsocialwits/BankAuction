# P18 - Analytics, content and localisation

**Launch-critical:** Partial  |  **Depends on:** P10, P12  |  **Spec sections:** 10, 11, 17
**Rows to work from:** `docs/launch/data/requirements.csv`, filter `phase = P18`. Issues: `data/issues_2026-10-09.csv`, same filter.

## Goal
Consent-aware measurement, a content system for guides and Auction of the Day, and a localisation framework starting with approved languages.

## Known problems at 9 Oct 2026 (verify they still exist before acting)
- No analytics found.
- Blog/pages admin exists; Auction of the Day absent.
- No language framework.

## Step 1 - Entry audit. Do this FIRST. Do not write code before it is done.
Answer each question from evidence (code, tests, read-only live checks, BASELINE.md). Classify each answer as DONE, PARTIAL, MISSING, WRONG or UNKNOWN. UNKNOWN means verify it before deciding.

| Question | Where to look |
|---|---|
| Is any tracking present? | grep for analytics tags; layout files |
| What content types does the admin manage? | admin blog, pages, home config |
| Which languages are approved for wave 1? | DECISIONS.md D08 |

Paste the filled audit table into the PR description and a one-line summary into PHASE_STATUS.md.

## Step 2 - Decision rules (how to choose what to do from the audit)
- No analytics before a consent banner works. Choose one tool (owner approval).
- Translations are labelled; source text stays visible.
- Start with one extra language only after D08.
- Only work on items classified PARTIAL, MISSING or WRONG. Never rebuild something classified DONE; add a regression test instead.
- If an owner decision this phase needs is OPEN in DECISIONS.md, use the default, state it in the PR, keep the change behind a flag or otherwise reversible.

## Step 3 - Work packages (one focused branch and PR each)
- WP18.1 Consent banner + analytics wiring + UTM capture + funnel events.
- WP18.2 Auction of the Day (admin-picked) and homepage section.
- WP18.3 i18n routing + translated nav and filters for approved wave.
- WP18.4 Guide/FAQ templates with update dates and source links.

## Step 4 - Tests required
- Consent gating test (no events before consent).
- i18n fallback test.

## Exit gate (all must be true before this phase is DONE)
- [ ] Funnel events visible; consent respected; first language wave live behind flag.

## Owner approvals needed
- Owner: analytics tool, languages, translation owner.

## Rollback
Flags off.

## Report back (use the template in PROTOCOL.md section 9)
