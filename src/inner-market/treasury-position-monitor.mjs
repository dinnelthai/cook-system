import { parseBaseUnits } from "../core/integer.mjs";
import {
  quoteExactQuoteInBuy,
  quoteExactTokenOutBuy,
  quoteExactTokenInSell,
} from "../adapters/pump/quote-engine.mjs";

const BPS = 10_000n;
const DISPLAY_SCALE_DIGITS = 12;
const DISPLAY_SCALE = 10n ** BigInt(DISPLAY_SCALE_DIGITS);

function amount(value, name) {
  return parseBaseUnits(value, { name });
}

function signedAmount(value, name) {
  if (typeof value === "bigint") return value;
  if (typeof value !== "string" || !/^-?(0|[1-9][0-9]*)$/.test(value)) {
    throw new TypeError(name + " must be a signed integer base-unit string");
  }
  return BigInt(value);
}

function formatScaled(value) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / DISPLAY_SCALE;
  const fraction = (absolute % DISPLAY_SCALE).toString().padStart(DISPLAY_SCALE_DIGITS, "0").replace(/0+$/, "");
  return (negative ? "-" : "") + whole.toString() + (fraction ? "." + fraction : "");
}

function averageCost(costBasis, tokenBalance, tokenDecimals, quoteDecimals) {
  if (tokenBalance === 0n) return null;
  return formatScaled(
    (costBasis * (10n ** BigInt(tokenDecimals)) * DISPLAY_SCALE) /
    (tokenBalance * (10n ** BigInt(quoteDecimals)))
  );
}

function quoteConfig(curveState, protocolFeeBps, creatorFeeBps) {
  return {
    virtualTokenReserves: curveState.virtual_token_reserves_base_units,
    virtualQuoteReserves: curveState.virtual_quote_reserves_base_units,
    realTokenReserves: curveState.real_token_reserves_base_units,
    protocolFeeBps,
    creatorFeeBps,
  };
}

function isActiveCurve(curveState) {
  return curveState && curveState.complete === false && curveState.lifecycle === "bonding_curve";
}

function marginalValueQuoteBaseUnits({
  tokenBalance,
  curveState,
  tokenDecimals,
  quoteDecimals,
}) {
  if (tokenBalance === 0n) return 0n;
  const virtualToken = amount(curveState.virtual_token_reserves_base_units, "virtual_token_reserves_base_units");
  const virtualQuote = amount(curveState.virtual_quote_reserves_base_units, "virtual_quote_reserves_base_units");
  if (virtualToken === 0n || virtualQuote === 0n) throw new RangeError("virtual reserves must be positive");
  const tokenScale = 10n ** BigInt(tokenDecimals);
  const quoteScale = 10n ** BigInt(quoteDecimals);
  const priceScaled = (virtualQuote * tokenScale * DISPLAY_SCALE) / (virtualToken * quoteScale);
  return (tokenBalance * priceScaled * quoteScale) / (tokenScale * DISPLAY_SCALE);
}

function addFlag(flags, code, level, message, value = null, limit = null) {
  flags.push({ code, level, message, value, limit });
}

/**
 * Treasury-only position and risk snapshot for the active Pump bonding curve.
 * All quotes are read-only. This module never constructs or submits transactions.
 */
export function buildTreasuryPositionMonitor({
  ledger,
  curveState,
  protocolFeeBps,
  creatorFeeBps,
  tokenDecimals,
  quoteDecimals,
  initialRealTokenReservesBaseUnits = null,
  marketReconciliationStatus = "NOT_PROVIDED",
  observedAtMs = null,
  nowMs = null,
  riskLimits = {},
}) {
  if (!ledger?.position || !curveState) throw new TypeError("ledger.position and curveState are required");
  if (!Number.isSafeInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 18) throw new RangeError("tokenDecimals must be from 0 to 18");
  if (!Number.isSafeInteger(quoteDecimals) || quoteDecimals < 0 || quoteDecimals > 18) throw new RangeError("quoteDecimals must be from 0 to 18");

  const tokenBalance = amount(ledger.position.ending_token_balance_base_units, "ledger.position.ending_token_balance_base_units");
  const costBasis = amount(ledger.position.remaining_cost_basis_quote_base_units, "ledger.position.remaining_cost_basis_quote_base_units");
  const realToken = amount(curveState.real_token_reserves_base_units, "real_token_reserves_base_units");
  const totalSupply = amount(curveState.token_total_supply_base_units, "token_total_supply_base_units");
  const flags = [];
  const active = isActiveCurve(curveState);

  if (ledger.cost_basis_complete === false) {
    addFlag(flags, "TREASURY_COST_BASIS_INCOMPLETE", "WATCH", "Opening inventory cost basis is unknown; average cost and affected PnL cannot be fully assessed");
  }
  if (ledger.inventory_reconciliation === "MISMATCH") {
    addFlag(flags, "TREASURY_INVENTORY_MISMATCH", "CRITICAL", "Treasury ledger inventory differs from the authoritative wallet snapshot");
  } else if (ledger.inventory_reconciliation === "NOT_PROVIDED") {
    addFlag(flags, "TREASURY_INVENTORY_SNAPSHOT_MISSING", "WATCH", "No ending wallet balance snapshot was supplied; inventory is event-replayed only");
  }
  if (marketReconciliationStatus !== "PASS") {
    addFlag(flags, "CURVE_STATE_NOT_VERIFIED", "CRITICAL", "Curve state has not passed authoritative account reconciliation", marketReconciliationStatus, "PASS");
  }
  if (!active) {
    addFlag(flags, "INNER_CURVE_PHASE_ENDED", "CRITICAL", "Pump bonding curve is complete or no longer active; V1 inner-market quotes must stop");
  }
  if (observedAtMs !== null && nowMs !== null && Number.isFinite(observedAtMs) && Number.isFinite(nowMs)) {
    const ageMs = nowMs - observedAtMs;
    if (ageMs < 0 || (riskLimits.maxDataAgeMs !== undefined && ageMs > riskLimits.maxDataAgeMs)) {
      addFlag(flags, "STALE_MARKET_STATE", "CRITICAL", "Market state is stale or timestamp is invalid", ageMs, riskLimits.maxDataAgeMs ?? 0);
    }
  }

  let marginalMarkValue = null;
  let liquidationQuote = null;
  let liquidationDiscountBps = null;
  let liquidationPnl = null;
  if (active) {
    marginalMarkValue = marginalValueQuoteBaseUnits({ tokenBalance, curveState, tokenDecimals, quoteDecimals });
    if (tokenBalance > 0n) {
      const quote = quoteExactTokenInSell({
        tokenAmountIn: tokenBalance.toString(),
        virtualTokenReserves: curveState.virtual_token_reserves_base_units,
        virtualQuoteReserves: curveState.virtual_quote_reserves_base_units,
        protocolFeeBps,
        creatorFeeBps,
      });
      liquidationQuote = BigInt(quote.output_base_units);
      liquidationPnl = ledger.cost_basis_complete === false ? null : liquidationQuote - costBasis;
      liquidationDiscountBps = marginalMarkValue === 0n
        ? null
        : ((marginalMarkValue - liquidationQuote) * BPS / marginalMarkValue).toString();
      if (liquidationPnl !== null && liquidationPnl < 0n) {
        addFlag(flags, "POSITION_BELOW_COST_ON_CURVE_EXIT", "HIGH", "Estimated full-position curve exit proceeds are below remaining cost basis", liquidationPnl.toString(), "0");
      }
      if (liquidationDiscountBps !== null && riskLimits.maxLiquidationDiscountBps !== undefined &&
          BigInt(liquidationDiscountBps) > amount(riskLimits.maxLiquidationDiscountBps, "riskLimits.maxLiquidationDiscountBps")) {
        addFlag(flags, "LIQUIDATION_IMPACT_OVER_LIMIT", "HIGH", "Estimated full-position exit discount exceeds the configured limit", liquidationDiscountBps, riskLimits.maxLiquidationDiscountBps);
      }
    }
  }

  let curveInventoryRemainingBps = null;
  if (initialRealTokenReservesBaseUnits !== null) {
    const initial = amount(initialRealTokenReservesBaseUnits, "initialRealTokenReservesBaseUnits");
    if (initial === 0n) throw new RangeError("initialRealTokenReservesBaseUnits must be positive");
    curveInventoryRemainingBps = (realToken * BPS / initial).toString();
    if (riskLimits.minCurveInventoryRemainingBps !== undefined &&
        BigInt(curveInventoryRemainingBps) < amount(riskLimits.minCurveInventoryRemainingBps, "riskLimits.minCurveInventoryRemainingBps")) {
      addFlag(flags, "CURVE_NEAR_COMPLETION", "HIGH", "Remaining real curve token inventory is below the configured threshold", curveInventoryRemainingBps, riskLimits.minCurveInventoryRemainingBps);
    }
  }

  const treasurySupplyShareBps = totalSupply === 0n ? null : (tokenBalance * BPS / totalSupply).toString();
  if (treasurySupplyShareBps !== null && riskLimits.maxTreasurySupplyShareBps !== undefined &&
      BigInt(treasurySupplyShareBps) > amount(riskLimits.maxTreasurySupplyShareBps, "riskLimits.maxTreasurySupplyShareBps")) {
    addFlag(flags, "TREASURY_SUPPLY_SHARE_OVER_LIMIT", "HIGH", "Treasury inventory share exceeds the configured cap", treasurySupplyShareBps, riskLimits.maxTreasurySupplyShareBps);
  }

  const severity = { WATCH: 1, HIGH: 2, CRITICAL: 3 };
  const maxSeverity = flags.reduce((max, flag) => Math.max(max, severity[flag.level] ?? 0), 0);
  const riskLevel = flags.some((flag) => flag.level === "CRITICAL")
    ? "PAUSE_AND_RECONCILE"
    : ["LOW", "WATCH", "HIGH"][maxSeverity];

  return {
    schema_version: "1.0.0",
    report_kind: "PUMP_INNER_TREASURY_POSITION",
    scope: "PUMP_BONDING_CURVE_ONLY",
    as_of_event_id: curveState.as_of_event_id ?? null,
    risk_level: riskLevel,
    position: {
      token_balance_base_units: tokenBalance.toString(),
      remaining_cost_basis_quote_base_units: costBasis.toString(),
      average_cost_quote_per_token: ledger.position.average_cost_quote_per_token,
      total_bought_token_amount_base_units: ledger.position.total_bought_token_amount_base_units,
      total_sold_token_amount_base_units: ledger.position.total_sold_token_amount_base_units,
    },
    pnl: {
      realized_pnl_quote_base_units: ledger.realized_pnl_quote_base_units,
      unrealized_pnl_at_marginal_price_quote_base_units: ledger.unrealized_pnl_quote_base_units,
      estimated_full_position_liquidation_quote_base_units: liquidationQuote === null ? null : liquidationQuote.toString(),
      unrealized_pnl_at_estimated_liquidation_quote_base_units: liquidationPnl === null ? null : liquidationPnl.toString(),
      total_pnl_at_estimated_liquidation_quote_base_units: liquidationPnl === null || ledger.realized_pnl_quote_base_units === null ? null : (BigInt(ledger.realized_pnl_quote_base_units) + liquidationPnl).toString(),
    },
    curve_risk: {
      lifecycle: curveState.lifecycle,
      complete: curveState.complete,
      real_token_reserves_base_units: realToken.toString(),
      curve_inventory_remaining_bps: curveInventoryRemainingBps,
      treasury_supply_share_bps: treasurySupplyShareBps,
      marginal_mark_value_quote_base_units: marginalMarkValue === null ? null : marginalMarkValue.toString(),
      estimated_liquidation_quote_base_units: liquidationQuote === null ? null : liquidationQuote.toString(),
      liquidation_discount_bps: liquidationDiscountBps,
    },
    risk_flags: flags,
    execution_enabled: false,
    warning: "Liquidation value is an exact curve quote for the full current inventory at this snapshot, not a guarantee of execution. The report is monitoring-only and ends when the Pump bonding curve completes.",
  };
}

/**
 * Quotes one hypothetical next Treasury buy and reports its post-buy cost basis and
 * estimated full-position curve exit value. This is a read-only scenario, never an order.
 */
export function quoteNextTreasuryBuyScenario({
  curveState,
  currentTokenBalanceBaseUnits,
  currentCostBasisQuoteBaseUnits,
  currentRealizedPnlQuoteBaseUnits = "0",
  currentRealizedPnlComplete = true,
  currentCostBasisComplete = true,
  protocolFeeBps,
  creatorFeeBps,
  tokenDecimals,
  quoteDecimals,
  quoteBudgetBaseUnits = null,
  tokenAmountOutBaseUnits = null,
  estimatedNetworkFeeBaseUnits = "0",
}) {
  if (!isActiveCurve(curveState)) {
    return { status: "OUT_OF_SCOPE_CURVE_NOT_ACTIVE", execution_enabled: false };
  }
  if ((quoteBudgetBaseUnits === null) === (tokenAmountOutBaseUnits === null)) {
    throw new TypeError("provide exactly one of quoteBudgetBaseUnits or tokenAmountOutBaseUnits");
  }
  const currentTokenBalance = amount(currentTokenBalanceBaseUnits, "currentTokenBalanceBaseUnits");
  const currentCostBasis = amount(currentCostBasisQuoteBaseUnits, "currentCostBasisQuoteBaseUnits");
  const networkFee = amount(estimatedNetworkFeeBaseUnits, "estimatedNetworkFeeBaseUnits");
  const currentRealizedPnl = signedAmount(currentRealizedPnlQuoteBaseUnits, "currentRealizedPnlQuoteBaseUnits");
  const config = quoteConfig(curveState, protocolFeeBps, creatorFeeBps);

  let quote;
  let requestedBudget = null;
  if (quoteBudgetBaseUnits !== null) {
    requestedBudget = amount(quoteBudgetBaseUnits, "quoteBudgetBaseUnits");
    quote = quoteExactQuoteInBuy({ spendableQuoteIn: requestedBudget.toString(), ...config });
    if (BigInt(quote.output_base_units) >= BigInt(curveState.real_token_reserves_base_units)) {
      const completionQuote = quoteExactTokenOutBuy({
        tokenAmountOut: curveState.real_token_reserves_base_units,
        ...config,
      });
      quote = {
        ...completionQuote,
        method: "exact_quote_in_would_complete_curve",
        requested_budget_base_units: requestedBudget.toString(),
        unspent_input_base_units: (requestedBudget > BigInt(completionQuote.input_base_units)
          ? requestedBudget - BigInt(completionQuote.input_base_units)
          : 0n).toString(),
        status: "WOULD_COMPLETE_CURVE",
      };
    }
  } else {
    quote = quoteExactTokenOutBuy({ tokenAmountOut: tokenAmountOutBaseUnits, ...config });
  }

  const tokenOut = BigInt(quote.output_base_units);
  const quoteSpent = BigInt(quote.input_base_units) - BigInt(quote.unspent_input_base_units ?? "0");
  const totalCashCost = quoteSpent + networkFee;
  const postTokenBalance = currentTokenBalance + tokenOut;
  const postCostBasis = currentCostBasis + totalCashCost;
  const postAverageCost = currentCostBasisComplete ? averageCost(postCostBasis, postTokenBalance, tokenDecimals, quoteDecimals) : null;
  const realBefore = BigInt(curveState.real_token_reserves_base_units);
  const curveWouldComplete = tokenOut >= realBefore || quote.status === "WOULD_COMPLETE_CURVE";

  const result = {
    status: curveWouldComplete ? "WOULD_COMPLETE_CURVE" : "QUOTED",
    execution_enabled: false,
    quote_method: quote.method,
    requested_quote_budget_base_units: requestedBudget === null ? null : requestedBudget.toString(),
    token_out_base_units: tokenOut.toString(),
    quote_spent_base_units: quoteSpent.toString(),
    estimated_network_fee_base_units: networkFee.toString(),
    total_incremental_cash_cost_base_units: totalCashCost.toString(),
    current_token_balance_base_units: currentTokenBalance.toString(),
    post_buy_token_balance_base_units: postTokenBalance.toString(),
    current_remaining_cost_basis_quote_base_units: currentCostBasis.toString(),
    post_buy_remaining_cost_basis_quote_base_units: postCostBasis.toString(),
    post_buy_average_cost_quote_per_token: postAverageCost,
    post_buy_cost_basis_complete: currentCostBasisComplete,
    protocol_fee_base_units: quote.protocol_fee_base_units,
    creator_fee_base_units: quote.creator_fee_base_units,
    unspent_quote_budget_base_units: quote.unspent_input_base_units,
    curve_completion: curveWouldComplete,
  };

  if (curveWouldComplete) {
    return {
      ...result,
      estimated_full_position_liquidation_quote_base_units: null,
      post_buy_unrealized_pnl_quote_base_units: null,
      incremental_liquidation_value_quote_base_units: null,
      incremental_estimated_pnl_quote_base_units: null,
      warning: "This hypothetical buy would complete the inner bonding curve. V1 does not quote or model the post-graduation PumpSwap phase.",
    };
  }

  const postCurveState = {
    ...curveState,
    virtual_token_reserves_base_units: (BigInt(curveState.virtual_token_reserves_base_units) - tokenOut).toString(),
    virtual_quote_reserves_base_units: (BigInt(curveState.virtual_quote_reserves_base_units) + BigInt(quote.curve_input_base_units)).toString(),
    real_token_reserves_base_units: (realBefore - tokenOut).toString(),
  };
  const postSellQuote = quoteExactTokenInSell({
    tokenAmountIn: postTokenBalance.toString(),
    virtualTokenReserves: postCurveState.virtual_token_reserves_base_units,
    virtualQuoteReserves: postCurveState.virtual_quote_reserves_base_units,
    protocolFeeBps,
    creatorFeeBps,
  });
  const postLiquidation = BigInt(postSellQuote.output_base_units);

  let currentLiquidation = 0n;
  if (currentTokenBalance > 0n) {
    currentLiquidation = BigInt(quoteExactTokenInSell({
      tokenAmountIn: currentTokenBalance.toString(),
      virtualTokenReserves: curveState.virtual_token_reserves_base_units,
      virtualQuoteReserves: curveState.virtual_quote_reserves_base_units,
      protocolFeeBps,
      creatorFeeBps,
    }).output_base_units);
  }
  const incrementalLiquidationValue = postLiquidation - currentLiquidation;
  const incrementalEstimatedPnl = incrementalLiquidationValue - totalCashCost;
  return {
    ...result,
    post_buy_estimated_full_position_liquidation_quote_base_units: postLiquidation.toString(),
    post_buy_unrealized_pnl_quote_base_units: currentCostBasisComplete ? (postLiquidation - postCostBasis).toString() : null,
    post_buy_total_pnl_at_liquidation_quote_base_units: currentCostBasisComplete && currentRealizedPnlComplete ? (currentRealizedPnl + postLiquidation - postCostBasis).toString() : null,
    current_estimated_full_position_liquidation_quote_base_units: currentLiquidation.toString(),
    incremental_liquidation_value_quote_base_units: incrementalLiquidationValue.toString(),
    incremental_estimated_pnl_quote_base_units: incrementalEstimatedPnl.toString(),
    warning: "Hypothetical quote only. The incremental liquidation value is an estimate using the post-buy curve state; no transaction is built or submitted.",
  };
}
