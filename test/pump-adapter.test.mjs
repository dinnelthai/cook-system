import test from "node:test";
import assert from "node:assert/strict";
import snapshot from "../src/adapters/pump/pump-idl.snapshot.json" with { type: "json" };
import {
  PUMP_PROGRAM_ID,
  PUMP_FEES_PROGRAM_ID,
  decodePumpInstruction,
  decodeProgramEvent,
  decodeProgramAccount,
  decodeProgramDataLogs,
} from "../src/adapters/pump/pump-decoder.mjs";
import {
  decodeBase58,
  encodeBase58,
} from "../src/adapters/pump/borsh.mjs";
import {
  calculateBondingCurveMarketCap,
  calculateFeeTier,
  resolveBondingCurveFees,
  buildFeeConfigTimeline,
  resolveFeeConfigAt,
  quoteExactSolIn,
} from "../src/adapters/pump/fee-resolver.mjs";

const ZERO_KEY = "11111111111111111111111111111111";

function u8(value) {
  const out = Buffer.alloc(1);
  out.writeUInt8(value);
  return out;
}

function u16(value) {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(value);
  return out;
}

function u32(value) {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value);
  return out;
}

function u64(value) {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value));
  return out;
}

function u128(value) {
  const out = Buffer.alloc(16);
  const big = BigInt(value);
  out.writeBigUInt64LE(big & ((1n << 64n) - 1n), 0);
  out.writeBigUInt64LE(big >> 64n, 8);
  return out;
}

function i64(value) {
  const out = Buffer.alloc(8);
  out.writeBigInt64LE(BigInt(value));
  return out;
}

function pubkey(value = ZERO_KEY) {
  const bytes = decodeBase58(value);
  assert.equal(bytes.length, 32);
  return bytes;
}

function discriminator(items, name) {
  const item = items.find((entry) => entry.name === name);
  assert.ok(item, `missing IDL item ${name}`);
  return Buffer.from(item.discriminator);
}

function buildCompleteEvent() {
  return Buffer.concat([
    discriminator(snapshot.pump.events, "CompleteEvent"),
    pubkey(),
    pubkey(),
    pubkey(),
    i64(1_700_000_000),
    pubkey(),
  ]);
}


function buildTradeEvent() {
  const text = Buffer.from("buy_v3", "utf8");
  return Buffer.concat([
    discriminator(snapshot.pump.events, "TradeEvent"),
    pubkey(),
    u64(500),
    u64(900),
    u8(1),
    pubkey(),
    i64(1_700_000_001),
    u64(2_000_000),
    u64(1_000_000),
    u64(100_000),
    u64(500_000),
    pubkey(),
    u64(100),
    u64(5),
    pubkey(),
    u64(50),
    u64(3),
    u8(0),
    u64(0),
    u64(0),
    u64(0),
    i64(1_700_000_000),
    u32(text.length),
    text,
    u8(0),
    u64(0),
    u64(0),
    u64(0),
    u64(0),
    u32(1),
    pubkey(),
    u16(2500),
    pubkey(),
    u64(500),
    u64(2_000_000),
    u64(100_000),
    u64(0),
    u64(0),
    u64(0),
  ]);
}

function buildPartialFeeConfigAccount() {
  const fees = (lp, protocol, creator) => Buffer.concat([u64(lp), u64(protocol), u64(creator)]);
  const tier = Buffer.concat([u128(0), fees(0, 100, 50)]);
  return Buffer.concat([
    discriminator(snapshot.fees.accounts, "FeeConfig"),
    u8(255),
    pubkey(),
    fees(0, 125, 0),
    u32(1),
    tier,
  ]);
}

function buildFeeConfigAccount() {
  const fees = (lp, protocol, creator) => Buffer.concat([u64(lp), u64(protocol), u64(creator)]);
  const tier = Buffer.concat([u128(0), fees(0, 100, 50)]);
  return Buffer.concat([
    discriminator(snapshot.fees.accounts, "FeeConfig"),
    u8(255),
    pubkey(),
    fees(0, 125, 0),
    u32(1),
    tier,
    u32(0),
    fees(0, 125, 0),
  ]);
}

test("base58 codec round-trips Solana program IDs and leading zero bytes", () => {
  assert.equal(encodeBase58(decodeBase58(PUMP_PROGRAM_ID)), PUMP_PROGRAM_ID);
  assert.equal(encodeBase58(Buffer.alloc(32)), ZERO_KEY);
  assert.equal(decodeBase58(PUMP_PROGRAM_ID).length, 32);
});

test("IDL decoder reads buy_v3 arguments and recognizes omitted optional tail", () => {
  const buyV3 = snapshot.pump.instructions.find((item) => item.name === "buy_v3");
  const fullData = Buffer.concat([
    Buffer.from(buyV3.discriminator),
    u64(123456),
    u64(987654),
    u8(1),
  ]);
  const full = decodePumpInstruction({ data: encodeBase58(fullData) });
  assert.equal(full.status, "DECODED");
  assert.equal(full.instruction_name, "buy_v3");
  assert.equal(full.args.amount, 123456n);
  assert.equal(full.args.max_sol_cost, 987654n);
  assert.deepEqual(full.args.partial_fill, [true]);

  const shortData = Buffer.concat([
    Buffer.from(buyV3.discriminator),
    u64(123456),
    u64(987654),
  ]);
  const short = decodePumpInstruction({ data: encodeBase58(shortData) });
  assert.equal(short.status, "DECODED_WITH_OMITTED_OPTIONAL_ARGS");
  assert.deepEqual(short.missing_arguments, ["partial_fill"]);
  assert.equal(short.args.partial_fill, null);
});

test("instruction decoder fails closed for unknown discriminators and wrong programs", () => {
  const unknown = encodeBase58(Buffer.alloc(8, 255));
  assert.equal(decodePumpInstruction({ data: unknown }).status, "UNKNOWN_INSTRUCTION_DISCRIMINATOR");
  assert.equal(
    decodePumpInstruction({ programId: PUMP_FEES_PROGRAM_ID, data: unknown }).status,
    "UNSUPPORTED_PROGRAM",
  );
});

test("event decoder reconstructs CompleteEvent fields from Anchor event bytes", () => {
  const bytes = buildCompleteEvent();
  const decoded = decodeProgramEvent({
    programId: PUMP_PROGRAM_ID,
    data: bytes.toString("base64"),
  });
  assert.equal(decoded.status, "DECODED");
  assert.equal(decoded.event_name, "CompleteEvent");
  assert.equal(decoded.data.timestamp, 1_700_000_000n);
  assert.equal(decoded.data.user, ZERO_KEY);
  assert.equal(decoded.data.quote_mint, ZERO_KEY);
});

test("TradeEvent decoder handles quote-neutral appended fields and shareholder vectors", () => {
  const decoded = decodeProgramEvent({
    programId: PUMP_PROGRAM_ID,
    data: buildTradeEvent().toString("base64"),
  });
  assert.equal(decoded.status, "DECODED");
  assert.equal(decoded.event_name, "TradeEvent");
  assert.equal(decoded.data.sol_amount, 500n);
  assert.equal(decoded.data.token_amount, 900n);
  assert.equal(decoded.data.is_buy, true);
  assert.equal(decoded.data.ix_name, "buy_v3");
  assert.equal(decoded.data.quote_amount, 500n);
  assert.equal(decoded.data.virtual_quote_reserves, 2_000_000n);
  assert.equal(decoded.data.shareholders.length, 1);
  assert.equal(decoded.data.shareholders[0].share_bps, 2500n);
});

test("TradeEvent normalizer creates a canonical observed event with exact decimal price", () => {
  const decodedEvent = decodeProgramEvent({
    programId: PUMP_PROGRAM_ID,
    data: buildTradeEvent().toString("base64"),
  });
  const normalized = normalizePumpTradeEvent({
    decodedEvent,
    signature: "test-signature",
    ordering: {
      slot: 100,
      transactionIndex: 2,
      instructionIndex: 1,
      innerInstructionIndex: null,
      eventSequence: 0,
    },
    tokenDecimals: 6,
    quoteDecimals: 9,
    network: "mainnet",
  });
  assert.equal(normalized.event_kind, "CURVE_BUY_EXECUTED");
  assert.equal(normalized.provenance, "observed_chain");
  assert.equal(normalized.event_time_ms, 1_700_000_001_000);
  assert.equal(normalized.payload.quote_amount_source, "quote_amount");
  assert.equal(normalized.payload.execution_price_decimal, "0.000555555555555555555555");
  assert.equal(normalized.payload.fee_components.length, 2);
  assert.equal(normalized.payload.fee_components[0].fee_type, "protocol");
  assert.equal(normalized.payload.post_curve_state.real_token_reserves_base_units, "500000");
  assert.equal(normalized.quality.validation_status, "warning");
  assert.equal(normalized.quality.is_complete, false);
  assert.ok(normalized.quality.warnings.some((warning) => warning.includes("not yet been reconciled")));

  const legacyQuote = normalizePumpTradeEvent({
    decodedEvent: { ...decodedEvent, data: { ...decodedEvent.data, quote_amount: 0n } },
    signature: "legacy-signature",
    ordering: {
      slot: 100,
      transactionIndex: 2,
      instructionIndex: 1,
      innerInstructionIndex: null,
      eventSequence: 1,
    },
    tokenDecimals: 6,
  });
  assert.equal(legacyQuote.payload.quote_amount_source, "legacy_sol_amount");
  assert.equal(legacyQuote.payload.quote_amount_base_units, "500");

  const reconciled = normalizePumpTradeEvent({
    decodedEvent,
    signature: "reconciled-signature",
    ordering: {
      slot: 100,
      transactionIndex: 2,
      instructionIndex: 1,
      innerInstructionIndex: null,
      eventSequence: 2,
    },
    tokenDecimals: 6,
    accountStateReconciled: true,
    reconciliationRef: "reconciliation-123",
  });
  assert.equal(reconciled.quality.validation_status, "valid");
  assert.equal(reconciled.quality.is_complete, true);
  assert.equal(reconciled.quality.reconciliation_ref, "reconciliation-123");

  assert.throws(
    () => normalizePumpTradeEvent({
      decodedEvent: { ...decodedEvent, data: { ...decodedEvent.data, quote_mint: "NotSolMint" } },
      signature: "unsupported-signature",
      ordering: { slot: 1, transactionIndex: 0, instructionIndex: 0, eventSequence: 0 },
      tokenDecimals: 6,
    }),
    (error) => error.code === "UNSUPPORTED_QUOTE_MINT",
  );
});

test("program log parser only decodes Program data emitted by the requested program", () => {
  const eventData = buildCompleteEvent().toString("base64");
  const logs = [
    `Program ${PUMP_PROGRAM_ID} invoke [1]`,
    "Program 11111111111111111111111111111111 invoke [2]",
    `Program data: ${eventData}`,
    "Program 11111111111111111111111111111111 success",
    `Program data: ${eventData}`,
    `Program ${PUMP_PROGRAM_ID} success`,
  ];
  const decoded = decodeProgramDataLogs(logs, PUMP_PROGRAM_ID);
  assert.equal(decoded.length, 1);
  assert.equal(decoded[0].event_name, "CompleteEvent");
  assert.equal(decoded[0].event_sequence, 0);
});

test("account decoder accepts a known historical BondingCurve prefix and labels missing fields", () => {
  const oldAccount = Buffer.concat([
    discriminator(snapshot.pump.accounts, "BondingCurve"),
    u64(1_000_000),
    u64(2_000_000),
    u64(500_000),
    u64(100_000),
    u64(1_500_000),
    u8(0),
  ]);
  const decoded = decodeProgramAccount({
    programId: PUMP_PROGRAM_ID,
    data: oldAccount.toString("base64"),
  });
  assert.equal(decoded.status, "PARTIAL_ACCOUNT_LAYOUT");
  assert.equal(decoded.account_name, "BondingCurve");
  assert.equal(decoded.data.virtual_token_reserves, 1_000_000n);
  assert.equal(decoded.data.virtual_quote_reserves, 2_000_000n);
  assert.equal(decoded.data.complete, false);
  assert.ok(decoded.missing_fields.includes("creator"));
  assert.equal(decoded.data.protocol_fees, 0n);
});

test("FeeConfig account decoder reads nested fee tiers using the pinned IDL", () => {
  const decoded = decodeProgramAccount({
    programId: PUMP_FEES_PROGRAM_ID,
    data: buildFeeConfigAccount().toString("base64"),
  });
  assert.equal(decoded.status, "DECODED");
  assert.equal(decoded.account_name, "FeeConfig");
  assert.equal(decoded.data.fee_tiers.length, 1);
  assert.equal(decoded.data.fee_tiers[0].market_cap_lamports_threshold, 0n);
  assert.equal(decoded.data.fee_tiers[0].fees.protocol_fee_bps, 100n);
  assert.equal(decoded.data.fee_tiers[0].fees.creator_fee_bps, 50n);
});

test("FeeConfig decoder marks known appended fields as partial when reading an older layout", () => {
  const decoded = decodeProgramAccount({
    programId: PUMP_FEES_PROGRAM_ID,
    data: buildPartialFeeConfigAccount().toString("base64"),
  });
  assert.equal(decoded.status, "PARTIAL_ACCOUNT_LAYOUT");
  assert.equal(decoded.data.fee_tiers.length, 1);
  assert.ok(decoded.missing_fields.includes("stable_fee_tiers"));
  assert.deepEqual(decoded.data.stable_fee_tiers, []);
});

test("market-cap calculation and dynamic fee tier selection use exact integer thresholds", () => {
  const marketCap = calculateBondingCurveMarketCap({
    tokenTotalSupply: "1000000",
    virtualQuoteReserves: "5000",
    virtualTokenReserves: "1000000",
  });
  assert.equal(marketCap, 5000n);

  const feeTiers = [
    { market_cap_lamports_threshold: 0n, fees: { lp_fee_bps: 0n, protocol_fee_bps: 100n, creator_fee_bps: 50n } },
    { market_cap_lamports_threshold: 1000n, fees: { lp_fee_bps: 0n, protocol_fee_bps: 90n, creator_fee_bps: 40n } },
    { market_cap_lamports_threshold: 5000n, fees: { lp_fee_bps: 0n, protocol_fee_bps: 80n, creator_fee_bps: 30n } },
  ];
  assert.equal(calculateFeeTier({ feeTiers, marketCapLamports: 4999n }).protocol_fee_bps, 90n);
  assert.equal(calculateFeeTier({ feeTiers, marketCapLamports: 5000n }).protocol_fee_bps, 80n);
  assert.equal(calculateFeeTier({ feeTiers, marketCapLamports: 0n }).creator_fee_bps, 50n);
});

test("dynamic fee resolver prefers FeeConfig and uses Global only as documented fallback", () => {
  const bondingCurve = {
    quote_mint: ZERO_KEY,
    token_total_supply: 1_000_000n,
    virtual_quote_reserves: 5_000n,
    virtual_token_reserves: 1_000_000n,
  };
  const feeConfig = {
    fee_tiers: [
      { market_cap_lamports_threshold: 0n, fees: { lp_fee_bps: 0n, protocol_fee_bps: 100n, creator_fee_bps: 50n } },
      { market_cap_lamports_threshold: 5000n, fees: { lp_fee_bps: 0n, protocol_fee_bps: 80n, creator_fee_bps: 30n } },
    ],
  };
  const resolved = resolveBondingCurveFees({ bondingCurve, feeConfig });
  assert.equal(resolved.source, "pump_fee_config");
  assert.equal(resolved.market_cap_lamports, "5000");
  assert.equal(resolved.protocol_fee_bps, "80");
  assert.equal(resolved.creator_fee_bps, "30");
  assert.equal(resolved.total_trade_fee_bps, "110");

  const fallback = resolveBondingCurveFees({
    bondingCurve,
    feeConfig: null,
    global: { fee_basis_points: 100n, creator_fee_basis_points: 25n },
  });
  assert.equal(fallback.status, "RESOLVED_WITH_FALLBACK");
  assert.equal(fallback.total_trade_fee_bps, "125");

  assert.throws(
    () => resolveBondingCurveFees({ bondingCurve, feeConfig, feeConfigStatus: "stale" }),
    (error) => error.code === "FEE_CONFIG_NOT_VERIFIED",
  );
  assert.throws(
    () => resolveBondingCurveFees({ bondingCurve: { ...bondingCurve, quote_mint: "NotSolMint" }, feeConfig }),
    (error) => error.code === "UNSUPPORTED_QUOTE_MINT",
  );
});

test("fee config timeline invalidates a snapshot after an update event", () => {
  const timeline = buildFeeConfigTimeline([
    {
      kind: "snapshot",
      event_id: "fee-snapshot-1",
      ordering: { slot: 10, transaction_index: 0, instruction_index: 0, inner_instruction_index: null, event_sequence: 0 },
      fee_config: { fee_tiers: [] },
    },
    {
      kind: "change",
      event_id: "fee-change-1",
      ordering: { slot: 20, transaction_index: 0, instruction_index: 1, inner_instruction_index: null, event_sequence: 0 },
      event_name: "UpsertFeeTiersEvent",
    },
    {
      kind: "snapshot",
      event_id: "fee-snapshot-2",
      ordering: { slot: 21, transaction_index: 0, instruction_index: 0, inner_instruction_index: null, event_sequence: 0 },
      fee_config: { fee_tiers: [{ market_cap_lamports_threshold: 0n }] },
    },
  ], { coverageComplete: true });

  assert.equal(resolveFeeConfigAt(timeline, {
    slot: 15, transaction_index: 0, instruction_index: 0, inner_instruction_index: null, event_sequence: 0,
  }).status, "available");
  assert.equal(resolveFeeConfigAt(timeline, {
    slot: 20, transaction_index: 0, instruction_index: 2, inner_instruction_index: null, event_sequence: 0,
  }).status, "stale");
  assert.equal(resolveFeeConfigAt(timeline, {
    slot: 22, transaction_index: 0, instruction_index: 0, inner_instruction_index: null, event_sequence: 0,
  }).status, "available");
  const incompleteCoverage = buildFeeConfigTimeline([{
    kind: "snapshot",
    event_id: "fee-snapshot-only",
    ordering: { slot: 10, transaction_index: 0, instruction_index: 0, inner_instruction_index: null, event_sequence: 0 },
    fee_config: { fee_tiers: [] },
  }], { coverageComplete: false });
  assert.equal(resolveFeeConfigAt(incompleteCoverage, {
    slot: 15, transaction_index: 0, instruction_index: 0, inner_instruction_index: null, event_sequence: 0,
  }).status, "unverified");
});

test("exact SOL-in quote follows Pump integer rounding and fee formula", () => {
  const quote = quoteExactSolIn({
    spendableSolIn: "1000000000",
    virtualTokenReserves: "1073000000000000",
    virtualSolReserves: "30000000000",
    protocolFeeBps: "100",
    creatorFeeBps: "50",
  });
  assert.equal(quote.net_quote_in_base_units, "985221674");
  assert.equal(quote.protocol_fee_base_units, "9852217");
  assert.equal(quote.creator_fee_base_units, "4926109");
  assert.equal(quote.total_fee_base_units, "14778326");
  assert.equal(quote.token_out_base_units, "34117646995895");
});
