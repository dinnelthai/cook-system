const DEFAULT_LIMITS = Object.freeze({
  maxAbsoluteInventorySkew: 0.35,
  maxRealizedVolatility: 0.12,
  maxDrawdown: 0.25,
  minQuoteDepth: 0,
  maxDataAgeMs: 30_000,
});

function validNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

/**
 * Deterministic, recommendation-only LP risk gate. It never creates or submits orders.
 * Missing, stale, or unreconciled data always fails closed.
 */
export function evaluateLpRisk({ market, inventory, limits = {}, nowMs }) {
  if (!market || !inventory) throw new TypeError("market and inventory are required");
  const policy = { ...DEFAULT_LIMITS, ...limits };
  const reasons = [];
  const age = validNumber(market.dataAgeMs, "market.dataAgeMs");
  const volatility = validNumber(market.realizedVolatility, "market.realizedVolatility");
  const drawdown = validNumber(market.drawdown, "market.drawdown");
  const depth = validNumber(market.quoteDepth, "market.quoteDepth");
  const skew = inventory.inventorySkew;
  if (!Number.isFinite(nowMs)) throw new TypeError("nowMs must be finite");
  if (market.reconciled !== true) reasons.push("STATE_NOT_RECONCILED");
  if (market.complete !== true) reasons.push("MARKET_DATA_INCOMPLETE");
  if (age < 0 || age > policy.maxDataAgeMs) reasons.push("STALE_MARKET_DATA");
  if (depth < policy.minQuoteDepth) reasons.push("INSUFFICIENT_QUOTE_DEPTH");
  if (skew === null || !Number.isFinite(skew)) reasons.push("INVENTORY_UNAVAILABLE");
  else if (Math.abs(skew) > policy.maxAbsoluteInventorySkew) reasons.push("INVENTORY_SKEW_LIMIT");
  if (volatility > policy.maxRealizedVolatility) reasons.push("VOLATILITY_LIMIT");
  if (drawdown < -policy.maxDrawdown) reasons.push("DRAWDOWN_LIMIT");
  const hardStop = reasons.some((reason) => [
    "STATE_NOT_RECONCILED", "MARKET_DATA_INCOMPLETE", "STALE_MARKET_DATA",
    "INSUFFICIENT_QUOTE_DEPTH", "INVENTORY_UNAVAILABLE",
  ].includes(reason));
  const action = hardStop ? "PAUSE" : reasons.length ? "REDUCE_RISK" : "HOLD_OR_EVALUATE";
  return {
    schema_version: "1.0.0",
    action,
    reasons,
    evaluated_at_ms: nowMs,
    model: "lp-risk-gate-v1",
    execution_enabled: false,
  };
}