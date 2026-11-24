# Market Making Engine — V1

- Status: Algorithm specification
- Scope: Transparent, inventory-aware liquidity provision and market-quality risk management
- Initial venue model: Constant-product AMM / PumpSwap replay; venue-specific adapters remain separate
- Execution: Offline decision evaluation only; no signing, wallet orchestration, or transaction submission

## 1. Product objective

Manage a legitimate liquidity-provider position by balancing fee income, inventory exposure, adverse selection, impermanent loss, and transaction costs. The system must optimize risk-adjusted LP economics, not token price, apparent volume, or retail behavior.

## 2. Existing repository audit

The repository already provides confirmed-event history, Pump bonding-curve quotes, PumpSwap reserve replay, Raydium LaunchLab/CPMM history, raw OHLCV, exact base-unit arithmetic, and supply / inventory research contracts. These are valuable inputs and must be reused.

Missing for a market-making product:

1. A venue-neutral LP position and inventory ledger.
2. A market-regime feature layer with confidence and data-quality gates.
3. LP economics separating fees, inventory mark-to-market, impermanent loss, adverse selection, and transaction costs.
4. A risk engine for inventory skew, liquidity depth, volatility, drawdown, and stale / incomplete state.
5. A decision evaluator that compares HOLD / ADD_LIQUIDITY / REDUCE_LIQUIDITY / REBALANCE / PAUSE against the same market path.
6. Counterfactual replay and out-of-sample evaluation to prevent overfitting.

Important boundary: the current simulator documentation explicitly excludes post-graduation market-making. This document introduces it as a new, separate research module; it does not silently change the existing bonding-curve simulator contract.

## 3. Economic objective

Over horizon H:

`NetLP = FeeIncome + IncentiveIncome + InventoryMarkToMarketChange - ImpermanentLoss - AdverseSelectionCost - TransactionCosts - FundingAndOperationalCosts`

Do not double-count inventory PnL and impermanent loss. Report both:

- `LP_vs_HODL`: LP portfolio value minus the value of holding the same initial assets.
- `AbsolutePnL`: ending portfolio value plus realized fees / proceeds minus contributed capital and costs.

Only confirmed pool events update balances or fee income. A quote or proposed action is not an execution.

## 4. State vector

At time t, maintain:

- Market: venue, pool, mints, decimals, fee tier, reserves / bins / ticks, price, lifecycle.
- Position: contributed assets, current withdrawable assets, accrued and claimed fees, liquidity units / ranges.
- Inventory: base and quote balances, target weights, cost basis, realized and unrealized PnL.
- Risk: realized volatility, trend, drawdown, depth, price impact, reserve imbalance, data completeness.
- Operations: last reconciled event, transaction costs, pending intents, and pause state.

Virtual reserves must never be treated as withdrawable balances. Token transfers are not swaps. Position valuation must use venue-specific withdrawable-amount logic.

## 5. Market regime features

Use a rolling, causally available window. Minimum features:

- Log return: `r_t = ln(P_t / P_(t-1))`.
- Realized volatility: `sigma = sqrt(sum(r_t^2) / n)`.
- Trend: `T = ln(P_t / P_(t-k))`.
- Drawdown from rolling high: `DD = P_t / max(P_window) - 1`.
- Liquidity depth / price impact from exact venue quote or replay.
- Fee generation rate and volume composition, with observed versus estimated fields separated.

Regime labels (range / trend-up / trend-down / high-volatility / thin-liquidity / unknown) are descriptive states, not buy/sell signals. If data is stale, incomplete, or unreconciled, regime must be UNKNOWN and the risk engine must not increase exposure.

## 6. Inventory control

Represent inventory weight using marked values:

`w_base = V_base / (V_base + V_quote)`
`inventory_skew = w_base - target_base_weight`

Target weights are policy inputs bounded by a risk budget. The engine may recommend reducing risk or pausing when skew, volatility, drawdown, or depth breach limits. It must not use coordinated wallets or circular trades to disguise inventory changes.

V1 should start with a conservative target-weight controller and a no-action default. Any rebalance candidate must be evaluated against expected fees, expected adverse selection, slippage, fees, and gas before it can be considered.

## 7. LP economics

For a 50/50 constant-product pool, the reference impermanent-loss ratio versus HODL is:

`IL(r) = 2 * sqrt(r) / (1 + r) - 1`, where `r = P_t / P_0`.

This formula is not valid as a universal model for DLMM, CLMM, asymmetric positions, or changing ranges. Those require bin/tick-level position replay and venue-specific fee allocation.

Expected net economics must be decomposed:

1. Fee income actually accrued / claimed.
2. Inventory mark-to-market change.
3. LP-versus-HODL divergence.
4. Adverse-selection proxy (post-trade price movement against the LP, calibrated from event-level replay).
5. Rebalance / add / remove costs.

Do not treat gross pool volume multiplied by a fee rate as realized LP income. Use actual fee events or a clearly labeled estimate.

## 8. Decision framework

V1 decision candidates:

- HOLD: keep current position.
- ADD_LIQUIDITY: only when data is healthy, risk limits pass, and expected net economics exceed costs with a safety margin.
- REDUCE_LIQUIDITY: lower exposure when risk limits breach or the position's expected net economics deteriorate.
- REBALANCE: restore target inventory only when expected benefit exceeds total execution cost and adverse-selection allowance.
- PAUSE: mandatory for stale data, reserve mismatch, unsupported venue state, excessive volatility, or unresolved transaction state.

Every decision must include reason codes, input snapshot IDs, model version, estimated cost range, and a counterfactual HOLD comparison. The V1 engine emits recommendations for offline evaluation; it does not submit transactions.

## 9. Risk gates

Hard gates take precedence over expected return:

- State reconciliation failure or stale observation => PAUSE.
- Unknown venue / fee model / position valuation => PAUSE.
- Inventory exposure above configured cap => REDUCE or PAUSE.
- Liquidity depth below minimum => PAUSE new exposure.
- Volatility / drawdown beyond configured stress limit => REDUCE or PAUSE.
- Transaction cost greater than expected incremental benefit => HOLD.

Thresholds are configuration, not universal constants. Calibrate per venue and token using held-out historical periods.

## 10. Evaluation

Compare against:

1. Hold initial assets (HODL).
2. Static LP position.
3. Conservative target-weight rebalance.
4. Risk-gated dynamic LP.

Report net PnL, LP-versus-HODL, fee income, maximum drawdown, volatility, inventory skew, time paused, transaction count, costs, and tail loss. Use paired seeds / identical market paths and out-of-sample tokens. Include trending, ranging, volatile, thin-liquidity, launch, and post-graduation regimes.

## 11. V1 implementation order

1. Add venue-neutral LP state and economics contracts.
2. Add regime feature calculation and data-quality gates.
3. Add inventory / exposure metrics.
4. Add deterministic risk decision evaluator (no execution).
5. Add tests for math, stale data, reserve mismatch, extreme volatility, and cost-dominant rebalance.
6. Connect to existing PumpSwap replay; later add Meteora DLMM and other venue-specific position adapters.

## 12. Explicit non-goals

- No artificial or circular trading volume.
- No self-trading or coordinated-wallet execution.
- No hidden ownership / attribution evasion.
- No price or market-cap targeting.
- No retail-inducement or issuer exit optimization.
- No perpetual futures or options hedging.
- No live signing or transaction submission in this V1 slice.