# docs/launch: the 20-phase launch system

Start with `PROTOCOL.md`. Files:
- `PROTOCOL.md` operating manual for any LLM or developer (rules, loop, report template, starter prompt)
- `PROMPTS.md` and `prompts/` copy-paste prompt for each of the 20 phases, plus a master 'resume' prompt
- `PHASE_STATUS.md` progress tracker (update in every PR)
- `DECISIONS.md` owner decisions with defaults
- `BASELINE.md` numbers to establish in P01
- `phases/P01..P20` one file per phase: goal, entry audit, decision rules, work packages, tests, exit gate, approvals, rollback
- `data/requirements.csv` all 118 requirement rows mapped to phases; `issues_2026-10-09.csv`; `acceptance_tests.csv`; `live_audit_2026-10-09.csv`; `baseline_queries.sql` (read-only, operator runs)
- `spec/PRD_v1.0.txt` the product specification v1.0 (9 Oct 2026)

Origin: Product Requirements and Functional Specification v1.0, plus the code and live-site audit of 9 Oct 2026.
