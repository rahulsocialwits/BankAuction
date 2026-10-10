# Phase status tracker

Single source of truth for progress. The LLM updates this file in the same PR that completes work. Never mark a phase Done without the exit-gate evidence listed.

Status values: NOT STARTED, AUDITING, IN PROGRESS, BLOCKED (state on what), DONE (gate evidence linked).
Stage columns follow spec 19: implemented / tested / merged / deployed / production smoke-tested. Use yes, no or NOT VERIFIED. Never infer one stage from another.

| Phase | Title | Launch-critical | Depends on | Status | Implemented | Tested | Merged | Deployed | Smoke-tested | Evidence (PR / CI / live check links) |
|---|---|---|---|---|---|---|---|---|---|---|
| P01 | [Orient, baseline and owner decisions](phases/P01-orient-baseline-decisions.md) | Yes | none | DONE (exit gate met, exceptions listed in BASELINE.md) | yes | n/a (docs) | yes (PR #29, this PR) | n/a (docs) | NOT VERIFIED | Decisions D01-D16 recorded ([PR #29](https://github.com/rahulsocialwits/BankAuction/pull/29)); CI green on main (BASELINE.md); Vercel READY; Q1-Q9 NOT VERIFIED with owner actions; P05 blocked on Q2/Q3/Q9 |
| P02 | [Engineering foundation and release process](phases/P02-engineering-foundation.md) | Yes | P01 | IN PROGRESS | yes (draft PRs #32–#35; build fix in PR #41) | NOT VERIFIED | no | no | NOT VERIFIED | CI run #78: lint/type-check/tests passed (428 tests), but build failed when `/auctions` and `/property-types` queried unavailable CI PostgreSQL during prerender. [PR #41](https://github.com/rahulsocialwits/BankAuction/pull/41) defers those queries to request time; CI verification pending. WP2.2 [PR #34](https://github.com/rahulsocialwits/BankAuction/pull/34) feature wiring in [PR #39](https://github.com/rahulsocialwits/BankAuction/pull/39), CI pending. WP2.3 [PR #33](https://github.com/rahulsocialwits/BankAuction/pull/33) release checklist awaiting owner approval; WP2.4 [PR #35](https://github.com/rahulsocialwits/BankAuction/pull/35) backup draft needs provider facts |
| P03 | [Data model and provenance design](phases/P03-data-model-design.md) | Yes | P01, P02 | NOT STARTED | no | no | no | no | no |  |
| P04 | [Lifecycle and counting core](phases/P04-lifecycle-counting-core.md) | Yes | P03 | NOT STARTED | no | no | no | no | no |  |
| P05 | [Location data quality and city pages' foundation](phases/P05-location-quality.md) | Yes | P01, P03, P04 | NOT STARTED | no | no | no | no | no |  |
| P06 | [Source compliance and ingestion health](phases/P06-source-compliance-ingestion.md) | Yes | P03 | NOT STARTED | no | no | no | no | no |  |
| P07 | [Search, filters, sort and pagination everywhere](phases/P07-search-filters-pagination.md) | Yes | P04, P05 | NOT STARTED | no | no | no | no | no |  |
| P08 | [Property cards and detail page to spec](phases/P08-cards-detail-page.md) | Yes | P04, P06, P07 | NOT STARTED | no | no | no | no | no |  |
| P09 | [Coordinates and map discovery](phases/P09-coordinates-map.md) | Partial | P03, P05, P07 | NOT STARTED | no | no | no | no | no |  |
| P10 | [Homepage, city/region/institution pages and SEO](phases/P10-home-city-seo.md) | Yes | P05, P07, P08 | NOT STARTED | no | no | no | no | no |  |
| P11 | [Security and privacy baseline](phases/P11-security-privacy-baseline.md) | Yes | P02 | NOT STARTED | no | no | no | no | no |  |
| P12 | [Accounts, consent and preferences](phases/P12-accounts-consent-preferences.md) | Yes | P11 | NOT STARTED | no | no | no | no | no |  |
| P13 | [Plans, entitlements and premium access control](phases/P13-plans-entitlements.md) | No (free discovery); Yes (paid launch) | P11, P12 | NOT STARTED | no | no | no | no | no | D06: free discovery; D02b/D03 gate paid entitlements and pricing |
| P14 | [Payments, invoices and refunds](phases/P14-payments-billing.md) | No (free discovery); Yes (paid launch) | P13 | NOT STARTED | no | no | no | no | no | D03: paid launch blocked pending separately approved price/GST schedule and P13 gate |
| P15 | [Alerts and notifications](phases/P15-alerts-notifications.md) | Partial (defer for free discovery; basic alerts for paid launch) | P12, P13 | NOT STARTED | no | no | no | no | no | D10: email first; defer WhatsApp/push |
| P16 | [Admin operations, audit log and support](phases/P16-admin-operations-support.md) | Yes | P03, P04, P05, P06 | NOT STARTED | no | no | no | no | no |  |
| P17 | [Risk intelligence, compare, client reports and media rights](phases/P17-risk-compare-reports-media.md) | Partial | P08, P13, P16 | NOT STARTED | no | no | no | no | no |  |
| P18 | [Analytics, content and localisation](phases/P18-analytics-content-localisation.md) | Partial | P10, P12 | NOT STARTED | no | no | no | no | no |  |
| P19 | [Partner programme and team features](phases/P19-partners-teams.md) | No (post-launch, behind flags) | P13, P14, P16 | NOT STARTED | no | no | no | no | no |  |
| P20 | [Hardening, full acceptance and launch readiness](phases/P20-release-candidate-launch.md) | Yes | all launch-critical phases | NOT STARTED | no | no | no | no | no |  |

## P01 owner decisions and launch mode (2026-10-09)

- Owner approved recommended defaults for D01-D16; see [DECISIONS.md](DECISIONS.md).
- D06 selects free discovery launch targeted for 20 Oct 2026. P13 and P14 are not launch-critical for free discovery; they remain required for paid launch. P15 is deferred for free discovery, with basic alerts needed for paid launch.
- P01 is DONE: its exit gate (every baseline figure or an explicit NOT VERIFIED with an owner action; decisions recorded; CI and Vercel state recorded) is met. Outstanding items are carried as exceptions in [BASELINE.md](BASELINE.md): operator queries Q1-Q9, Data Engine run history, admin audit, production smoke test. P05 must not plan or run a location backfill until Q2, Q3 and Q9 are recorded.

## Notes from the 9 Oct 2026 audit (starting state)

- PR #25 (city counts) and PR #26 (map) are merged and deployed. City tiles equal results totals (8/8, live checked). Map shows 0 pins in production.
- Main at 6404be2 when this system was written. CI was later read and is green on every checked main commit (see BASELINE.md).
- Admin console was not audited live.
- See data/live_audit_2026-10-09.csv and data/issues_2026-10-09.csv.
