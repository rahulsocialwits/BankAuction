# Prompt for P14 - Payments, invoices and refunds

Paste everything inside the fence.

````text
You are an engineer working on BankAuction.co (GitHub repo rahulsocialwits/BankAuction, production https://auction.bizsocio.com). You are doing **P14 - Payments, invoices and refunds** of a 20-phase launch plan.

## 0. Read first, in this order
1. docs/launch/PROTOCOL.md (operating manual and hard rules)
2. AGENTS.md (this repo's Next.js has breaking changes; read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code)
3. docs/launch/PHASE_STATUS.md, docs/launch/DECISIONS.md, docs/launch/BASELINE.md
4. docs/launch/phases/P14-payments-billing.md (this phase's full spec)
5. docs/launch/data/requirements.csv rows where phase = P14, and docs/launch/data/issues_2026-10-09.csv rows where phase = P14
6. Spec sections 7.4 in docs/launch/spec/PRD_v1.0.txt

## 1. Preconditions
Depends on: P13. Check PHASE_STATUS.md. If a dependency is not DONE, stop and tell me which one and why. Do not work around it.

## 2. Goal
Money is collected safely: verified payments grant access once; invoices and refunds follow approved rules. Sandbox only until sign-off.

## 3. Known problems (from the 9 Oct 2026 audit). Verify each still exists before acting.
- Payment model, PaymentSettings and admin payments page exist; no checkout or webhook route found.
- Site states online payment is not live.
- No invoices, credit notes, renewal or cancellation flows.

## 4. Step 1 - AUDIT FIRST (change nothing yet)
Answer each question from evidence (code, tests, read-only GET requests to the live site, BASELINE.md). Classify each as DONE / PARTIAL / MISSING / WRONG / UNKNOWN and cite the file, test or URL. Resolve UNKNOWN by checking.

1. What does lib/payments/settings.ts and the admin payments page do?  -> look at: src/lib/payments/settings.ts; src/app/admin/(shell)/payments
2. Is there any order-creation or verification code?  -> look at: grep -rn razorpay src; api routes
3. Which gateway and test keys does the owner have?  -> look at: ENVIRONMENT.md; ask owner

Post the filled audit table, then CONTINUE to Step 2 in the same session. Do not wait for me unless you are blocked by something listed in section 10.

## 5. Step 2 - DECIDE (use these rules)
- Use test/sandbox keys only. Never charge a real customer during build.
- Server creates the order; client success redirect never grants access; only a signed webhook or server verification does.
- Idempotency key per order; duplicate webhooks are no-ops.
- Invoices and GST per CA rules; do not invent numbering.
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
List the work packages you will do, in order, each as its own branch and PR (branch name like `p14-wpX.Y-short-name`). Mark any that need owner approval and do those last or prepare them without executing.

Work packages available in this phase:
- WP14.1 Order creation + verification + signed webhook + idempotency.
- WP14.2 Entitlement grant on verified payment.
- WP14.3 Failure, retry, duplicate handling and customer messages.
- WP14.4 Invoice generation and numbering (CA-approved).
- WP14.5 Refund, cancellation, renewal, expiry, grace period.
- WP14.6 Reconciliation view in admin.

## 7. Step 4 - IMPLEMENT
Smallest change that fits the existing patterns. Extend central helpers (src/lib/domain/auctionLifecycle.ts, src/lib/queries/publishedWhere.ts, src/lib/pipeline/locations.ts) instead of duplicating logic. Add or update tests in the same PR. Commit with clear messages. Open a PR per work package with the report template from PROTOCOL.md section 9.

## 8. Step 5 - TESTS REQUIRED
- AT-09 payment integrity.
- AT-10 renewal/refund.
Run tests, lint, type-check and build where the environment allows. Paste real output. If something cannot run (for example Prisma client generation in a sandbox), say exactly that. A test not run is not a test passed.

## 9. Step 6 - EXIT GATE (all must be true, with evidence)
- [ ] AT-09 and AT-10 pass in sandbox.
- [ ] CA/legal approvals recorded.

## 10. STOP AND ASK the owner before
- Owner: gateway account, refund policy, CA invoice rules, go-live of live keys.
- applying any migration, writing production data, adding a paid service, enabling real payments or messaging, merging, or deploying.
Ask in plain language: what, why, risk, rollback, recommended default.

## 11. DO NOT
- Do not use live payment keys or charge any real customer.
- Do not grant access from the client success redirect.
- Do not merge any PR or deploy.
- Do not access findauction.in or bypass any site restriction.
- Do not connect to or change the production database, settings or data.
- Do not add sources, change source permissions, or change unrelated features.
- Do not invent data. Say NOT VERIFIED when you did not check.
- Do not create another audit/verification framework; use the phase file and tests.

## 12. Rollback for this phase
Disable checkout flag; entitlements granted in sandbox are removed by a documented script.

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
