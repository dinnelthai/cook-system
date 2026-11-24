import test from "node:test";
import assert from "node:assert/strict";
import { createInitialCurveState } from "../src/core/market-state.mjs";
import { assessInnerMarketRisk } from "../src/inner-market/market-risk.mjs";

const market = {
  chain_id: "solana",
  network: "mainnet-beta",
  token_mint: "risk-test-mint",
  quote_mint: "sol",
  curve_program_id: "pump",
};

function baselineState(overrides = {}) {
  return createInitialCurveState({
    market,
    reserves: {
      virtual_token_reserves_base_units: "1000",
      virtual_quote_reserves_base_units: "100",
      real_token_reserves_base_units: "700",
      real_quote_reserves_base_units: "0",
      token_total_supply_base_units: "1000",
      protocol_fees_base_units: "0",
      creator_fees_base_units: "0",
      complete: false,
      ...overrides,
    },
    asOfEventId: "dev-first-buy",
  });
}

function trade(eventId, sequence, kind, quote, tokens, postState, status = "CONFIRMED") {
  return {
    event_id: eventId,
    provenance: "synthetic",
    event_time_ms: sequence * 1000,
    ordering: { ordering_confidence: "synthetic", event_sequence: sequence },
    status,
    event_kind: kind,
    market,
    payload: {
      quote_amount_base_units: quote,
      token_amount_base_units: tokens,
      post_curve_state: postState,
      fee_balances_delta: { protocol_fees_base_units: "0", creator_fees_base_units: "0" },
    },
  };
}

const thresholds = {
  absolutePriceMoveBps: { watch: "500", high: "1000", critical: "2000" },
  referenceTokenCostIncreaseBps: { watch: "500", high: "1000", critical: "2000" },
  curveInventoryDepletionBps: { watch: "1000", high: "3000", critical: "6000" },
  externalSellShareBps: { watch: "2500", high: "5000", critical: "7500" },
  buyerConcentrationHhiBps: { watch: "2500", high: "5000", critical: "7500" },
  unknownAttributionShareBps: { watch: "2000", high: "5000", critical: "8000" },
  referenceQuoteOutputReductionBps: { watch: "500", high: "1000", critical: "2000" },
};

test("external sniper buy changes the next fixed reference token cost and quote depth", () => {
  const baseline = baselineState();
  const events = [
    trade("sniper-buy", 1, "CURVE_BUY_EXECUTED", "10", "82", {
      virtual_token_reserves_base_units: "918",
      virtual_quote_reserves_base_units: "110",
      real_token_reserves_base_units: "618",
      real_quote_reserves_base_units: "10",
      complete: false,
    }),
  ];
  const report = assessInnerMarketRisk({
    baselineCurveState: baseline,
    interveningEvents: events,
    protocolFeeBps: "0",
    creatorFeeBps: "0",
    referenceTokenProbeBaseUnits: "100",
    referenceQuoteProbeBaseUnits: "5",
    attributionByEventId: {
      "sniper-buy": { participantClass: "SNIPER", walletAddress: "sniper-wallet" },
    },
    thresholds,
  });

  assert.equal(report.participant_flow.by_class.SNIPER.confirmed_execution_count, 1);
  assert.equal(report.participant_flow.external_buy_quote_base_units, "10");
  assert.equal(report.participant_flow.external_buy_wallet_hhi_bps, "10000");
  assert.equal(report.reference_token_depth_probe.status, "AVAILABLE");
  assert.ok(BigInt(report.reference_token_depth_probe.additional_quote_cost_base_units) > 0n);
  assert.ok(BigInt(report.reference_quote_depth_probe.token_output_reduction_bps) > 0n);
  assert.equal(report.risk_level, "HIGH");
  assert.ok(report.risk_dimensions.some((item) => item.metric === "REFERENCE_TOKEN_COST_INCREASE"));
  assert.equal(report.risk_dimensions.find((item) => item.metric === "EXTERNAL_BUYER_WALLET_CONCENTRATION_LOWER_BOUND").level, "WATCH_SAMPLE_LIMITED");
});

test("unconfirmed trades do not alter curve state or participant risk flow", () => {
  const report = assessInnerMarketRisk({
    baselineCurveState: baselineState(),
    interveningEvents: [
      trade("pending", 1, "CURVE_BUY_EXECUTED", "100", "300", {
        virtual_token_reserves_base_units: "700",
        virtual_quote_reserves_base_units: "200",
        real_token_reserves_base_units: "400",
        real_quote_reserves_base_units: "100",
        complete: false,
      }, "PENDING"),
    ],
    protocolFeeBps: "0",
    creatorFeeBps: "0",
    attributionByEventId: {},
    thresholds,
  });

  assert.equal(report.confirmed_event_count, 0);
  assert.equal(report.ignored_unconfirmed_event_count, 1);
  assert.equal(report.current_as_of_event_id, "dev-first-buy");
  assert.equal(report.participant_flow.external_buy_quote_base_units, "0");
  assert.equal(report.event_impact_journal.length, 0);
  assert.equal(report.risk_level, "LOW");
});

test("unknown wallet attribution is not guessed as a sniper or independent buyer", () => {
  const report = assessInnerMarketRisk({
    baselineCurveState: baselineState(),
    interveningEvents: [
      trade("unknown-buy", 1, "CURVE_BUY_EXECUTED", "10", "82", {
        virtual_token_reserves_base_units: "918",
        virtual_quote_reserves_base_units: "110",
        real_token_reserves_base_units: "618",
        real_quote_reserves_base_units: "10",
        complete: false,
      }),
    ],
    protocolFeeBps: "0",
    creatorFeeBps: "0",
    attributionByEventId: {},
    thresholds,
  });

  assert.equal(report.participant_flow.by_class.UNKNOWN.confirmed_execution_count, 1);
  assert.equal(report.participant_flow.external_buy_wallet_hhi_lower_bound_bps, "0");
  assert.equal(report.participant_flow.external_buy_wallet_hhi_upper_bound_bps, "10000");
  assert.equal(report.participant_flow.wallet_attribution_coverage_bps, "0");
  assert.equal(report.risk_level, "CRITICAL");
});

test("curve phase completion is surfaced as a transition, not a low-risk active curve", () => {
  const report = assessInnerMarketRisk({
    baselineCurveState: baselineState(),
    interveningEvents: [
      trade("complete", 1, "CURVE_BUY_EXECUTED", "100", "700", {
        virtual_token_reserves_base_units: "300",
        virtual_quote_reserves_base_units: "200",
        real_token_reserves_base_units: "0",
        real_quote_reserves_base_units: "100",
        complete: true,
      }),
    ],
    protocolFeeBps: "0",
    creatorFeeBps: "0",
    referenceTokenProbeBaseUnits: "10",
    thresholds,
  });

  assert.equal(report.risk_level, "CURVE_PHASE_TRANSITION");
  assert.equal(report.curve_complete, true);
  assert.equal(report.reference_token_depth_probe.status, "UNAVAILABLE");
});

test("incomplete event ordering fails closed instead of returning a low-risk report", () => {
  const event = trade("bad-order", 1, "CURVE_BUY_EXECUTED", "10", "82", {
    virtual_token_reserves_base_units: "920",
    virtual_quote_reserves_base_units: "110",
    real_token_reserves_base_units: "620",
    real_quote_reserves_base_units: "10",
    complete: false,
  });
  event.ordering.ordering_confidence = "unknown";
  assert.throws(() => assessInnerMarketRisk({
    baselineCurveState: baselineState(),
    interveningEvents: [event],
    protocolFeeBps: "0",
    creatorFeeBps: "0",
    thresholds,
  }), /cannot be replayed in exact order/);
});

test("curve-state snapshot mismatch forces reconciliation pause", () => {
  const state = baselineState();
  const event = {
    event_id: "bad-snapshot",
    provenance: "synthetic",
    event_time_ms: 1000,
    ordering: { ordering_confidence: "synthetic", event_sequence: 1 },
    status: "CONFIRMED",
    event_kind: "CURVE_STATE_SNAPSHOT",
    market,
    payload: {
      state: {
        virtual_token_reserves_base_units: "999",
        virtual_quote_reserves_base_units: "100",
        real_token_reserves_base_units: "700",
        real_quote_reserves_base_units: "0",
        token_total_supply_base_units: "1000",
        protocol_fees_base_units: "0",
        creator_fees_base_units: "0",
        complete: false,
      },
    },
  };
  const report = assessInnerMarketRisk({
    baselineCurveState: state,
    interveningEvents: [event],
    protocolFeeBps: "0",
    creatorFeeBps: "0",
    thresholds,
  });
  assert.equal(report.state_reconciliation_status, "FAIL_OR_UNKNOWN");
  assert.equal(report.risk_level, "PAUSE_AND_RECONCILE");
});
