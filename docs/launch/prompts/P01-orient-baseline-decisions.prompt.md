# Prompt for P01 - Orient, baseline and owner decisions

Paste everything inside the fence.

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P01 - Orient, baseline and owner decisions** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P01-orient-baseline-decisions.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P01, and docs/launch/data/issues_2026-10-09.csv rows where phase = P01
6. Spec sections 0, 17, 18, 19 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: none. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Know exactly what exists, what is broken and what the owner has decided, before anyone changes code or data. Produce the numbers every later phase needs.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- ~56% of published properties have no canonical city (Nashik: 8 by city filter vs 68 by keyword).
- Map shows 0 pins in production (coordinates missing).
- Admin console and CI/Vercel results for PRs #25/#26 were never audited.
- Owner decisions in DECISIONS.md are mostly OPEN.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. Is CI green on main, and what do the Vercel production deployment logs say?  -> look at: GitHub Actions ci.yml runs; Vercel dashboard (ask owner for read access or screenshots)
2. Which environment variables and services exist (DB, AI relay, cron secret, payment keys)?  -> look at: docs/ENVIRONMENT.md; Vercel settings (names only, never print values)
3. How many published properties have: geoCity set, geoCheckedAt set but no city, coordinates, a dated round, a category?  -> look at: Read-only counts: docs/launch/data/baseline_queries.sql run by the OPERATOR, or admin Dashboard/Data Engine screenshots
4. Is the AI location job (enrichLocations in src/lib/pipeline/geo.ts) running and draining its backlog?  -> look at: admin Data Engine / run history; Settings > AI; src/lib/pipeline/tick.ts
5. What does DECISIONS.md already say?  -> look at: docs/launch/DECISIONS.md
6. Are the test suite and type-check healthy?  -> look at: npm test, npx tsc --noEmit (needs generated Prisma client; if the sandbox cannot generate it, say so)

Post the filled audit table, then CONTINUE to Step 2 in the same session. Do not wait for me unless you are blocked by something listed in section 10.

## 5. Step 2 - DECIDE (use these rules)
- If a number cannot be obtained without touching production data, do NOT guess: write it as NOT VERIFIED and ask the owner or operator for the read-only query result.
- Never run SQL against production yourself. Provide the query file and ask the operator.
- Every open decision gets a recommended default so the owner can answer 'defaults'.
- Only work on PARTIAL, MISSING or WRONG items. For DONE items add a regression test, do not rebuild.
- If a decision you need is OPEN in DECISIONS.md, use the stated default, keep the change reversible (flag), and say so in the PR.

    ## 5b. Operating mode (read carefully)
    - You are expected to DO the work, not only report. After the audit, carry on through every work package that does not need owner approval. Stop only at the approval gates in section 10, or when a real blocker stops you.
    - Capability check (do this once, right after reading): can you read the repo, create a branch, commit, push and open a PR? Can you run commands (tests, type-check)? State the answer in one line.
      - If you CAN write: do the work in branches and PRs as described.
      - If you CANNOT write: do not stop. Produce the exact file contents or a unified diff for every change, with the target path and branch/PR title, so a person can apply it in minutes.
      - If you CANNOT run commands: say so, write the tests anyway, and list the exact commands to run.
    - Open owner decisions: use the default in DECISIONS.md as a PROVISIONAL default. Label it 'provisional default, not owner-approved' everywhere. Never write 'approved' or 'decided' on the owner's behalf. Keep the work reversible.
    - Things only a human can do (run read-only SQL, check Vercel or GitHub settings, approve a data run): do not wait idle. Prepare a short numbered checklist for that person with the exact query or click path and what to send back, and continue with everything else.
    - Never stop after the audit alone. If you did nothing but audit, you have failed this task.
    

## 6. Step 3 - PLAN
List the work packages you will do, in order, each as its own branch and PR (branch name like `p01-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP1.1 Fill docs/launch/BASELINE.md with the numbers above (source + date for each).
- WP1.2 Update DECISIONS.md with each owner answer; mark the phases they unblock.
- WP1.3 Confirm which phases are launch-critical for the chosen launch mode (free discovery launch vs paid launch).
- WP1.4 Record the root cause of the missing-city backlog (job not running vs checked-with-no-city). This decides P05.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- No code tests. Evidence: BASELINE.md complete, every figure sourced.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] BASELINE.md has every figure or an explicit NOT VERIFIED with an owner action.
- [ ] DECISIONS.md D01-D08 answered or defaulted in writing.
- [ ] CI/Vercel state recorded.

## 10. STOP AND ASK the owner before
- Owner answers decisions. Owner or operator runs read-only baseline queries.
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not run any SQL yourself. Do not change code.
- Do not guess numbers: write NOT VERIFIED.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Documentation only. Nothing to roll back.

## 13. Final output (exactly this structure)
1. Entry audit table (question | evidence | classification)
2. Decisions taken and why (cite rules and any OPEN decision you defaulted)
3. What changed (files, PR links) and what you deliberately did not change
4. Tests: added / run / result (paste output) / NOT RUN
5. Stages, stated separately: implemented | tested | merged | deployed | production smoke-tested (yes / no / NOT VERIFIED)
6. Risks, rollback, monitoring signal
7. Needs from owner (approvals and decisions)
8. PHASE_STATUS.md updated in your PR: yes/no
9. Human checklist: the exact things a person must do next (queries to run, settings to check, approvals to give), each with what to send back
Then stop at the end of THIS phase (not earlier). Do not start the next phase until I say so.
````
