# Owner decisions log

Any LLM or developer: read this BEFORE starting a phase. If a decision a phase needs is OPEN, use the default shown, say so in the PR, and keep the change reversible (flag).
Only the owner changes STATUS. Record the owner's answer verbatim with the date.

| ID | Decision | Default / recommendation | Needed by | Status | Owner answer (date) |
|---|---|---|---|---|---|
| D01 | Undated auction rounds | Exclude from active headline; report separately (spec 3.2) | P04 | OPEN |  |
| D02 | City search behaviour for unverified listings | Verified results + labelled 'N more mention <city>, not yet location-verified' link (no silent broadening) | P05 | OPEN |  |
| D02b | Free-tier delay and masking | Not decided (spec proposes 48h delay + masked fields) | P13 | OPEN |  |
| D03 | Plan prices and GST wording | Not decided. Site shows 2,500/4,000/7,000; spec proposes 1,499/2,699/4,999 + Founding/Single/Team/Desk | P13 | OPEN |  |
| D04 | Map provider and budget | Keep OpenStreetMap tiles only if acceptable for launch traffic; else approve a paid provider | P09 | OPEN |  |
| D05 | Risk rubric | Descriptive evidence-backed flags, no numeric score | P17 | OPEN |  |
| D06 | Launch mode | Free discovery launch on 20 Oct 2026; paid plans after P13-P14 gates | P01 | OPEN |  |
| D07 | Borrower-data and media policy | Do not display or sell borrower names; neutral placeholders unless media rights cleared | P11, P17 | OPEN |  |
| D08 | Language launch waves | Not decided | P18 | OPEN |  |
| D09 | MMR membership list | Draft only; do not code until validated | P10 | OPEN |  |
| D10 | Alert and mail providers | Email first; WhatsApp/push later | P12, P15 | OPEN |  |
| D11 | Partner commission schedule and team/Private Desk scope | Not decided | P19 | OPEN |  |
| D12 | Legal service boundary | Not decided | P17 | OPEN |  |
| D13 | Load target and budget | Spec proposes 5,000 concurrent users; unapproved | P20 | OPEN |  |
| D14 | Source register and permissions | Per-source approval; no expansion | P06 | OPEN |  |
| D15 | Canonical city names (Vasai spelling; Aurangabad/Chhatrapati Sambhajinagar for Maharashtra only) | Maharashtra-only merge for Aurangabad; owner picks Vasai spelling | P05 | OPEN |  |
| D16 | Production data runs (location backfill, coordinates) | Each run needs written approval, before-snapshot, sample review, rollback | P05, P09 | OPEN |  |
