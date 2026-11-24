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
- every confirmed buy as a separate acquisition tranche, including signature, order, token amount, gross quote, fee, and total cash cost;
- cumulative gross buy spend and cumulative net sell proceeds;
- current token balance, remaining cost basis, and weighted-average cost per token after every event;
- every confirmed sell, its allocated cost basis, net proceeds, and realized PnL;
- unrealized mark-to-market PnL using the current curve marginal price, clearly separated from realizable proceeds;
- transaction signatures, treasury account identity, and event provenance;
- account snapshots and explicit reconciliation for transfers, allocations, burns, and other non-trade inventory changes.

Repeated additions are normal ledger events: the Nth confirmed buy increases cumulative acquisition cost and inventory, then recomputes weighted-average cost. A sell reduces both inventory and remaining cost basis proportionally. A later buy starts a new tranche and recomputes the average over the then-current remaining position. Do not reset the cost basis when adding again.

`CumulativeBuyCash = Σ(grossBuyQuote_i + buyFee_i)`

`RemainingCostBasis = OpeningCostBasis + CumulativeBuyCash - CostBasisAllocatedToConfirmedSells`

`AverageCostPerToken = RemainingCostBasis / CurrentTreasuryTokenBalance`

`NetCashDeployed = CumulativeBuyCash - CumulativeNetSellProceeds`

The opening allocation must not be silently treated as a zero-cost purchase. If its basis is unknown, mark the position basis incomplete rather than presenting a misleading average. Transfers are not buys; they require an explicit basis transfer or a reconciliation exception.

V1 uses weighted-average cost for a deterministic first implementation. Accounting method is not tax advice. If a transfer or external allocation changes inventory, reconcile against an account snapshot before treating the trade-only ledger as complete.

`RealizedPnL = NetConfirmedSellProceeds - AllocatedCostBasis`

`UnrealizedPnL = CurrentMarkValue - RemainingKnownCostBasis`

Do not mix quote assets or silently convert between SOL and USD. FX conversion must carry its own timestamp and source.

### 3.4 Batch result reconciliation

Batch means grouping already-authorized transaction receipts for audit and accounting. The module deduplicates signatures, separates confirmed / pending / failed results, and aggregates actual fills and fees. It does not construct coordinated multi-wallet buy/sell sequences, split orders to influence price, or automate market-moving behavior.

### 3.6 External-flow and curve-risk analytics

A treasury position cannot be evaluated from Dev fills alone. Every confirmed curve execution between two treasury decisions changes the shared curve state, regardless of who submitted it. The next decision must be based on the latest replayed state, never on the reserve snapshot from the prior Dev fill.

For a baseline snapshot immediately after a known Dev event, replay all subsequent confirmed market events in canonical chain order. Each event must carry its authoritative `post_curve_state`. Pending, failed, and unconfirmed events do not change the curve state. An ordering gap, market-identity mismatch, or replay failure is a data-integrity stop.

For every confirmed buy or sell, record:
- event id, side, participant class (if evidence-backed), quote notional, and token amount;
- marginal price change across that one event;
- remaining real curve token inventory;
- the change in a fixed reference-depth probe, if configured.

The participant attribution layer may label an event `TREASURY`, `SNIPER`, `OTHER`, or `UNKNOWN`. These labels are enrichment, not native facts. Do not infer that a wallet is a sniper solely from its size, speed, or position in the launch sequence. Keep unknown wallets unknown and report attribution coverage.

For a fixed diagnostic token quantity (Q_r), compare the exact fee-aware Pump quote at the baseline and current states:

`ReferenceCostDelta = QuoteExactTokenOut(CurrentState, Q_r) - QuoteExactTokenOut(BaselineState, Q_r)`

For a fixed diagnostic quote budget (B_r), compare token outputs:

`ReferenceOutputDelta = QuoteExactQuoteIn(CurrentState, B_r) - QuoteExactQuoteIn(BaselineState, B_r)`

These are read-only depth measurements. They quantify how intervening market activity changed the cost of a fixed reference quantity (or the output of a fixed reference budget); they are not suggested order sizes, target-market-cap budgets, or instructions to transact.

Risk dimensions in V1:
- absolute marginal-price movement from the baseline;
- increase in the fixed reference-token quote cost;
- depletion of real curve token inventory;
- external sell share of attributed external turnover;
- external buyer wallet concentration (HHI and effective wallet count);
- data integrity, event-order completeness, curve lifecycle, and attribution coverage.

The initial numeric thresholds in `DEFAULT_CURVE_RISK_THRESHOLDS` are provisional alerting defaults only. Calibrate them against historical organic launches, by launch phase and curve depth. The overall level is the maximum configured dimension severity, not a probability of loss. Missing attribution must not be interpreted as low concentration risk.

Creator/treasury buys remain part of the curve replay because they changed the actual market state, but they are excluded from external-flow concentration and external sell-share calculations when correctly attributed. This keeps the actual curve state separate from the participant-flow explanation.

### 3.7 Risk and data-quality guard

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
- [ ] Intervening confirmed market trades are replayed in canonical order before any later treasury assessment.
- [ ] External participant attribution is evidence-backed; unknown wallets remain unknown.
- [ ] Per-event price impact and fixed reference-depth changes are recorded for audit.
- [ ] Risk dimensions show their evidence and provisional thresholds; no missing data is silently scored as low risk.
- [ ] No target-market-cap buy budget, deceptive volume, wallet-concealment, or manipulative execution policy is generated.
- [ ] All money and token quantities use integer base units; formatted decimals are display-only.

## 6. Implementation order

1. Curve valuation and supply accounting.
2. Launch budget and token allocation.
3. Treasury confirmed-trade PnL.
4. Batch receipt reconciliation.
5. Data-quality and treasury policy guard.
6. Integrate with existing event replay and add fixtures.
7. Add offline scenario reports using recorded / synthetic data with provenance labels.