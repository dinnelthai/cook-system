import test from "node:test";
import assert from "node:assert/strict";
import {
  U64_MAX,
  parseBaseUnits,
  formatBaseUnits,
  checkedAddU64,
  checkedAddU128,
  checkedSubU64,
  mulDivFloor,
  mulDivCeil,
} from "../src/core/integer.mjs";
import {
  sortForReplay,
  IncompleteEventOrderError,
  ConflictingDuplicateEventError,
} from "../src/core/event-order.mjs";
import { buildRawCandles } from "../src/core/candle-builder.mjs";
import {
  createInitialCurveState,
  replayCurveEvents,
  CurveStateTransitionError,
} from "../src/core/market-state.mjs";

const market = {
  chain_id: "solana",
  network: "local_sim",
  token_mint: "MINT_A",
  quote_mint: "WSOL",
  curve_program_id: "PUMP_PROGRAM",
  market_phase: "bonding_curve",
};

function execution({ id, sequence, time, kind, price, quote, token, provenance = "synthetic" }) {
  return {
    schema_version: "1.0.0",
    event_id: id,
    provenance,
    event_kind: kind,
    market,
    event_time_ms: time,
    ordering: provenance === "synthetic"
      ? { event_sequence: sequence, ordering_confidence: "synthetic" }
      : { slot: 10, transaction_index: 0, instruction_index: sequence, inner_instruction_index: null, event_sequence: sequence, ordering_confidence: "complete" },
    source: { source_type: "simulator", source_id: "test", signature: null, adapter_version: "test" },
    payload: {
      actor_address: `wallet_${id}`,
      token_amount_base_units: token,
      quote_amount_base_units: quote,
      quote_mint: "WSOL",
      execution_price_decimal: price,
      fee_components: [],
    },
    quality: { is_complete: true, validation_status: "valid", warnings: [] },
    ...(provenance === "synthetic" ? { synthetic_metadata: { scenario_id: "fixture", random_seed: 7, generator_version: "test" } } : {}),
  };
}

function curveEvent({ id, sequence, kind, payload, provenance = "synthetic" }) {
  return {
    event_id: id,
    provenance,
    event_kind: kind,
    market,
    event_time_ms: 1000 + sequence,
    ordering: provenance === "synthetic"
      ? { event_sequence: sequence, ordering_confidence: "synthetic" }
      : { slot: 20, transaction_index: 0, instruction_index: sequence, inner_instruction_index: null, event_sequence: sequence, ordering_confidence: "complete" },
    payload,
  };
}

const initialCurve = () => createInitialCurveState({
  market,
  reserves: {
    virtual_token_reserves_base_units: "1000000",
    virtual_quote_reserves_base_units: "1000000",
    real_token_reserves_base_units: "500000",
    real_quote_reserves_base_units: "0",
    token_total_supply_base_units: "1500000",
    protocol_fees_base_units: "0",
    creator_fees_base_units: "0",
    complete: false,
  },
});

test("base-unit helpers use exact integer arithmetic and enforce u64 bounds", () => {
  assert.equal(parseBaseUnits("9007199254740993"), 9007199254740993n);
  assert.equal(formatBaseUnits(9007199254740993n), "9007199254740993");
  assert.equal(checkedAddU64(4n, 5n), 9n);
  assert.equal(checkedAddU128(U64_MAX, 1n), U64_MAX + 1n);
  assert.equal(checkedSubU64(9n, 5n), 4n);
  assert.equal(mulDivFloor(10n, 10n, 6n), 16n);
  assert.equal(mulDivCeil(10n, 10n, 6n), 17n);
  assert.throws(() => parseBaseUnits("01"), TypeError);
  assert.throws(() => parseBaseUnits((U64_MAX + 1n).toString()), RangeError);
  assert.throws(() => checkedSubU64(1n, 2n), RangeError);
  assert.throws(() => checkedAddU64(U64_MAX, 1n), RangeError);
});

test("observed replay follows chain order rather than timestamp order", () => {
  const a = execution({ id: "a", sequence: 0, time: 2000, kind: "CURVE_BUY_EXECUTED", price: "1", quote: "10", token: "10", provenance: "observed_chain" });
  const b = execution({ id: "b", sequence: 1, time: 1000, kind: "CURVE_SELL_EXECUTED", price: "0.8", quote: "8", token: "10", provenance: "observed_chain" });
  assert.deepEqual(sortForReplay([b, a]).map((event) => event.event_id), ["a", "b"]);
});

test("replay rejects partial chain order and conflicting duplicate IDs", () => {
  const a = execution({ id: "a", sequence: 0, time: 1000, kind: "CURVE_BUY_EXECUTED", price: "1", quote: "10", token: "10", provenance: "observed_chain" });
  const partial = { ...a, event_id: "partial", ordering: { ...a.ordering, ordering_confidence: "partial" } };
  assert.throws(() => sortForReplay([partial]), IncompleteEventOrderError);
  assert.throws(() => sortForReplay([a, { ...a, payload: { ...a.payload, quote_amount_base_units: "11" } }]), ConflictingDuplicateEventError);
});

test("raw candles aggregate only confirmed curve executions and keep integer volume", () => {
  const events = [
    execution({ id: "e2", sequence: 1, time: 2000, kind: "CURVE_SELL_EXECUTED", price: "0.00011", quote: "20", token: "200" }),
    execution({ id: "e1", sequence: 0, time: 1000, kind: "CURVE_BUY_EXECUTED", price: "0.0001", quote: "10", token: "100" }),
    execution({ id: "e3", sequence: 2, time: 3000, kind: "CURVE_BUY_EXECUTED", price: "0.00009", quote: "30", token: "300" }),
    { event_id: "transfer", event_kind: "TOKEN_TRANSFER" },
    { event_id: "post-complete", event_kind: "POST_COMPLETE_POOL_LEG" },
  ];
  const [candle] = buildRawCandles(events, 60_000);
  assert.equal(candle.open_price, "0.0001");
  assert.equal(candle.high_price, "0.00011");
  assert.equal(candle.low_price, "0.00009");
  assert.equal(candle.close_price, "0.00009");
  assert.equal(candle.quote_volume_base_units, "60");
  assert.equal(candle.token_volume_base_units, "600");
  assert.equal(candle.buy_quote_volume_base_units, "40");
  assert.equal(candle.sell_quote_volume_base_units, "20");
  assert.equal(candle.execution_count, 3);
  assert.equal(candle.first_event_id, "e1");
  assert.equal(candle.last_event_id, "e3");
  assert.equal(candle.provenance, "synthetic");
});

test("raw candles separate observed and synthetic streams", () => {
  const observed = execution({ id: "o1", sequence: 0, time: 1000, kind: "CURVE_BUY_EXECUTED", price: "1", quote: "10", token: "10", provenance: "observed_chain" });
  const synthetic = execution({ id: "s1", sequence: 0, time: 1000, kind: "CURVE_BUY_EXECUTED", price: "1", quote: "10", token: "10", provenance: "synthetic" });
  assert.throws(() => buildRawCandles([observed, synthetic], 60_000), /replayed separately/);
});

test("curve event replay applies confirmed post-state and keeps non-curve events out of reserves", () => {
  const buy = curveEvent({
    id: "buy-1",
    sequence: 0,
    kind: "CURVE_BUY_EXECUTED",
    payload: {
      quote_amount_base_units: "100",
      token_amount_base_units: "900",
      post_curve_state: {
        virtual_token_reserves_base_units: "999100",
        virtual_quote_reserves_base_units: "1000100",
        real_token_reserves_base_units: "499100",
        real_quote_reserves_base_units: "100",
        complete: false,
      },
    },
  });
  const transfer = curveEvent({ id: "transfer-1", sequence: 1, kind: "TOKEN_TRANSFER", payload: { token_amount_base_units: "50" } });
  const postCompleteLeg = curveEvent({ id: "pool-leg", sequence: 2, kind: "POST_COMPLETE_POOL_LEG", payload: { quote_amount_base_units: "500" } });
  const result = replayCurveEvents(initialCurve(), [postCompleteLeg, transfer, buy]);
  assert.equal(result.state.virtual_quote_reserves_base_units, "1000100");
  assert.equal(result.state.real_token_reserves_base_units, "499100");
  assert.equal(result.state.curve_buy_quote_volume_base_units, "100");
  assert.equal(result.state.curve_sell_quote_volume_base_units, "0");
  assert.equal(result.state.execution_count, 1);
  assert.equal(result.state.ignored_non_curve_event_count, 1);
  assert.equal(result.state.post_complete_pool_leg_count, 1);
});

test("curve snapshots report mismatches without overwriting replayed state", () => {
  const buy = curveEvent({
    id: "buy-2",
    sequence: 0,
    kind: "CURVE_BUY_EXECUTED",
    payload: {
      quote_amount_base_units: "100",
      token_amount_base_units: "900",
      post_curve_state: {
        virtual_token_reserves_base_units: "999100",
        virtual_quote_reserves_base_units: "1000100",
        real_token_reserves_base_units: "499100",
        real_quote_reserves_base_units: "100",
        complete: false,
      },
    },
  });
  const snapshot = curveEvent({
    id: "snapshot-1",
    sequence: 1,
    kind: "CURVE_STATE_SNAPSHOT",
    payload: { state: {
      virtual_token_reserves_base_units: "999100",
      virtual_quote_reserves_base_units: "1000101",
      real_token_reserves_base_units: "499100",
      real_quote_reserves_base_units: "100",
      token_total_supply_base_units: "1500000",
      protocol_fees_base_units: "0",
      creator_fees_base_units: "0",
      complete: false,
    } },
  });
  const result = replayCurveEvents(initialCurve(), [buy, snapshot]);
  assert.equal(result.reconciliations[0].status, "FAIL");
  assert.equal(result.reconciliations[0].mismatches[0].field, "virtual_quote_reserves_base_units");
  assert.equal(result.state.virtual_quote_reserves_base_units, "1000100");
});

test("curve execution is rejected after completion", () => {
  const completeBuy = curveEvent({
    id: "last-buy",
    sequence: 0,
    kind: "CURVE_BUY_EXECUTED",
    payload: {
      quote_amount_base_units: "100",
      token_amount_base_units: "500000",
      post_curve_state: {
        virtual_token_reserves_base_units: "499100",
        virtual_quote_reserves_base_units: "1000100",
        real_token_reserves_base_units: "0",
        real_quote_reserves_base_units: "100",
        complete: true,
      },
    },
  });
  const invalidSell = curveEvent({
    id: "after-complete-sell",
    sequence: 1,
    kind: "CURVE_SELL_EXECUTED",
    payload: {
      quote_amount_base_units: "10",
      token_amount_base_units: "10",
      post_curve_state: {
        virtual_token_reserves_base_units: "499110",
        virtual_quote_reserves_base_units: "1000090",
        real_token_reserves_base_units: "10",
        real_quote_reserves_base_units: "90",
        complete: false,
      },
    },
  });
  assert.throws(() => replayCurveEvents(initialCurve(), [completeBuy, invalidSell]), CurveStateTransitionError);
});

function recordedBuy(post={}){
 return curveEvent({id:"observed-buy",sequence:0,kind:"CURVE_BUY_EXECUTED",provenance:"observed_chain",payload:{quote_amount_base_units:"100",token_amount_base_units:"900",post_curve_state:{virtual_token_reserves_base_units:"999100",virtual_quote_reserves_base_units:"1000100",real_token_reserves_base_units:"499100",real_quote_reserves_base_units:"100",complete:false,...post}}});
}
test("recorded reserve audit reports consistent token movement separately from quote or fee parity",()=>{
 const r=replayCurveEvents(initialCurve(),[recordedBuy()]);
 assert.equal(r.recorded_reserve_audit.status,"RECORDED_TOKEN_MOVEMENTS_MATCH");
 assert.equal(r.recorded_reserve_audit.quote_fee_parity,"NOT_CHECKED");
 assert.equal(r.recorded_reserve_audit.source_attestation,"UNKNOWN");
});
test("contradictory recorded token movement is diagnosed without replacing source reserves",()=>{
 const r=replayCurveEvents(initialCurve(),[recordedBuy({real_token_reserves_base_units:"499101"})]);
 assert.equal(r.recorded_reserve_audit.status,"REVIEW_REQUIRED");
 assert.equal(r.state.real_token_reserves_base_units,"499101");
 assert.ok(r.recorded_reserve_audit.checks[0].issues.some(x=>x.field==="real_token_reserves_base_units"));
});
test("null required post reserve is rejected",()=>{
 assert.throws(()=>replayCurveEvents(initialCurve(),[recordedBuy({real_token_reserves_base_units:null})]),/missing real_token_reserves/);
});
test("null snapshot reserve remains UNKNOWN instead of copying replayed value",()=>{
 const initial=initialCurve();
 const snapshot=curveEvent({id:"null-snapshot",sequence:0,kind:"CURVE_STATE_SNAPSHOT",payload:{state:{...initial,real_token_reserves_base_units:null}}});
 const r=replayCurveEvents(initial,[snapshot]);assert.equal(r.reconciliations[0].status,"UNKNOWN");assert.deepEqual(r.reconciliations[0].missing_fields,["real_token_reserves_base_units"]);
});
test("explicitly different curve accounts cannot be replayed together",()=>{
 const initial=initialCurve();initial.market.curve_account="curve-a";
 const e=recordedBuy();e.market={...e.market,curve_account:"curve-b"};
 assert.throws(()=>replayCurveEvents(initial,[e]),/different market/);
});
test("recorded completion flag inconsistent with token reserve is diagnosed",()=>{
 const r=replayCurveEvents(initialCurve(),[recordedBuy({complete:true})]);assert.equal(r.recorded_reserve_audit.status,"REVIEW_REQUIRED");assert.ok(r.recorded_reserve_audit.checks[0].issues.some(x=>x.code==="COMPLETION_FLAG_MISMATCH"));
});
