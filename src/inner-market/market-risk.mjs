import { parseBaseUnits } from "../core/integer.mjs";
import { replayCurveEvents } from "../core/market-state.mjs";
import { sortForReplay } from "../core/event-order.mjs";
import { quoteExactQuoteInBuy, quoteExactTokenOutBuy } from "../adapters/pump/quote-engine.mjs";

const BPS = 10_000n;
const BUY = "CURVE_BUY_EXECUTED";
const SELL = "CURVE_SELL_EXECUTED";
const PARTICIPANT_CLASSES = new Set(["TREASURY", "SNIPER", "OTHER", "UNKNOWN"]);

/**
 * Initial operational thresholds only. Calibrate against historical organic curves
 * before using these values for production alerting.
 */
export const DEFAULT_CURVE_RISK_THRESHOLDS = Object.freeze({
  absolutePriceMoveBps: Object.freeze({ watch: "500", high: "1000", critical: "2000" }),
  referenceTokenCostIncreaseBps: Object.freeze({ watch: "500", high: "1000", critical: "2000" }),
  curveInventoryDepletionBps: Object.freeze({ watch: "1000", high: "3000", critical: "6000" }),
  externalSellShareBps: Object.freeze({ watch: "2500", high: "5000", critical: "7500" }),
  buyerConcentrationHhiBps: Object.freeze({ watch: "2500", high: "5000", critical: "7500" }),
  unknownAttributionShareBps: Object.freeze({ watch: "2000", high: "5000", critical: "8000" }),
});

function stateAmount(state, field) {
  return parseBaseUnits(state[field], { name: field });
}

function signedBps(numerator, denominator) {
  if (denominator === 0n) return null;
  return ((numerator * BPS) / denominator).toString();
}

function priceMoveBps(before, after) {
  const beforeToken = stateAmount(before, "virtual_token_reserves_base_units");
  const beforeQuote = stateAmount(before, "virtual_quote_reserves_base_units");
  const afterToken = stateAmount(after, "virtual_token_reserves_base_units");
  const afterQuote = stateAmount(after, "virtual_quote_reserves_base_units");
  if (beforeToken === 0n || beforeQuote === 0n || afterToken === 0n || afterQuote === 0n) {
    throw new RangeError("virtual reserves must be positive to calculate price movement");
  }
  const numerator = afterQuote * beforeToken - beforeQuote * afterToken;
  return signedBps(numerator, beforeQuote * afterToken);
}

function classifyThreshold(value, threshold) {
  if (value === null || value === undefined || !threshold) return { level: "UNASSESSED", severity: 0 };
  const amount = parseBaseUnits(value, { name: "risk metric" });
  const watch = parseBaseUnits(threshold.watch, { name: "threshold.watch" });
  const high = parseBaseUnits(threshold.high, { name: "threshold.high" });
  const critical = parseBaseUnits(threshold.critical, { name: "threshold.critical" });
  if (!(watch <= high && high <= critical)) throw new RangeError("risk thresholds must satisfy watch <= high <= critical");
  if (amount >= critical) return { level: "CRITICAL", severity: 3 };
  if (amount >= high) return { level: "HIGH", severity: 2 };
  if (amount >= watch) return { level: "WATCH", severity: 1 };
  return { level: "LOW", severity: 0 };
}

function quoteConfig(state, protocolFeeBps, creatorFeeBps) {
  return {
    virtualTokenReserves: state.virtual_token_reserves_base_units,
    virtualQuoteReserves: state.virtual_quote_reserves_base_units,
    realTokenReserves: state.real_token_reserves_base_units,
    protocolFeeBps,
    creatorFeeBps,
  };
}

function quoteReferenceToken(state, amount, protocolFeeBps, creatorFeeBps) {
  return quoteExactTokenOutBuy({
    tokenAmountOut: amount,
    ...quoteConfig(state, protocolFeeBps, creatorFeeBps),
  });
}

function quoteReferenceBudget(state, amount, protocolFeeBps, creatorFeeBps) {
  return quoteExactQuoteInBuy({
    spendableQuoteIn: amount,
    ...quoteConfig(state, protocolFeeBps, creatorFeeBps),
  });
}

function getAttribution(eventId, attributionByEventId) {
  return attributionByEventId instanceof Map ? attributionByEventId.get(eventId) : attributionByEventId[eventId];
}

function participantClassFor(eventId, attributionByEventId) {
  const value = getAttribution(eventId, attributionByEventId)?.participantClass;
  return PARTICIPANT_CLASSES.has(value) ? value : "UNKNOWN";
}

function aggregateParticipantFlow(events, attributionByEventId = {}) {
  const classes = {
    TREASURY: { buyQuote: 0n, sellQuote: 0n, buyTokens: 0n, sellTokens: 0n, executions: 0 },
    SNIPER: { buyQuote: 0n, sellQuote: 0n, buyTokens: 0n, sellTokens: 0n, executions: 0 },
    OTHER: { buyQuote: 0n, sellQuote: 0n, buyTokens: 0n, sellTokens: 0n, executions: 0 },
    UNKNOWN: { buyQuote: 0n, sellQuote: 0n, buyTokens: 0n, sellTokens: 0n, executions: 0 },
  };
  const walletBuyQuote = new Map();
  let unattributedExternalQuote = 0n;
  let externalBuyQuote = 0n;
  let externalSellQuote = 0n;
  let confirmedCurveExecutionCount = 0;

  for (const event of events) {
    if (event.event_kind !== BUY && event.event_kind !== SELL) continue;
    const payload = event.payload ?? {};
    const quote = parseBaseUnits(payload.quote_amount_base_units, { name: "payload.quote_amount_base_units" });
    const tokens = parseBaseUnits(payload.token_amount_base_units, { name: "payload.token_amount_base_units" });
    const rawAttribution = getAttribution(event.event_id, attributionByEventId);
    const participantClass = PARTICIPANT_CLASSES.has(rawAttribution?.participantClass)
      ? rawAttribution.participantClass
      : "UNKNOWN";
    const walletAddress = typeof rawAttribution?.walletAddress === "string" && rawAttribution.walletAddress.length > 0
      ? rawAttribution.walletAddress
      : null;
    const bucket = classes[participantClass];
    bucket.executions += 1;
    confirmedCurveExecutionCount += 1;

    if (event.event_kind === BUY) {
      bucket.buyQuote += quote;
      bucket.buyTokens += tokens;
      if (participantClass !== "TREASURY") {
        externalBuyQuote += quote;
        if (walletAddress) walletBuyQuote.set(walletAddress, (walletBuyQuote.get(walletAddress) ?? 0n) + quote);
        else unattributedExternalQuote += quote;
      }
    } else {
      bucket.sellQuote += quote;
      bucket.sellTokens += tokens;
      if (participantClass !== "TREASURY") externalSellQuote += quote;
    }
  }

  const totalAttributedWalletBuyQuote = [...walletBuyQuote.values()].reduce((sum, amount) => sum + amount, 0n);
  const knownWalletSquareSum = [...walletBuyQuote.values()].reduce((sum, amount) => sum + (amount * amount), 0n);
  const hhiLowerBoundBps = externalBuyQuote === 0n
    ? null
    : knownWalletSquareSum * BPS / (externalBuyQuote * externalBuyQuote);
  const hhiUpperBoundBps = externalBuyQuote === 0n
    ? null
    : (knownWalletSquareSum + unattributedExternalQuote * unattributedExternalQuote) * BPS / (externalBuyQuote * externalBuyQuote);
  const totalExternalTurnover = externalBuyQuote + externalSellQuote;

  return {
    by_class: Object.fromEntries(Object.entries(classes).map(([name, value]) => [name, {
      confirmed_buy_quote_base_units: value.buyQuote.toString(),
      confirmed_sell_quote_base_units: value.sellQuote.toString(),
      confirmed_buy_token_base_units: value.buyTokens.toString(),
      confirmed_sell_token_base_units: value.sellTokens.toString(),
      confirmed_execution_count: value.executions,
    }])),
    external_buy_quote_base_units: externalBuyQuote.toString(),
    external_sell_quote_base_units: externalSellQuote.toString(),
    external_sell_share_bps: totalExternalTurnover === 0n ? null : (externalSellQuote * BPS / totalExternalTurnover).toString(),
    external_buy_wallet_hhi_bps: hhiLowerBoundBps === null ? null : hhiLowerBoundBps.toString(),
    external_buy_wallet_hhi_lower_bound_bps: hhiLowerBoundBps === null ? null : hhiLowerBoundBps.toString(),
    external_buy_wallet_hhi_upper_bound_bps: hhiUpperBoundBps === null ? null : hhiUpperBoundBps.toString(),
    external_buy_effective_wallet_count_lower_bound: hhiLowerBoundBps === null || hhiLowerBoundBps === 0n ? null : (Number(BPS) / Number(hhiLowerBoundBps)).toFixed(4),
    wallet_attribution_coverage_bps: externalBuyQuote === 0n ? null : (totalAttributedWalletBuyQuote * BPS / externalBuyQuote).toString(),
    unattributed_external_buy_quote_base_units: unattributedExternalQuote.toString(),
    confirmed_curve_execution_count: confirmedCurveExecutionCount,
    attribution_note: "SNIPER/OTHER/TREASURY classes are caller-supplied labels; UNKNOWN is retained rather than inferred. Wallet HHI uses only externally attributed buyer wallets.",
  };
}

function riskDimension(value, threshold, metric) {
  const result = classifyThreshold(value, threshold);
  return { metric, value_bps: value, ...result };
}

/**
 * Read-only risk report for the interval after a baseline curve snapshot.
 * Replays confirmed chain events through the repository's canonical event-ordering
 * and state-transition logic, then compares fixed diagnostic depth probes.
 *
 * Reference probes are calibration measurements, not suggested orders or trade sizes.
 */
export function assessInnerMarketRisk({
  baselineCurveState,
  interveningEvents,
  protocolFeeBps,
  creatorFeeBps,
  referenceTokenProbeBaseUnits = null,
  referenceQuoteProbeBaseUnits = null,
  attributionByEventId = {},
  thresholds = DEFAULT_CURVE_RISK_THRESHOLDS,
}) {
  if (!baselineCurveState || !Array.isArray(interveningEvents)) {
    throw new TypeError("baselineCurveState and interveningEvents are required");
  }
  if (baselineCurveState.complete || baselineCurveState.lifecycle !== "bonding_curve") {
    throw new RangeError("baseline must be an active, pre-graduation bonding-curve state");
  }
  const confirmedEvents = interveningEvents.filter((event) => event.status === "CONFIRMED");
  const ignoredUnconfirmedEventCount = interveningEvents.length - confirmedEvents.length;
  const orderedEvents = sortForReplay(confirmedEvents);
  let current = structuredClone(baselineCurveState);
  const replayReconciliations = [];
  const eventImpactJournal = [];
  for (const event of orderedEvents) {
    const beforeState = current;
    const step = replayCurveEvents(beforeState, [event]);
    current = step.state;
    replayReconciliations.push(...step.reconciliations);
    if (event.event_kind !== BUY && event.event_kind !== SELL) continue;
    const payload = event.payload ?? {};
    const impact = {
      event_id: event.event_id,
      event_kind: event.event_kind,
      participant_class: participantClassFor(event.event_id, attributionByEventId),
      quote_amount_base_units: payload.quote_amount_base_units,
      token_amount_base_units: payload.token_amount_base_units,
      marginal_price_change_bps: priceMoveBps(beforeState, current),
      real_token_reserves_after_base_units: current.real_token_reserves_base_units,
      curve_complete_after: current.complete,
      reference_token_cost_after_base_units: null,
      reference_token_cost_change_from_previous_base_units: null,
      reference_token_probe_status: referenceTokenProbeBaseUnits === null ? "NOT_CONFIGURED" : current.complete ? "CURVE_COMPLETED" : "PENDING",
    };
    if (referenceTokenProbeBaseUnits !== null && !current.complete) {
      try {
        const beforeProbe = quoteReferenceToken(beforeState, referenceTokenProbeBaseUnits, protocolFeeBps, creatorFeeBps);
        const afterProbe = quoteReferenceToken(current, referenceTokenProbeBaseUnits, protocolFeeBps, creatorFeeBps);
        const beforeCost = BigInt(beforeProbe.input_base_units);
        const afterCost = BigInt(afterProbe.input_base_units);
        impact.reference_token_cost_after_base_units = afterCost.toString();
        impact.reference_token_cost_change_from_previous_base_units = (afterCost - beforeCost).toString();
      } catch (error) {
        impact.reference_token_probe_status = error.code === "INSUFFICIENT_CURVE_INVENTORY" ? "INSUFFICIENT_CURVE_INVENTORY" : "UNAVAILABLE";
      }
    }
    eventImpactJournal.push(impact);
  }
  const priceChange = priceMoveBps(baselineCurveState, current);
  const absolutePriceMove = priceChange === null ? null : (BigInt(priceChange) < 0n ? (-BigInt(priceChange)).toString() : priceChange);

  const baselineRealToken = stateAmount(baselineCurveState, "real_token_reserves_base_units");
  const currentRealToken = stateAmount(current, "real_token_reserves_base_units");
  const inventoryDepletion = baselineRealToken === 0n
    ? null
    : signedBps(baselineRealToken - currentRealToken, baselineRealToken);
  const positiveInventoryDepletion = inventoryDepletion === null ? null : (BigInt(inventoryDepletion) > 0n ? inventoryDepletion : "0");

  const participantFlow = aggregateParticipantFlow(confirmedEvents, attributionByEventId);
  const dimensions = [
    riskDimension(absolutePriceMove, thresholds.absolutePriceMoveBps, "ABSOLUTE_MARGINAL_PRICE_MOVE"),
    riskDimension(positiveInventoryDepletion, thresholds.curveInventoryDepletionBps, "CURVE_REAL_INVENTORY_DEPLETION"),
    riskDimension(participantFlow.external_sell_share_bps, thresholds.externalSellShareBps, "EXTERNAL_SELL_SHARE"),
    riskDimension(participantFlow.external_buy_wallet_hhi_lower_bound_bps, thresholds.buyerConcentrationHhiBps, "EXTERNAL_BUYER_WALLET_CONCENTRATION_LOWER_BOUND"),
    riskDimension(participantFlow.wallet_attribution_coverage_bps === null ? null : (BPS - BigInt(participantFlow.wallet_attribution_coverage_bps)).toString(), thresholds.unknownAttributionShareBps, "UNKNOWN_EXTERNAL_BUYER_ATTRIBUTION_SHARE"),
  ];

  let referenceTokenProbe = { status: "NOT_CONFIGURED" };
  if (referenceTokenProbeBaseUnits !== null) {
    const amount = parseBaseUnits(referenceTokenProbeBaseUnits, { name: "referenceTokenProbeBaseUnits" });
    if (amount === 0n) throw new RangeError("referenceTokenProbeBaseUnits must be positive");
    try {
      const before = quoteReferenceToken(baselineCurveState, amount, protocolFeeBps, creatorFeeBps);
      if (current.complete || current.lifecycle !== "bonding_curve") throw new RangeError("CURVE_COMPLETED");
      const after = quoteReferenceToken(current, amount, protocolFeeBps, creatorFeeBps);
      const beforeCost = BigInt(before.input_base_units);
      const afterCost = BigInt(after.input_base_units);
      const costIncrease = beforeCost === 0n ? null : signedBps(afterCost - beforeCost, beforeCost);
      const positiveCostIncrease = costIncrease === null ? null : (BigInt(costIncrease) > 0n ? costIncrease : "0");
      referenceTokenProbe = {
        status: "AVAILABLE",
        reference_token_amount_base_units: amount.toString(),
        baseline_quote_cost_base_units: beforeCost.toString(),
        current_quote_cost_base_units: afterCost.toString(),
        additional_quote_cost_base_units: (afterCost - beforeCost).toString(),
        cost_change_bps: costIncrease,
      };
      dimensions.push(riskDimension(positiveCostIncrease, thresholds.referenceTokenCostIncreaseBps, "REFERENCE_TOKEN_COST_INCREASE"));
    } catch (error) {
      referenceTokenProbe = {
        status: error.code === "INSUFFICIENT_CURVE_INVENTORY" ? "INSUFFICIENT_CURVE_INVENTORY" : "UNAVAILABLE",
        reason: error.message,
      };
      if (error.code === "INSUFFICIENT_CURVE_INVENTORY" || error.message === "CURVE_COMPLETED") {
        dimensions.push({ metric: "REFERENCE_TOKEN_DEPTH_UNAVAILABLE", value_bps: null, level: "CRITICAL", severity: 3 });
      }
    }
  }

  let referenceQuoteProbe = { status: "NOT_CONFIGURED" };
  if (referenceQuoteProbeBaseUnits !== null) {
    const amount = parseBaseUnits(referenceQuoteProbeBaseUnits, { name: "referenceQuoteProbeBaseUnits" });
    if (amount === 0n) throw new RangeError("referenceQuoteProbeBaseUnits must be positive");
    const before = quoteReferenceBudget(baselineCurveState, amount, protocolFeeBps, creatorFeeBps);
    if (current.complete || current.lifecycle !== "bonding_curve") {
      referenceQuoteProbe = { status: "CURVE_COMPLETED", reason: "current curve is no longer in the bonding-curve phase" };
      dimensions.push({ metric: "REFERENCE_QUOTE_DEPTH_UNAVAILABLE", value_bps: null, level: "CRITICAL", severity: 3 });
    } else {
      const after = quoteReferenceBudget(current, amount, protocolFeeBps, creatorFeeBps);
      const beforeOutput = BigInt(before.output_base_units);
      const afterOutput = BigInt(after.output_base_units);
      const outputReduction = beforeOutput === 0n ? null : signedBps(beforeOutput - afterOutput, beforeOutput);
      referenceQuoteProbe = {
        status: "AVAILABLE",
        reference_quote_budget_base_units: amount.toString(),
        baseline_token_output_base_units: beforeOutput.toString(),
        current_token_output_base_units: afterOutput.toString(),
        token_output_change_base_units: (afterOutput - beforeOutput).toString(),
        token_output_reduction_bps: outputReduction,
      };
    }
  }

  const maxSeverity = dimensions.reduce((max, item) => Math.max(max, item.severity), 0);
  const reconciliationFailed = replayReconciliations.some((item) => item.status !== "PASS");
  const riskLevel = reconciliationFailed
    ? "PAUSE_AND_RECONCILE"
    : current.complete || current.lifecycle !== "bonding_curve"
      ? "CURVE_PHASE_TRANSITION"
      : ["LOW", "WATCH", "HIGH", "CRITICAL"][maxSeverity];
  return {
    schema_version: "1.0.0",
    report_kind: "PUMP_INNER_MARKET_RISK",
    risk_model: "RULE_BASED_PROVISIONAL_V1",
    risk_level: riskLevel,
    baseline_as_of_event_id: baselineCurveState.as_of_event_id ?? null,
    current_as_of_event_id: current.as_of_event_id ?? null,
    current_curve_lifecycle: current.lifecycle,
    curve_complete: current.complete,
    state_reconciliation_status: reconciliationFailed ? "FAIL_OR_UNKNOWN" : replayReconciliations.length === 0 ? "NOT_CHECKED" : "PASS",
    confirmed_event_count: confirmedEvents.length,
    ignored_unconfirmed_event_count: ignoredUnconfirmedEventCount,
    replay_reconciliations: replayReconciliations,
    event_impact_journal: eventImpactJournal,
    curve_state: {
      baseline_virtual_token_reserves_base_units: baselineCurveState.virtual_token_reserves_base_units,
      current_virtual_token_reserves_base_units: current.virtual_token_reserves_base_units,
      baseline_virtual_quote_reserves_base_units: baselineCurveState.virtual_quote_reserves_base_units,
      current_virtual_quote_reserves_base_units: current.virtual_quote_reserves_base_units,
      baseline_real_token_reserves_base_units: baselineCurveState.real_token_reserves_base_units,
      current_real_token_reserves_base_units: current.real_token_reserves_base_units,
      baseline_real_quote_reserves_base_units: baselineCurveState.real_quote_reserves_base_units,
      current_real_quote_reserves_base_units: current.real_quote_reserves_base_units,
      marginal_price_change_bps: priceChange,
      real_token_inventory_depletion_bps: inventoryDepletion,
    },
    participant_flow: participantFlow,
    reference_token_depth_probe: referenceTokenProbe,
    reference_quote_depth_probe: referenceQuoteProbe,
    risk_dimensions: dimensions,
    warnings: [
      "Risk thresholds are provisional and must be calibrated on historical organic launches.",
      "Wallet HHI is reported as lower/upper bounds over all external buy notional; unknown attribution is not silently dropped from the denominator.",
      "A participant class such as SNIPER is supplied by an attribution layer; it is not inferred from trade size or timing alone.",
      "Reference depth probes are fixed diagnostic measurements, not trade recommendations or execution instructions.",
      "A market-state replay failure or ordering gap must be treated as a data-integrity stop, not as a low-risk result.",
      "This report measures observable curve and participant risk; it does not predict future price or guarantee execution outcomes.",
    ],
  };
}
