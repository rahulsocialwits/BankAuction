# Baseline numbers

Fill in during P01. Every figure needs a source and a date. If you cannot get it without touching production data, write NOT VERIFIED and name who must run the query (docs/launch/data/baseline_queries.sql is read-only SQL for the operator).

| Metric | Value | Source | Date | Notes |
|---|---|---|---|---|
| Published properties | 9,304 | live /properties total | 2026-10-09 | |
| Active (current rule, includes undated) | 6,988 | live /properties?status=active | 2026-10-09 | suspect, see P04 |
| Completed | 2,356 | live /properties?status=completed | 2026-10-09 | 40 properties are in both active and completed (allowed) |
| Properties with a canonical city | ~4,068 | sum of /cities totals | 2026-10-09 | approximate |
| Properties with no canonical city | ~5,236 | published minus above | 2026-10-09 | approximate |
| Of those: geoCheckedAt null | NOT VERIFIED | operator query Q2 | | OWNER ACTION: operator runs Q2. Blocks P05 backfill planning |
| Of those: checked but city null | NOT VERIFIED | operator query Q3 | | OWNER ACTION: operator runs Q3. Blocks P05 backfill planning |
| Properties with valid coordinates | NOT VERIFIED (live map shows 0 pins) | operator query Q4 | | OWNER ACTION: operator runs Q4. Needed by P09 |
| Rounds with no start and no end date | NOT VERIFIED | operator query Q5 | | OWNER ACTION: operator runs Q5. Sizes the P04 undated change |
| Properties with no category | ~385 | property-types page sum 8,919 vs 9,304 | 2026-10-09 | |
| CI status on main | PASS: workflow 'CI (tests and type-check)' succeeded on every main commit checked, incl. 437188c (PR #25), 6404be2 (PR #26), 8a58ca4 (PR #27), 6916147 (PR #29), 5e1d783 (PR #28) | GitHub Actions run list via API | 2026-10-09 | CI runs prisma generate, tsc and tests; it does not run the production build, see P02 WP2.1 |
| Vercel production deployment | READY for commit 8a58ca4 with successful compile, TypeScript and static-page generation (read-only inspection by another assistant, not re-verified by me) | Vercel project metadata and build logs | 2026-10-09 | Owner may re-check in the Vercel dashboard |
| AI location job running / last run | NOT VERIFIED | admin Data Engine | | OWNER ACTION: screenshot Data Engine run history and Settings > AI, plus operator query Q9. Needed by P05 |

## P01 exceptions carried forward (not blockers for P02-P04)
- Q1-Q9 operator query results are outstanding. P05 must not plan or run a location backfill until Q2, Q3 and Q9 are recorded here.
- The admin console has not been audited; location-job history is unknown.
- Production smoke test after the latest deployment has not been recorded (homepage, search, city, map toggle were checked on 2026-10-09 earlier; detail, sign-in, pricing and admin were not exercised end to end).
- Vercel shows CRON_SECRET, ADMIN_SESSION_SECRET and ADMIN_PASSWORD flagged as readable secrets: owner to review in Vercel settings (do not paste values anywhere).
