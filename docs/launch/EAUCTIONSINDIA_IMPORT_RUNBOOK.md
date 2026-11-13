# eAuctionsIndia Maharashtra import: how it works and how to run it

Everything here is limited to eAuctionsIndia. BAANKNET and every other source are untouched. Status of the live collection: **blocked** (see "What is blocked").

## Why TypeScript and not Python
The repository has no Python anywhere. The database writer that already handles duplicates, provenance, geography and status rules is `importRecords` (`src/lib/import/csvImport.ts`, TypeScript, Prisma); a separate Python importer would write around it and could create duplicates or overwrite verified fields. The scheduler is GitHub Actions, which runs the same TypeScript command. So the importer reuses the existing parser, `importRecords`, the batch / checkpoint / retry runner and the permission gate.

## The two gates (nothing is imported without both)
1. **Verified institution**: the listing's institution must equal one of the institutions CONFIRMED in `docs/launch/eauctionsindia-institution-mapping.csv` (exact match after normalisation, never similar names). A listing with no institution is excluded and logged.
2. **Verified Maharashtra location** (`maharashtraLocation.ts`): decided only from the property's own state field, district / city / area, address text and PIN. The bank, branch, auction office and the page it was found on are never evidence. Missing, ambiguous (e.g. "Aurangabad") or conflicting evidence = review, not imported.

Excluded listings are written to `import-reports/eauctions-excluded-<time>.jsonl` with the reason. Nothing is ever deleted.

## Commands (Windows CMD, from the project folder)
```
npx tsx scripts/eauctionsindia-institutions.ts                 rebuild the 105-entry reconciliation (read-only)
npm run eauctions:maharashtra:preview                           dry run + read-only duplicate check, writes nothing
npm run eauctions:maharashtra:import                            live crawl (gated, stops on any refusal), then imports what qualifies
```
Import needs `EAUCTIONS_AUTHORIZED=yes`, `EAUCTIONS_AUTH_NOTE=<where the operator's written permission is>` and the scope flag of the pages used (`EAUCTIONS_SCOPE_LOCAL_FILE=yes` for hand-saved pages, `EAUCTIONS_SCOPE_AUTOMATED=yes` for crawled pages), set only after the written permission has been read. Resume = run the same command again.
Extra options: `--directory=<saved institution directory page>` (+ `--directory-complete` if it holds the whole directory), `--skip-institution-filter` (explicitly turns the institution rule off for one run; printed as a warning).

## Schedule (GitHub Actions)
`.github/workflows/eauctions-import.yml`: daily 21:30 UTC = 03:00 IST, one run at a time (concurrency group), 45-minute timeout, resume state cached between runs, run summary and reports kept as artifacts. **Not active until the owner sets** the repository variable `EAUCTIONS_CRON_ENABLED=true` and the secrets `DATABASE_URL`, `DIRECT_URL`, `EAUCTIONS_AUTH_NOTE` (optionally `EAUCTIONS_ALLOW_HEADER_NAME` / `EAUCTIONS_ALLOW_HEADER_VALUE`) and variable `EAUCTIONS_SCOPE_AUTOMATED=yes` (only with written permission for automated collection). A manual run (Actions > Run workflow) defaults to a dry run of 2 pages. The existing 5-minute tick (`tick.yml`) is not changed.

## What is blocked
- eAuctionsIndia answers automated requests (even robots.txt) with a Cloudflare challenge. It is not bypassed. Live collection needs the operator to allow-list `BankAuctionBot/1.0` (or give a bulk export / API) and to confirm in writing that we may store and show the records.
- No eAuctionsIndia institution **directory** page was supplied, so only the institutions shown on the saved pages are CONFIRMED (4 of 105); the others are UNCERTAIN, not MISSING. To settle them, save the site's institution directory page(s) in the project folder and run the institutions command with `--directory=<file>`.
