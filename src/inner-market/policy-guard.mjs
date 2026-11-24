import { parseBaseUnits } from "../core/integer.mjs";

/** Read-only policy gate for treasury operations; it does not recommend trade direction or size. */
export function evaluateInnerMarketPolicy({ market, treasury, limits, nowMs }) {
  if (!market || !treasury || !limits) throw new TypeError("market, treasury, and limits are required");
  if (!Number.isFinite(nowMs) || !Number.isFinite(market.observedAtMs)) throw new TypeError("timestamps must be finite");
  if (!Number.isFinite(limits.maxDataAgeMs) || limits.maxDataAgeMs < 0) throw new RangeError("maxDataAgeMs must be a non-negative finite number");
  if (typeof market.complete !== "boolean") throw new TypeError("market.complete must be the bonding-curve completion flag");
  const reasons = [];
  if (market.reconciled !== true) reasons.push("CURVE_STATE_NOT_RECONCILED");
  if (market.dataComplete !== true) reasons.push("MARKET_DATA_INCOMPLETE");
  if (market.complete || market.lifecycle !== "bonding_curve") reasons.push("NOT_IN_BONDING_CURVE_PHASE");
  const ageMs = nowMs - market.observedAtMs;
  if (ageMs < 0 || ageMs > limits.maxDataAgeMs) reasons.push("STALE_OR_FUTURE_MARKET_DATA");

  const spent = parseBaseUnits(treasury.quoteSpentBaseUnits || "0", { name: "treasury.quoteSpentBaseUnits" });
  const budget = parseBaseUnits(limits.maxQuoteBudgetBaseUnits, { name: "limits.maxQuoteBudgetBaseUnits" });
  const tokenBalance = parseBaseUnits(treasury.tokenBalanceBaseUnits || "0", { name: "treasury.tokenBalanceBaseUnits" });
  const tokenCap = parseBaseUnits(limits.maxTokenInventoryBaseUnits, { name: "limits.maxTokenInventoryBaseUnits" });
  if (spent > budget) reasons.push("APPROVED_QUOTE_BUDGET_EXCEEDED");
  if (tokenBalance > tokenCap) reasons.push("APPROVED_TOKEN_INVENTORY_CAP_EXCEEDED");

  const hardStopReasons = new Set([
    "CURVE_STATE_NOT_RECONCILED", "MARKET_DATA_INCOMPLETE",
    "NOT_IN_BONDING_CURVE_PHASE", "STALE_OR_FUTURE_MARKET_DATA",
  ]);
  const hardStop = reasons.some((reason) => hardStopReasons.has(reason));
  return {
    policy: "INNER_MARKET_TREASURY_GUARD_V1",
    status: hardStop ? "PAUSE_AND_RECONCILE" : reasons.length ? "MANUAL_REVIEW_REQUIRED" : "WITHIN_CONFIGURED_LIMITS",
    reasons,
    market_data_age_ms: ageMs,
    execution_enabled: false,
  };
}