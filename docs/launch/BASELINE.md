# Baseline numbers

Fill in during P01. Every figure needs a source and a date. If you cannot get it without touching production data, write NOT VERIFIED and name who must run the query (docs/launch/data/baseline_queries.sql is read-only SQL for the operator).

| Metric | Value | Source | Date | Notes |
|---|---|---|---|---|
| Published properties | 9,304 | live /properties total | 2026-10-09 | |
| Active (current rule, includes undated) | 6,988 | live /properties?status=active | 2026-10-09 | suspect, see P04 |
| Completed | 2,356 | live /properties?status=completed | 2026-10-09 | 40 properties are in both active and completed (allowed) |
| Properties with a canonical city | ~4,068 | sum of /cities totals | 2026-10-09 | approximate |
| Properties with no canonical city | ~5,236 | published minus above | 2026-10-09 | approximate |
| Of those: geoCheckedAt null | NOT VERIFIED | operator query Q2 | | decides P05 approach |
| Of those: checked but city null | NOT VERIFIED | operator query Q3 | | decides P05 approach |
| Properties with valid coordinates | NOT VERIFIED (live map shows 0 pins) | operator query Q4 | | |
| Rounds with no start and no end date | NOT VERIFIED | operator query Q5 | | decides P04 impact |
| Properties with no category | ~385 | property-types page sum 8,919 vs 9,304 | 2026-10-09 | |
| CI status on main | NOT VERIFIED | GitHub Actions | | |
| Vercel production deployment | NOT VERIFIED | Vercel | | |
| AI location job running / last run | NOT VERIFIED | admin Data Engine | | |
