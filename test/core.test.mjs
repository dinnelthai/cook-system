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
