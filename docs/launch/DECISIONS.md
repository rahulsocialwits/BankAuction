# Owner decisions log

Any LLM or developer: read this BEFORE starting a phase. If a decision a phase needs is OPEN, use the default shown, say so in the PR, and keep the change reversible (flag).
Only the owner changes STATUS. Record the owner's answer verbatim with the date.

**Owner instruction (2026-10-09):** "Decisions: defaults for D01–D16." This approves the recommended defaults below. Where a default defers a launch commitment or production action, that action remains gated; this approval is not permission to change production data/settings, activate payments/messaging, merge, or deploy.

| ID | Decision | Default / recommendation | Needed by | Status | Owner answer (date) |
|---|---|---|---|---|---|
| D01 | Undated auction rounds | Exclude from active headline counts; report separately (spec 3.2) | P04 | DECIDED | "defaults for D01–D16" — approved default (2026-10-09) |
| D02 | City search behaviour for unverified listings | Return verified results and a clearly labelled link for additional unverified mentions; do not silently broaden results | P05 | DECIDED | "defaults for D01–D16" — approved default (2026-10-09) |
| D02b | Free-tier delay and masking | If/when free vs paid entitlements are implemented, use the proposed 48-hour delay and masked fields; define exact fields in P13 before implementation | P13 | DECIDED | "defaults for D01–D16" — approved default (2026-10-09) |
| D03 | Plan prices and GST wording | Do not activate paid plans or payments while site prices (2,500/4,000/7,000) conflict with spec proposals (1,499/2,699/4,999); require a separately approved price/GST schedule before paid launch | P13, P14 | DECIDED | "defaults for D01–D16" — approved default (2026-10-09) |
| D04 | Map provider and budget | Use OpenStreetMap tiles for initial discovery only with attribution; review traffic limits before scale and do not add a paid provider without separate approval | P09 | DECIDED | "defaults for D01–D16" — approved default (2026-10-09) |
| D05 | Risk rubric | Use descriptive, evidence-backed flags; no numeric risk score | P17 | DECIDED | "defaults for D01–D16" — approved default (2026-10-09) |
| D06 | Launch mode | Free discovery launch targeted for 20 Oct 2026; paid plans only after P13–P14 gates pass | P01 | DECIDED | "defaults for D01–D16" — approved default (2026-10-09) |
| D07 | Borrower-data and media policy | Do not display or sell borrower names; use neutral placeholders unless media rights are cleared | P11, P17 | DECIDED | "defaults for D01–D16" — approved default (2026-10-09) |
| D08 | Language launch waves | English-first; add languages only after owner-approved wave and translation-quality review | P18 | DECIDED | "defaults for D01–D16" — approved default (2026-10-09) |
| D09 | MMR membership list | Draft only; do not code or publish membership claims until the list is validated | P10 | DECIDED | "defaults for D01–D16" — approved default (2026-10-09) |
| D10 | Alert and mail providers | Email first; defer WhatsApp and push notifications | P12, P15 | DECIDED | "defaults for D01–D16" — approved default (2026-10-09) |
| D11 | Partner commission schedule and team/Private Desk scope | Defer partner commissions and team/Private Desk features until a written schedule and service scope are separately approved | P19 | DECIDED | "defaults for D01–D16" — approved default (2026-10-09) |
| D12 | Legal service boundary | State that the platform is informational and not legal advice; obtain appropriate review before offering professional services | P17 | DECIDED | "defaults for D01–D16" — approved default (2026-10-09) |
| D13 | Load target and budget | Do not promise 5,000 concurrent users until a scoped load test, capacity plan and budget are approved | P20 | DECIDED | "defaults for D01–D16" — approved default (2026-10-09) |
| D14 | Source register and permissions | Per-source approval; no source expansion or permission changes without separate written approval | P06 | DECIDED | "defaults for D01–D16" — approved default (2026-10-09) |
| D15 | Canonical city names (Vasai spelling; Aurangabad/Chhatrapati Sambhajinagar for Maharashtra only) | Use "Vasai" as the canonical display label; keep any alias handling explicit and tested. Merge Aurangabad/Chhatrapati Sambhajinagar only for Maharashtra records; do not apply a global merge | P05 | DECIDED | "defaults for D01–D16" — approved default (2026-10-09) |
| D16 | Production data runs (location backfill, coordinates) | Each production run requires separate written approval, a before-snapshot, sample review and rollback plan; this decision does not authorize a run | P05, P09 | DECIDED | "defaults for D01–D16" — approved default (2026-10-09) |
