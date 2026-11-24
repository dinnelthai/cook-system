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

The caller must supply reconciled postings, a same-cutoff closing balance and a trade PnL figure for the same scope and reporting interval. Automated cross-ledger matching, transfer basis adjustments, posting provenance verification, durable storage and historical snapshot recovery remain outstanding.

## Acceptance before integration

1. Cross-check finalized cash trade postings against the inventory ledger at identical reporting cutoffs.
2. Reconcile every internal/external transfer, including cost-basis adjustments and network expenses.
3. Keep accrued creator fees separate from verified receipts; prevent duplicate income.
4. Use explicit missing-data states; never silently substitute zero for unknown profit.
5. Validate historical NAV and drawdown using contribution-adjusted snapshots, not raw cash balances.
6. Preserve the inner-curve completion boundary and keep the external local API untouched until the contract is supplied.
