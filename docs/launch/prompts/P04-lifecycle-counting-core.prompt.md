# Prompt for P04 - Lifecycle and counting core

Paste everything inside the fence.

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P04 - Lifecycle and counting core** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P04-lifecycle-counting-core.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P04, and docs/launch/data/issues_2026-10-09.csv rows where phase = P04
6. Spec sections 3.2, 3.3 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P03. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
One central rule decides status and counts everywhere. Counts equal what users see.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- Undated open rounds currently count as ACTIVE; spec says exclude and report separately.
- 'Active' is 6,988 of 9,304 (75%), likely inflated.
- Cancelled and Postponed are excluded from active but not reported separately.
- /auctions has no Auction Today view.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. Which functions decide status and where else is status computed?  -> look at: src/lib/domain/auctionLifecycle.ts, deriveAuctionStatus.ts, resolveAuctionStatus.ts; grep for 'status' comparisons in src/app and src/components
2. What does DECISIONS.md D01 say about undated rounds?  -> look at: docs/launch/DECISIONS.md
3. Are IST day boundaries tested?  -> look at: tests/auctionLifecycle.test.ts, resolveAuctionStatus.test.ts
4. Which pages count properties and do they all use publishedWhere/activeAuctionWhere?  -> look at: grep -rn count src/app src/lib/queries

Post the filled audit table, then CONTINUE to Step 2 in the same session. Do not wait for me unless you are blocked by something listed in section 10.

## 5. Step 2 - DECIDE (use these rules)
- If D01 is OPEN, use the default (exclude undated from the active headline) but ship it behind a flag and state it in the PR.
- Never add a second status implementation. Extend the central helper and its tests.
- Report counts for: active, completed, cancelled, postponed, undated, no-round, unassigned city.
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
List the work packages you will do, in order, each as its own branch and PR (branch name like `p04-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP4.1 Add Undated/Needs-Review handling to the central helper with boundary tests.
- WP4.2 Add a data-quality counts function used by admin and by tests (active, completed, cancelled, postponed, undated, end-before-start, no-round).
- WP4.3 Replace any component-local status logic.
- WP4.4 Add 'today' to status vocabulary where the UI lists statuses.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- AT-02 lifecycle boundaries incl. Undated, Cancelled, Postponed.
- AT-03 distinct property counting.
- AT-04 no-round properties.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] AT-02, AT-03, AT-04 pass in CI.
- [ ] Homepage, city, search and admin counts come from the same helper.
- [ ] Undated count visible to admin.

## 10. STOP AND ASK the owner before
- Owner confirms D01 (undated rule).
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not create a second status/counting implementation.
- Do not change source facts or dates to make a status look right.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Revert PR; flag off restores previous counting.

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
