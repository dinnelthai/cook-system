# Inner-Market Dev Operations & Treasury — V1

- Status: V1 scope and algorithm contract
- Market phase: Pump bonding curve before graduation
- Core rule: no LP is required during the bonding-curve phase
- Runtime: offline analytics, accounting, and policy checks; venue execution remains an external adapter

## 1. Correct market model

The Pump bonding curve is a program-defined market. The program's virtual reserves and exact fee-aware integer quote rules determine the marginal price and trade outputs. A Dev does not create or manage an LP position during this phase. PumpSwap / AMM liquidity management is a separate post-graduation module and is explicitly outside this V1.

Reuse the repository's existing `quote-engine.mjs`, `market-state.mjs`, `pool-state.mjs`, event replay, and candle builder. Do not reimplement Solana, Pump SDK, bonding-curve instructions, or LP math here.

## 2. V1 objective

Provide an issuer-side operational view of launch costs, token allocation, verified treasury inventory, realized and unrealized PnL, curve valuation, confirmed transaction batches, and risk limits. Preserve an auditable record of every confirmed event.

V1 is not a price-making or price-targeting bot. It must not coordinate wallets, create circular/self-trading volume, conceal common control, manufacture market demand, or optimize a Dev's exit against retail participants.

## 3. Modules

### 3.1 Launch budget and token allocation

Budget categories are separated by quote asset and use integer base units:

`BaseBudget = CreationAndNetworkCosts + TreasuryReserve + OperatingReserve`

`Contingency = ceil(BaseBudget * contingencyBps / 10000)`

`TotalBudget = BaseBudget + Contingency`

Token allocation categories are explicit (for example public distribution, treasury, ecosystem, vesting, liquidity reserve if applicable, and burn). Their weights must sum to 10,000 bps. Integer remainder is assigned deterministically so allocations reconcile exactly to total supply.

### 3.2 Curve valuation

For the Pump curve marginal price, use the adapter's virtual reserves and token / quote decimals:

`Price_quote_per_token = (VirtualQuote / 10^quoteDecimals) / (VirtualToken / 10^tokenDecimals)`

`MC_quote = Price_quote_per_token * CirculatingSupply`

`FDV_quote = Price_quote_per_token * TotalSupply`

`TreasuryMark_quote = Price_quote_per_token * TreasuryTokenBalance`

Virtual reserves are pricing state, not withdrawable balances. Report real reserves separately. Treasury mark-to-market is not realizable cash proceeds.

A target market cap can be translated into an implied price (`target MC / circulating supply`) for valuation scenarios. There is no deterministic or safe conversion from target market cap to a buy budget: actual outcomes depend on starting curve state, exact program fees and rounding, trade path, real inventory limits, and other participants. V1 does not calculate capital or trade sequences to force a target market cap.

### 3.3 Treasury accounting

Only confirmed, normalized executions affect trade PnL. Transfers, allocations, burns, fee sweeps, and account snapshots are separate ledger event classes and are never counted as market trades.

For each treasury account, track the full position over time, not only the launch-day allocation:

- opening inventory and its explicitly supplied opening cost basis;
- every confirmed buy as a separate acquisition tranche, including signature, order, token amount, reconciled quote cash debit, program-fee breakdown, network fee, and total cash cost;
- cumulative gross buy spend and cumulative net sell proceeds;
- current token balance, remaining cost basis, and weighted-average cost per token after every event;
- every confirmed sell, its allocated cost basis, reconciled quote cash credit, network fee, net proceeds, and realized PnL;
- unrealized mark-to-market PnL using the current curve marginal price, clearly separated from realizable proceeds;
- transaction signatures, treasury account identity, and event provenance;
- account snapshots and explicit reconciliation for transfers, allocations, burns, and other non-trade inventory changes.

Repeated additions are normal ledger events: the Nth confirmed buy increases cumulative acquisition cost and inventory, then recomputes weighted-average cost. A sell reduces both inventory and remaining cost basis proportionally. A later buy starts a new tranche and recomputes the average over the then-current remaining position. Do not reset the cost basis when adding again.

`ObservedBuyCashCost = ReconciledQuoteDebit + TreasuryPaidNetworkFee`

`ObservedSellCashProceeds = ReconciledQuoteCredit - TreasuryPaidNetworkFee`

For observed-chain events, the reconciled quote debit/credit already includes Pump program fees; program fee components are disclosure fields, not another cash add-on. Synthetic fixtures may express gross quote and a separate fee explicitly.

`RemainingCostBasis = OpeningCostBasis + CumulativeBuyCash - CostBasisAllocatedToConfirmedSells`

`AverageCostPerToken = RemainingCostBasis / CurrentTreasuryTokenBalance`

`NetCashDeployed = CumulativeBuyCash - CumulativeNetSellProceeds`

The opening allocation must not be silently treated as a zero-cost purchase. If its basis is unknown, mark the position basis incomplete rather than presenting a misleading average. Transfers are not buys. A transfer between Treasury wallets must move inventory and its associated cost basis as a separate ledger adjustment; until that adjustment is available and reconciled, pause the affected wallet rather than treating the transfer as a market buy or sell.

V1 uses weighted-average cost for a deterministic first implementation. Accounting method is not tax advice. If a transfer or external allocation changes inventory, reconcile against an account snapshot before treating the trade-only ledger as complete.

`RealizedPnL = NetConfirmedSellProceeds - AllocatedCostBasis`

`UnrealizedPnL = CurrentMarkValue - RemainingKnownCostBasis`

Do not mix quote assets or silently convert between SOL and USD. FX conversion must carry its own timestamp and source.

### 3.4 Batch result reconciliation

Batch means grouping already-authorized transaction receipts for audit and accounting. The module deduplicates signatures, separates confirmed / pending / failed results, and aggregates actual fills and fees. It does not construct coordinated multi-wallet buy/sell sequences, split orders to influence price, or automate market-moving behavior.

### 3.5 Treasury position, liquidation value, and next-buy monitoring

The V1 monitoring subject is the configured Treasury wallet set, not the full participant population. All confirmed Pump curve trades still update the shared curve state through the canonical replay engine, because an intervening market trade changes the quote available to Treasury. External traders are not classified, profiled, or scored.

For every Treasury buy or sell, retain the wallet address, signature, event ordering, token amount, reconciled quote cash movement, program-fee breakdown, and network transaction fee. When multiple Treasury wallets are configured, maintain a separate inventory and weighted-average cost ledger for each wallet first, then aggregate portfolio totals; one wallet must never use another wallet's inventory to validate a sell. Deduplicate network transaction fees by signature across the portfolio. A curve trade is admitted to PnL only when the parser's actor token/quote balance reconciliation returns PASS. Pending, failed, partial, or unreconciled events do not alter the Treasury ledger.

Observed-chain `payload.quote_amount_base_units` is the actor's quote cash movement confirmed against transaction balance deltas (excluding the network transaction fee). Program fee components are already reflected in that cash movement; they are reported separately and must not be added or subtracted a second time. Network transaction fees are counted once per signature and only when the fee payer belongs to the configured Treasury wallet set.

Treasury inventory is computed from confirmed buys and sells, then reconciled against an authoritative owner+mint token balance snapshot. Transfers between Treasury wallets are internal movements, not buys or sells; they require a separate quantity and cost-basis transfer adjustment. External transfers, allocations, burns, and other inventory changes require separate basis adjustments and a new account reconciliation. Until those adjustments are supplied, a balance mismatch is a hard pause.

V1 uses weighted-average cost:
- each additional buy increases current inventory and remaining cost basis;
- each sell removes its proportional share of remaining cost basis;
- each later buy recomputes average cost over the remaining position;
- a sale does not reset cumulative buy spend or erase prior realized PnL.

`RemainingCostBasis = OpeningCostBasis + ConfirmedBuyCashCosts - CostBasisAllocatedToConfirmedSells`

`AverageCostPerToken = RemainingCostBasis / CurrentTreasuryTokenBalance`

`RealizedPnL = ConfirmedNetSellProceeds - AllocatedCostBasis`

For risk monitoring, show two different valuations:
- marginal-price mark-to-market, which is a reference mark only;
- exact fee-aware Pump sell quote for the entire current Treasury inventory, which estimates proceeds after the position's own curve impact.

The full-position quote is an estimate, not a guaranteed execution result. The dashboard must not describe marginal mark value as realizable proceeds.

A hypothetical next-buy scenario accepts exactly one input: a fixed quote budget or a fixed token quantity. It reports the Pump quote, program fees, estimated network fee, incremental token amount, post-buy total inventory, post-buy remaining cost basis, post-buy average cost, estimated full-position liquidation proceeds, post-buy unrealized PnL, and incremental estimated liquidation PnL. It also reports if the hypothetical purchase would complete the bonding curve. It never builds or submits a transaction.

Risk alerts are Treasury-specific and evidence-backed:
- wallet inventory or curve state does not reconcile;
- chain data is stale, incomplete, or out of order;
- curve is complete or has left the bonding-curve lifecycle;
- full-position liquidation quote is below remaining cost basis;
- liquidation discount exceeds a configured threshold;
- remaining real curve inventory is below a configured graduation-proximity threshold;
- Treasury token inventory share exceeds a configured cap;
- cumulative spend or inventory would exceed approved policy limits.

Thresholds are configuration, not universal constants. Unknown values remain unassessed; no missing data is silently scored as low risk.

### 3.6 Risk and data-quality guard

Hard gates:

- stale or incomplete market data => pause new transaction approval;
- curve state / account snapshot mismatch => pause and reconcile;
- curve completed or migrated => mark phase transition; do not apply inner-curve assumptions;
- cumulative confirmed buy spend plus the proposed add-on exceeds the approved budget => require manual review; sell proceeds do not silently replenish the buy budget;
- current inventory plus the proposed acquisition exceeds the approved inventory cap => require manual review;
- unknown fee configuration or unsupported program version => do not quote.

Risk outputs are explanations and controls, not trading instructions.

## 4. Existing code reuse

| Existing component | V1 use |
|---|---|
| `src/adapters/pump/quote-engine.mjs` | Exact Pump curve quotes for audit / simulation; no duplicate quote implementation |
| `src/core/market-state.mjs` | Confirmed curve state replay |
| `src/core/pool-state.mjs` | Post-graduation pool state only; not used as inner-curve LP |
| `src/core/candle-builder.mjs` | Raw OHLCV from confirmed executions |
| `src/core/integer.mjs` | Canonical base-unit arithmetic |
| `src/inner-market/treasury-position-monitor.mjs` | Exact full-position curve exit quote, Treasury-specific risk alerts, and hypothetical next-buy cost/PnL scenario |
| inventory / demand research docs | Holder, cohort, net-flow, and overhang analytics |

## 5. V1 acceptance criteria

- [ ] No LP position, LP add/remove, or LP rebalance logic is included in the inner-market module.
- [ ] Launch budget arithmetic is integer-only and reconciles.
- [ ] Token allocation weights sum to 10,000 bps and allocations equal total supply exactly.
- [ ] MC, FDV, and Treasury mark-to-market are distinct and use explicit supply denominators.
- [ ] Virtual and real reserves are never conflated.
- [ ] Only confirmed curve executions affect realized trade PnL.
- [ ] Transfers are excluded from trading volume and trigger inventory reconciliation.
- [ ] Add-on budget checks use cumulative confirmed buy spend plus the proposed tranche; sale proceeds do not automatically reset the budget.
- [ ] Add-on inventory checks use current reconciled inventory plus the proposed acquisition.
- [ ] Batch reports deduplicate signatures and distinguish confirmed, pending, failed, and rejected receipts.
- [ ] Only Treasury-wallet trades with passing actor balance reconciliation affect Treasury PnL.
- [ ] Intervening confirmed Pump curve trades are replayed in canonical order before every Treasury quote or position valuation.
- [ ] Treasury inventory reconciles to owner+mint account snapshots; transfers are not misclassified as buys or sells.
- [ ] Multiple Treasury wallets have isolated inventory/cost-basis ledgers before portfolio aggregation; a wallet cannot sell another wallet's inventory.
- [ ] Program fees are not double-counted when already included in reconciled quote cash movement; network fees are counted once per signature.
- [ ] Full-position liquidation value uses the exact Pump sell quote, separately from marginal-price mark-to-market.
- [ ] Each later buy updates cumulative inventory, remaining cost basis, average cost, and realized/unrealized PnL without resetting prior history.
- [ ] A next-buy scenario reports post-buy inventory, average cost, estimated liquidation value, and incremental PnL without constructing or submitting a transaction.
- [ ] Risk alerts are Treasury-specific, evidence-backed, and driven by configured limits; missing data is never scored as low risk.
- [ ] No target-market-cap buy budget, deceptive volume, wallet-concealment, or manipulative execution policy is generated.
- [ ] All money and token quantities use integer base units; formatted decimals are display-only.

## 6. Implementation order

1. Curve valuation and supply accounting.
2. Launch budget and token allocation.
3. Treasury confirmed-trade PnL.
4. Batch receipt reconciliation.
5. Data-quality and treasury policy guard.
6. Integrate with existing event replay and add fixtures.
7. Add Treasury-only position and liquidation monitoring.
8. Add hypothetical next-buy quote, post-buy average cost, and incremental liquidation PnL scenario.
9. Add offline scenario reports using recorded / synthetic data with provenance labels.