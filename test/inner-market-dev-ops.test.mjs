import test from "node:test";
import assert from "node:assert/strict";
import { calculateCurveValuation, impliedPriceForMarketCap } from "../src/inner-market/curve-valuation.mjs";
import { calculateLaunchBudget, allocateTokenSupply } from "../src/inner-market/launch-budget.mjs";
import { replayTreasuryTradePnl } from "../src/inner-market/treasury-pnl.mjs";
import { reconcileExecutionBatch } from "../src/inner-market/batch-reconciliation.mjs";
import { evaluateInnerMarketPolicy } from "../src/inner-market/policy-guard.mjs";

function syntheticTrade(eventId, sequence, eventKind, tokenAmount, quoteAmount, fee = "0", status = "CONFIRMED") {
  return {
    event_id: eventId,
    provenance: "synthetic",
    event_time_ms: sequence * 1000,
    ordering: { ordering_confidence: "synthetic", event_sequence: sequence },
    status,
    event_kind: eventKind,
    token_amount_base_units: tokenAmount,
    quote_amount_base_units: quoteAmount,
    fee_quote_base_units: fee,
  };
}

test("curve valuation keeps virtual pricing reserves separate from real balances", () => {
  const result = calculateCurveValuation({
    virtualTokenReservesBaseUnits: "1000000000", virtualQuoteReservesBaseUnits: "100000000",
    realTokenReservesBaseUnits: "700000000", realQuoteReservesBaseUnits: "12000000",
    tokenDecimals: 0, quoteDecimals: 0, circulatingSupplyBaseUnits: "200000000",
    totalSupplyBaseUnits: "1000000000", treasuryTokenBalanceBaseUnits: "100000000",
  });
  assert.equal(result.price_quote_per_token, "0.1");
  assert.equal(result.market_cap_quote, "20000000");
  assert.equal(result.fdv_quote, "100000000");
  assert.equal(result.reserves.real_quote_base_units, "12000000");
});

test("target market cap helper returns implied price, not required buy capital", () => {
  const result = impliedPriceForMarketCap({ targetMarketCapQuote: "2000000", circulatingSupplyBaseUnits: "200000000", tokenDecimals: 0 });
  assert.equal(result.implied_price_quote_per_token, "0.01");
  assert.match(result.note, /not a capital requirement/);
});

test("launch budget uses integer base units and rounds contingency up", () => {
  const result = calculateLaunchBudget({ creationAndNetworkCostsBaseUnits: "100", treasuryReserveBaseUnits: "200", operatingReserveBaseUnits: "50", contingencyBps: "500" });
  assert.equal(result.subtotal_base_units, "350");
  assert.equal(result.contingency_base_units, "18");
  assert.equal(result.total_budget_base_units, "368");
});

test("token allocations reconcile exactly", () => {
  const result = allocateTokenSupply("1001", [
    { name: "public", bps: "5000" }, { name: "treasury", bps: "3000" }, { name: "ecosystem", bps: "2000" },
  ]);
  assert.deepEqual(result.map((item) => item.token_amount_base_units), ["500", "300", "201"]);
  assert.equal(result.reduce((sum, item) => sum + BigInt(item.token_amount_base_units), 0n), 1001n);
});

test("treasury PnL uses confirmed trades only and weighted-average cost", () => {
  const result = replayTreasuryTradePnl({
    events: [
      syntheticTrade("1", 1, "CURVE_BUY_EXECUTED", "100", "1000", "10"),
      syntheticTrade("2", 2, "CURVE_BUY_EXECUTED", "100", "1200", "10"),
      syntheticTrade("3", 3, "CURVE_SELL_EXECUTED", "100", "1500", "10"),
      syntheticTrade("4", 4, "CURVE_SELL_EXECUTED", "100", "2000", "10", "PENDING"),
    ],
  });
  assert.equal(result.ending_token_balance_base_units, "100");
  assert.equal(result.remaining_cost_basis_quote_base_units, "1110");
  assert.equal(result.realized_pnl_quote_base_units, "380");
  assert.equal(result.ignored_unconfirmed_count, 1);
});

test("treasury ledger rejects sells larger than verified inventory", () => {
  assert.throws(() => replayTreasuryTradePnl({
    events: [syntheticTrade("x", 1, "CURVE_SELL_EXECUTED", "1", "1")],
  }), /exceeds treasury token inventory/);
});

test("batch reconciliation deduplicates signatures and separates receipt states", () => {
  const result = reconcileExecutionBatch([
    { batch_id: "b1", signature: "sig1", status: "CONFIRMED", side: "BUY", quote_amount_base_units: "100", token_amount_base_units: "20", fee_quote_base_units: "2" },
    { batch_id: "b1", signature: "sig2", status: "FAILED", side: "SELL" },
  ]);
  assert.equal(result[0].confirmed_count, 1);
  assert.equal(result[0].failed_count, 1);
  assert.equal(result[0].confirmed_buy_quote_spent_base_units, "102");
  assert.throws(() => reconcileExecutionBatch([
    { batch_id: "b1", signature: "same", status: "PENDING" },
    { batch_id: "b2", signature: "same", status: "PENDING" },
  ]), /duplicate transaction signature/);
});

test("policy guard pauses on stale or unreconciled market state", () => {
  const result = evaluateInnerMarketPolicy({
    market: { reconciled: false, complete: true, lifecycle: "bonding_curve", observedAtMs: 0 },
    treasury: { quoteSpentBaseUnits: "50", tokenBalanceBaseUnits: "10" },
    limits: { maxDataAgeMs: 1000, maxQuoteBudgetBaseUnits: "100", maxTokenInventoryBaseUnits: "100" },
    nowMs: 2000,
  });
  assert.equal(result.status, "PAUSE_AND_RECONCILE");
  assert.ok(result.reasons.includes("CURVE_STATE_NOT_RECONCILED"));
  assert.ok(result.reasons.includes("STALE_OR_FUTURE_MARKET_DATA"));
});