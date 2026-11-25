# M18–M24 integrated offline review batch

Scope: read-only project review and defensive accounting. No live order placement, coordinated trading, signing, automated market intervention, or real settlement. No external data was connected by this change.

| Module | Delivered in this batch | Remaining acceptance |
|---|---|---|
| M18 Treasury | Historical liabilities and other assets, interval-to-report digest association; no cross-interval sums | Independent ledger and wallet ownership parity |
| M19 OMS | Per-record receipt coverage and stale/conflicting outcome classification | Real archived receipt parity; no executable OMS |
| M20 Risk | Historical conflicting orders remain critical; aggregate link conflicts | External risk evidence and recovery drills |
| M21 Market | Empty trade records explicitly NO_RECORDS; linked report association | Independent reserve, history and candle parity |
| M22 UI | Read-only project business review panel, export, scoped async refresh | Actual browser layout and failure acceptance |
| M23 Integration | Pure review tests plus GET API contract test, included in npm test / accept:all | CI for this commit and operator acceptance |
| M24 Data | Readiness checklist for exact identity, closed intervals and evidence; external gates NOT_RUN | Actual read-only Localnet preflight and independent comparison |

Run npm test and npm run accept:all. Existing read-only preflight is opt-in and requires COOK_ACCEPT_RPC, COOK_ACCEPT_GENESIS, COOK_ACCEPT_EVIDENCE. Use a private loopback Localnet endpoint, independent genesis pin and bounded finalized receipt samples; see docs/implementation/local-read-acceptance-v1.md. No endpoint or sample is assumed here. Data readiness in the business projection is not authorization, and declared report links are not authenticated chain evidence.

Business review does not prove interval completeness, detect every overlap, or establish actual live cash, available depth, ownership, or valuation. It identifies multiple different digests with the same declared interval and never adds interval totals. The UI remains a review terminal.
