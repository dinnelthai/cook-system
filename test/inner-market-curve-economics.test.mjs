import test from "node:test";
import assert from "node:assert/strict";
import { buildCurveEconomicsReport } from "../src/inner-market/curve-economics.mjs";

function sampleState(overrides = {}) {
  return {
    market: { chain_id: "solana", network: "mainnet-beta", token_mint: "mint", quote_mint: "sol", curve_program_id: "pump" },
    virtual_token_reserves_base_units: "1000",
    virtual_quote_reserves_base_units: "100",
    real_token_reserves_base_units: "700",
    real_quote_reserves_base_units: "12",
    token_total_supply_base_units: "1000",
    protocol_fees_base_units: "3",
    creator_fees_base_units: "2",
    complete: false,
    lifecycle: "bonding_curve",
    as_of_event_id: "evt-4",
    curve_buy_quote_volume_base_units: "1200",
    curve_sell_quote_volume_base_units: "500",
    curve_token_volume_base_units: "9000",
    execution_count: 4,
    ...overrides,
  };
}

test("curve economics reports marginal valuation and separates virtual from real reserves", () => {
  const report = buildCurveEconomicsReport({
    curveState: sampleState(),
    tokenDecimals: 0,
    quoteDecimals: 0,
    circulatingSupplyBaseUnits: "800",
    treasuryTokenBalanceBaseUnits: "100",
    initialRealTokenReservesBaseUnits: "800",
  });
  assert.equal(report.valuation.price_quote_per_token, "0.1");
  assert.equal(report.valuation.market_cap_quote, "80");
  assert.equal(report.valuation.fdv_quote, "100");
  assert.equal(report.reserves.virtual_quote_base_units, "100");
  assert.equal(report.reserves.program_reported_real_quote_reserve_base_units, "12");
  assert.equal(report.reserves.total_fee_balance_base_units, "5");
  assert.equal(report.supply.curve_inventory_depletion_from_initial_bps, "1250");
});

test("curve economics distinguishes gross turnover from signed net quote flow", () => {
  const report = buildCurveEconomicsReport({
    curveState: sampleState(), tokenDecimals: 0, quoteDecimals: 0, circulatingSupplyBaseUnits: "800",
  });
  assert.equal(report.activity.gross_quote_turnover_base_units, "1700");
  assert.equal(report.activity.net_buy_minus_sell_quote_flow_base_units, "700");
  assert.equal(report.activity.buy_quote_share_of_turnover_bps, "7058");
  assert.equal(report.activity.sell_quote_share_of_turnover_bps, "2941");
});

test("curve economics permits net sell flow and leaves undefined ratios explicit", () => {
  const report = buildCurveEconomicsReport({
    curveState: sampleState({ curve_buy_quote_volume_base_units: "0", curve_sell_quote_volume_base_units: "500" }),
    tokenDecimals: 0, quoteDecimals: 0, circulatingSupplyBaseUnits: "800",
  });
  assert.equal(report.activity.net_buy_minus_sell_quote_flow_base_units, "-500");
  assert.equal(report.activity.buy_quote_share_of_turnover_bps, "0");
  assert.equal(report.activity.sell_quote_share_of_turnover_bps, "10000");
  const empty = buildCurveEconomicsReport({
    curveState: sampleState({ curve_buy_quote_volume_base_units: "0", curve_sell_quote_volume_base_units: "0" }),
    tokenDecimals: 0, quoteDecimals: 0, circulatingSupplyBaseUnits: "800",
  });
  assert.equal(empty.activity.buy_quote_share_of_turnover_bps, null);
  assert.equal(empty.activity.sell_quote_share_of_turnover_bps, null);
});

test("curve economics flags disagreement between completion flag and lifecycle", () => {
  const report = buildCurveEconomicsReport({
    curveState: sampleState({ complete: true, lifecycle: "bonding_curve" }),
    tokenDecimals: 0, quoteDecimals: 0, circulatingSupplyBaseUnits: "800",
  });
  assert.equal(report.lifecycle_consistent, false);
  assert.ok(report.warnings.some((warning) => warning.includes("disagree")));
});