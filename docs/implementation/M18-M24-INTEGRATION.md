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

## P0 remediation

Separate original revision from verified profile-only applicability, preserve immutable hashes, and invalidate on any non-profile or symbol change. Do not reuse close reviews across revisions. Shared evidence index feeds both risk and business review; missing legacy receipt digests are unknown, all newly derived receipt outcomes carry the input digest. Archive commits for close and receipt reviews compare a same-transaction digest of project head, non-close archive hashes and order heads; close outputs become stale after evidence changes. No data migration, real environment acceptance or execution permission. This is conservative compatibility, not a full independent version schema for all kinds of metadata or business mutations.

Receipt guards include project head, historical report link hashes and order heads, not their own output archive, preserving idempotency. Close guards include all non-close archive hashes and order heads. Two-connection regression verifies changed order heads are rejected even if Project revision is unchanged.
