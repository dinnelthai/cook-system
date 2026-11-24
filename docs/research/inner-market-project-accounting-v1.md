# Inner-market project accounting — V1

Scope: historical, read-only accounting for a single disclosed project and quote asset during the Pump bonding-curve phase. No API integration, transaction construction, trading policy, or execution optimization.

## Cash conservation

Each economic posting has a unique ID, project ID, quote asset, status, reconciliation status, kind and unsigned integer base-unit amount. Only FINALIZED postings with PASS reconciliation affect cash. Failed transaction fees are separate finalized expense postings, not failed trades. A signature can contain several distinct economic postings.

ClosingCash = OpeningCash + CapitalIn - CapitalOut + TradeNetReceipts - TradeCashCosts + ReceivedCreatorFees + OtherIncome - NonTradeExpenses.

Opening cash includes capital already present at the start of the reporting interval. Never post it again as a capital contribution. Internal transfers within the project are not capital contributions, withdrawals, revenue or expense.

Trade cash costs and trade net receipts include the attributable fees already booked in trade accounting. Do not also post those fees as project expenses.

## Realized project profit

ProjectRealizedNetPnL = TradeRealizedPnL + ReceivedCreatorFees + OtherIncome - NonTradeExpenses.

This is a cash-basis management report, not statutory accounting or tax advice. Accrued but uncollected fees are not cash income. Capital contributions, withdrawals and unrealized asset values are not realized profit.

The report is incomplete if historical coverage is not established, a posting is unresolved, closing cash does not reconcile, or trade realized PnL is unknown. A reconciled balance alone cannot prove complete history.

## Current implementation

- src/inner-market/project-accounting.mjs: independent cash reconciliation and realized profit report.
- test/inner-market-project-accounting.test.mjs: conservation, negative profit, duplicates, incomplete data and asset/project isolation.

The caller must supply reconciled postings, a same-cutoff closing balance and a trade PnL figure for the same scope and reporting interval. Cross-ledger matching is now implemented in ledger-audit.mjs. Transfer basis adjustments, independent posting provenance verification, durable storage and historical snapshot recovery remain outstanding.

## Acceptance before integration

1. Cross-check finalized cash trade postings against the inventory ledger at identical reporting cutoffs.
2. Reconcile every internal/external transfer, including cost-basis adjustments and network expenses.
3. Keep accrued creator fees separate from verified receipts; prevent duplicate income.
4. Use explicit missing-data states; never silently substitute zero for unknown profit.
5. Validate historical NAV and drawdown using contribution-adjusted snapshots, not raw cash balances.
6. Preserve the inner-curve completion boundary and keep the external local API untouched until the contract is supplied.

## Historical cross-ledger audit

The audit requires identical project ID, quote asset, token mint, opening cutoff and closing cutoff metadata for both ledgers. This metadata is a caller attestation; the function does not independently authenticate the underlying source.

Every positive historical trade cash posting must reference exactly one inventory journal event. Its side and net cash amount must match that event. Duplicate references, unmatched postings, missing postings and mismatched aggregates are reported as exceptions. Zero-net-cash inventory events need no positive cash posting.

The inventory journal totals must match its ledger aggregates and the finalized cash posting totals. Both cash and inventory snapshots must reconcile, history completeness must be established, and cost basis and realized PnL must be known before releasing final project PnL. Matching aggregate balances alone is insufficient.

Tests cover equal totals with swapped event attribution, missing and duplicate references, mixed mint or cutoff, incomplete coverage and tampered totals.

This remains an offline financial audit. It neither selects trades nor generates execution recommendations.

## Creator receivable audit

creator-fee-accounting.mjs reconciles historical creator receivables and cash receipts for a common project, quote asset, token mint and reporting interval. Inputs are independently verified entitlement and cash records, not inferred protocol fees. ClosingReceivable = OpeningReceivable + Accrued - Received - WrittenOff. Each received-fee event must match one finalized cash posting by event ID and amount. Missing or duplicate receipts, unverified events and missing or inconsistent snapshots block verified income. Protocol fees do not qualify as creator entitlements. Receipt amounts are gross cash credits; separately verified network expenses are recorded once in the expense ledger.

## Historical NAV and performance

historical-nav.mjs accepts ordered historical NAV observations with verified valuations and explicit capital flows. At every flow, record immediately preceding and following valuations and verify NAV_after = NAV_before + CapitalIn - CapitalOut. The time-weighted index starts at 1 and chains NAV_before(t) / NAV_after(t-1). Maximum observed drawdown is the largest peak-to-current index decline among the supplied samples. The implementation uses integer fixed-point arithmetic, reports basis points, and suppresses final performance if history is incomplete, valuations are unverified, or flow conservation fails. A total loss requires explicit rebasing. Sampled drawdown is not guaranteed to capture intraperiod extremes.

These independent reports do not yet automatically enforce fee-audit success inside the project PnL aggregator or derive NAV from source ledgers. Both integration checks remain required before production reporting. No API integration or transaction execution is added.

## Non-trade inventory conservation and historical reserve coverage

historical-inventory-audit.mjs audits aggregate historical inventory at identical project, mint, quote asset and reporting cutoffs. Expected quantity equals opening inventory plus confirmed acquisitions minus disposals plus independently verified non-trade adjustments. Expected remaining basis follows the same conservation equation using verified acquisition/disposal/adjustment basis. Internal movements within the disclosed accounting perimeter have zero aggregate quantity and cost-basis effect. Their conservation must be independently verified. Unknown external basis, unverified adjustments, mismatched snapshots or incomplete history block verified cost-basis reporting. No per-wallet basis allocation or transaction generation is implemented.

The historical reserve coverage check compares a supplied gross quote obligation (including all curve-funded fee obligations) to independently observed real quote reserves at the same snapshot. Missing reserve information, insufficient reserve coverage, unverified source records and completed curves block validation. Passing coverage is necessary but not sufficient for execution feasibility. This audit does not determine a tradable size or derive future quotes.

Both checks are standalone historical audit modules. They still need to be connected to the unified reporting gate. Existing quote scenario outputs are not thereby certified executable.
