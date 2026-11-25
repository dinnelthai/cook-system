# R01–R11 consolidation — first implementation

Baseline 48cefdb. Runtime projection uses current persisted project identity and exact linked historical treasury intervals; cash, inventory, receivables, PnL and NAV stay separate per interval. Contradictions suppress the interval; no latest-selection or live assets. Existing business endpoint/export includes runtime. Terminal displays work items and assets before collapsed detailed review.

R02/R07/R08: fixed synthetic scenario acceptance calls existing terminal report/settlement test workflow, portfolio risk engine and canonical stress fixture; no paper or live order workflow. R05: synthetic LP statement arithmetic checks units, fee receivable and cash posting; does not assume pool reserve ownership or executable position valuation. R06: existing market binding and historical pool evidence exposed. R09: business overview first. R10: regression includes fixture archive roundtrip and risk failures, not real browser/localnet acceptance. R03: existing participant suite preserved, no new decision model. R11: this matrix records gaps; final independent review remains open.

Open: actual project lifecycle execution, participant behavioral validation, real LP position accounting/valuation, full portfolio risk inputs, operational E2E, real browser and independent data. R01–R11 are not all complete. M50–M52 remain deferred. No signing, submission or market intervention added.


## R01 — revision and evidence-pinned runtime selection

GET /api/projects/:id/runtime reads one verified local snapshot. POST to the same route is a read-only selection, requiring expected_revision, expected_context_id, and report_link_archive_id. The context digest includes every archive hash (including close reviews), order head and project aggregate, so new evidence at the same revision invalidates a stale selection. Existing business review includes the same context ID. Terminal offers an explicit historical interval selector, guarded against stale responses and context changes. No default interval, cross-interval aggregation or mutation. Correct work-item status distinguishes market registration from evidence and incomplete financial endpoints. Two new tests cover API and SQLite context invalidation. This is R01 offline read-context delivery; workflow execution and external evidence validation remain outside the implemented scope. R02 onward are not claimed complete.

## R02 — mathematical business call paths

See [R02-MATH-BUSINESS-CALL-PATHS.md](R02-MATH-BUSINESS-CALL-PATHS.md). R01 CI passed (45594148766). R02 corrects candle consumer status vocabulary and adds a regression. R03 remains next; no empirical or operational model completion claim.


## R03 — mixed participant data conditions

R02 CI passed (45596359740). Fixed mixed observation cohorts (complete, delayed, outage, irregular) run concurrently against the same completed synthetic fixture using the existing observation clock and accounting replay. Eight subchecks per seed cover data accounting, no lookahead, separate recovery, passive fixture role immutability, canonical input preservation, and no observation feedback. Integrated into the existing validation suite, without changing trading decisions or generator version. Two regression tests. R03 is partial: behavior parameters are still unused by trade generation and empirical role behavior is uncalibrated. No independent market demand, actual arbitrage, MEV policies, or execution capability established. R04 follows after CI.


## R04 — scoped project/account asset reconciliation

R03 CI passed (45597277906). Compare existing canonical account-set totals with the existing runtime asset fields for each linked interval (cash, token quantity, cost basis, inventory value, creator receivable, liabilities, other assets and NAV). No second ledger or aggregation. Missing or partial accounts remain unknown, explicit zero remains zero. Conflicting or malformed totals suppress all interval asset numbers and surface an overall review finding. Matching registered labels do not establish ownership. Explicit interval detail exposes the eight check states. Four regression tests. R04 historical reconciliation advanced; per-wallet live balances, LP valuation and independently verified coverage remain open. R05 follows after CI.


## R05 — synthetic passive LP accounting mark

R04 CI passed (45597635208). Extend the canonical LP statement with a same-pool, same-cutoff supplied fungible-share fixture and a supplied rational base/quote mark. Exact integer floor arithmetic uses the existing integer helpers. Explicit distributable assets only; no virtual reserves, protocol fee buckets or assumption that a pool reserve is an owned asset. The mark excludes separate fee cash and fee receivables. Invalid share, stale scope, malformed amounts or ledger discrepancies suppress the mark. Five regression tests and two new business scenario checks (13 total). This is a synthetic accounting mark, not a PumpSwap redemption formula, real position valuation, or project NAV inclusion. Actual LP ownership, protocol-specific claim rules and independent valuation remain open; R06 next after CI.


## R06 — historical market state and data-quality integration

R05 CI passed (45598036893). Closed market quality now calls the existing market-quality analyzer after canonical candle-event parity, retaining only bounded descriptive record count and source-quality status. The runtime keeps closed curve intervals, migration milestone evidence, and pool replay snapshots separate, with exact report-link digest and count checks. No inferred active venue, shared timestamp, live depth, market intervention or signal. Legacy evidence remains unknown. Three regression tests cover canonical analyzer integration, interval separation, and contradictory counts. The terminal displays the historical market state. R06 historical integration advanced; actual synchronized chain state and external parity remain pending. R07 next after CI.
