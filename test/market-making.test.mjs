import test from "node:test";
import assert from "node:assert/strict";
import { calculateMarketRegime, calculateInventoryExposure, calculateConstantProductImpermanentLoss, calculateLpNetEconomics } from "../src/market-making/metrics.mjs";
import { evaluateLpRisk } from "../src/market-making/risk-engine.mjs";

test("market regime metrics are deterministic", () => {
  const result = calculateMarketRegime({ prices: [100, 110, 105] });
  assert.equal(result.observations, 3);
  assert.ok(result.realized_volatility > 0);
  assert.ok(result.drawdown < 0);
});

test("inventory exposure reports marked base weight and skew", () => {
  const result = calculateInventoryExposure({ baseAmount: 5, basePrice: 10, quoteAmount: 25, targetBaseWeight: 0.5 });
  assert.equal(result.base_weight, 2 / 3);
  assert.ok(Math.abs(result.inventory_skew - 1 / 6) < 1e-12);
});

test("constant-product IL is zero at unchanged price and negative after a move", () => {
  assert.equal(calculateConstantProductImpermanentLoss({ initialPrice: 1, currentPrice: 1 }).lp_vs_hodl_ratio, 0);
  assert.ok(calculateConstantProductImpermanentLoss({ initialPrice: 1, currentPrice: 4 }).lp_vs_hodl_ratio < 0);
});

test("LP economics separates fees and transaction costs", () => {
  const result = calculateLpNetEconomics({ initialCapital: 100, currentPositionValue: 96, accruedFees: 5, claimedFees: 1, transactionCosts: 2 });
  assert.equal(result.absolute_pnl, 0);
  assert.equal(result.fee_income, 6);
});

test("risk engine fails closed on stale or unreconciled market state", () => {
  const result = evaluateLpRisk({
    market: { dataAgeMs: 60_000, realizedVolatility: 0.01, drawdown: 0, quoteDepth: 100, reconciled: false, complete: true },
    inventory: { inventorySkew: 0.02 }, limits: {}, nowMs: 100_000,
  });
  assert.equal(result.action, "PAUSE");
  assert.ok(result.reasons.includes("STATE_NOT_RECONCILED"));
  assert.ok(result.reasons.includes("STALE_MARKET_DATA"));
  assert.equal(result.execution_enabled, false);
});

test("risk engine recommends risk reduction when soft risk limits breach", () => {
  const result = evaluateLpRisk({
    market: { dataAgeMs: 100, realizedVolatility: 0.2, drawdown: -0.3, quoteDepth: 100, reconciled: true, complete: true },
    inventory: { inventorySkew: 0.1 }, limits: {}, nowMs: 100_000,
  });
  assert.equal(result.action, "REDUCE_RISK");
  assert.ok(result.reasons.includes("VOLATILITY_LIMIT"));
});