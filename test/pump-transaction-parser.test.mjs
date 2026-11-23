import test from "node:test";
import assert from "node:assert/strict";
import {
  PUMP_PROGRAM_ID,
  PUMP_AMM_PROGRAM_ID,
  decodeProgramEvent,
} from "../src/adapters/pump/pump-decoder.mjs";
import { encodeBase58, decodeBase58 } from "../src/adapters/pump/borsh.mjs";
import { decodePumpTransaction } from "../src/adapters/pump/pump-transaction-parser.mjs";
import {
  reconcilePumpTradesWithTransaction,
  extractTransactionBalanceDeltas,
} from "../src/adapters/pump/transaction-reconciler.mjs";
import { createInitialCurveStateFromMarketCreated, replayCurveEvents } from "../src/core/market-state.mjs";

const ZERO_KEY = "11111111111111111111111111111111";
const MINT = "So11111111111111111111111111111111111111112";
const USER = "Vote111111111111111111111111111111111111111";
const CURVE = "SysvarRent111111111111111111111111111111111";
const POOL = "SysvarC1ock11111111111111111111111111111111";

function u8(value) { const b = Buffer.alloc(1); b.writeUInt8(value); return b; }
function u16(value) { const b = Buffer.alloc(2); b.writeUInt16LE(value); return b; }
function u32(value) { const b = Buffer.alloc(4); b.writeUInt32LE(value); return b; }
function u64(value) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value)); return b; }
function i64(value) { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(value)); return b; }
function pubkey(value = ZERO_KEY) { const b = decodeBase58(value); assert.equal(b.length, 32); return b; }
function str(value) { const b = Buffer.from(value); return Buffer.concat([u32(b.length), b]); }
function discriminator(items, name) {
  const found = items.find((item) => item.name === name);
  assert.ok(found, `missing discriminator ${name}`);
  return Buffer.from(found.discriminator);
}

const snapshot = (await import("../src/adapters/pump/pump-idl.snapshot.json", { with: { type: "json" } })).default;

function buildCreateEvent() {
  return Buffer.concat([
    discriminator(snapshot.pump.events, "CreateEvent"),
    str("Fixture Coin"),
    str("FIX"),
    str("https://example.invalid/metadata.json"),
    pubkey(MINT),
    pubkey(CURVE),
    pubkey(USER),
    pubkey(USER),
    i64(1_700_000_000),
    u64(1_000_000),
    u64(2_000_000),
    u64(500_000),
    u64(1_500_000),
    pubkey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    u8(0),
    u8(0),
    pubkey(ZERO_KEY),
    u64(2_000_000),
    u64(0),
    u8(0),
    u8(0),
  ]);
}

function buildTradeEvent({ realTokenReserves = 500_000 } = {}) {
  const ixName = Buffer.from("buy_v3");
  return Buffer.concat([
    discriminator(snapshot.pump.events, "TradeEvent"),
    pubkey(MINT),
    u64(500),
    u64(900),
    u8(1),
    pubkey(USER),
    i64(1_700_000_001),
    u64(2_000_000),
    u64(1_000_000),
    u64(100_000),
    u64(realTokenReserves),
    pubkey(ZERO_KEY),
    u64(100),
    u64(5),
    pubkey(USER),
    u64(50),
    u64(3),
    u8(0),
    u64(0),
    u64(0),
    u64(0),
    i64(1_700_000_000),
    str("buy_v3"),
    u8(0),
    u64(0),
    u64(0),
    u64(0),
    u64(0),
    u32(0),
    pubkey(ZERO_KEY),
    u64(500),
    u64(2_000_000),
    u64(100_000),
    u64(0),
    u64(0),
    u64(0),
  ]);
}

function buildCompleteEvent() {
  return Buffer.concat([
    discriminator(snapshot.pump.events, "CompleteEvent"),
    pubkey(USER),
    pubkey(MINT),
    pubkey(CURVE),
    i64(1_700_000_002),
    pubkey(ZERO_KEY),
  ]);
}

function buildPostCompleteBuyEvent() {
  return Buffer.concat([
    discriminator(snapshot.pump.events, "PostCompleteBuyEvent"),
    pubkey(USER),
    pubkey(MINT),
    pubkey(CURVE),
    pubkey(ZERO_KEY),
    i64(1_700_000_002),
    u64(20),
    u64(17),
    u64(100),
    u64(1),
    u64(50),
    u64(1),
    u64(1),
    u64(400),
    u64(305),
    u64(380),
    u64(322),
  ]);
}


function buildSweepFeeEvent(bucket, amount) {
  return Buffer.concat([
    discriminator(snapshot.pump.events, "SweepBondingCurveFeeEvent"),
    i64(1_700_000_004),
    pubkey(MINT),
    pubkey(CURVE),
    pubkey(ZERO_KEY),
    pubkey(USER),
    u64(amount),
    u8(bucket),
  ]);
}

function buildMigrationEvent() {
  return Buffer.concat([
    discriminator(snapshot.pump.events, "CompletePumpAmmMigrationEvent"),
    pubkey(USER),
    pubkey(MINT),
    u64(400),
    u64(300),
    u64(10),
    pubkey(CURVE),
    i64(1_700_000_003),
    pubkey(POOL),
    pubkey(ZERO_KEY),
  ]);
}

function buildCreatePoolEvent() {
  return Buffer.concat([
    discriminator(snapshot.pump_amm.events, "CreatePoolEvent"),
    i64(1_700_000_003),
    u16(0),
    pubkey(USER),
    pubkey(MINT),
    pubkey(ZERO_KEY),
    u8(6),
    u8(9),
    u64(400),
    u64(300),
    u64(400),
    u64(290),
    u64(100),
    u64(300),
    u64(250),
    u8(1),
    pubkey(POOL),
    pubkey(USER),
    pubkey(USER),
    pubkey(USER),
    pubkey(USER),
    u8(0),
    u64(50),
    u8(0),
    u8(0),
  ]);
}

function makeTransaction({ logs, instructions = [], preBalances = [], postBalances = [], preTokenBalances = [], postTokenBalances = [], err = null }) {
  return {
    slot: 100,
    blockTime: 1_700_000_010,
    transaction: {
      signatures: ["fixture-signature"],
      message: {
        accountKeys: [USER, CURVE, MINT, PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID],
        instructions,
      },
    },
    meta: {
      err,
      fee: 5000,
      logMessages: logs,
      preBalances,
      postBalances,
      preTokenBalances,
      postTokenBalances,
      innerInstructions: [],
      loadedAddresses: { writable: [], readonly: [] },
    },
  };
}

test("transaction parser maps Pump TradeEvent to a canonical observed-chain event", () => {
  const buyV3 = snapshot.pump.instructions.find((item) => item.name === "buy_v3");
  const instructionData = Buffer.concat([Buffer.from(buyV3.discriminator), u64(900), u64(1000)]);
  const eventData = buildTradeEvent().toString("base64");
  const transaction = makeTransaction({
    logs: [
      `Program ${PUMP_PROGRAM_ID} invoke [1]`,
      `Program data: ${eventData}`,
      `Program ${PUMP_PROGRAM_ID} success`,
    ],
    instructions: [{
      programIdIndex: 3,
      accounts: [0, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3],
      data: encodeBase58(instructionData),
    }],
    preBalances: [10_000_000_000, 0, 0, 0, 0],
    postBalances: [9_999_994_500, 0, 0, 0, 0],
    postTokenBalances: [{
      accountIndex: 2,
      mint: MINT,
      owner: USER,
      uiTokenAmount: { amount: "900", decimals: 6, uiAmount: 0.0009 },
    }],
  });
  const parsed = decodePumpTransaction({
    transaction,
    signature: "fixture-signature",
    transactionIndex: 4,
    tokenDecimalsByMint: { [MINT]: 6 },
  });
  assert.equal(parsed.status, "DECODED");
  assert.equal(parsed.events.length, 1);
  const [event] = parsed.events;
  assert.equal(event.event_kind, "CURVE_BUY_EXECUTED");
  assert.equal(event.provenance, "observed_chain");
  assert.equal(event.ordering.slot, 100);
  assert.equal(event.ordering.transaction_index, 4);
  assert.equal(event.ordering.instruction_index, 0);
  assert.equal(event.market.curve_account, CURVE);
  assert.equal(event.payload.token_amount_base_units, "900");
  assert.equal(event.payload.quote_amount_base_units, "500");
  const reconciliation = reconcilePumpTradesWithTransaction({ transaction, tradeEvents: [event] });
  assert.equal(reconciliation.status, "PASS");
  assert.equal(reconciliation.checks[0].status, "PASS");
  assert.equal(reconciliation.checks[1].status, "PASS");
});

test("failed Solana transactions never become observed execution events", () => {
  const transaction = makeTransaction({
    logs: [`Program ${PUMP_PROGRAM_ID} invoke [1]`, `Program data: ${buildTradeEvent({ realTokenReserves: 0 }).toString("base64")}`, `Program ${PUMP_PROGRAM_ID} failed: custom program error`],
    err: { InstructionError: [0, "Custom"] },
  });
  const parsed = decodePumpTransaction({
    transaction,
    signature: "failed-signature",
    transactionIndex: 1,
    tokenDecimalsByMint: { [MINT]: 6 },
  });
  assert.equal(parsed.status, "FAILED_TRANSACTION");
  assert.equal(parsed.events.length, 0);
  assert.equal(parsed.decoded_events.length, 1);
});

test("Pump creation, completion, post-completion buy and PumpSwap migration normalize distinctly", () => {
  const create = decodeProgramEvent({ programId: PUMP_PROGRAM_ID, data: buildCreateEvent().toString("base64") });
  const complete = decodeProgramEvent({ programId: PUMP_PROGRAM_ID, data: buildCompleteEvent().toString("base64") });
  const post = decodeProgramEvent({ programId: PUMP_PROGRAM_ID, data: buildPostCompleteBuyEvent().toString("base64") });
  const migration = decodeProgramEvent({ programId: PUMP_PROGRAM_ID, data: buildMigrationEvent().toString("base64") });
  const pool = decodeProgramEvent({ programId: PUMP_AMM_PROGRAM_ID, data: buildCreatePoolEvent().toString("base64") });
  assert.equal(create.status, "DECODED");
  assert.equal(complete.status, "DECODED");
  assert.equal(post.status, "DECODED");
  assert.equal(migration.status, "DECODED");
  assert.equal(pool.status, "DECODED");
  assert.equal(pool.event_name, "CreatePoolEvent");
  assert.equal(migration.event_name, "CompletePumpAmmMigrationEvent");
});

test("program data events preserve the protocol order across Pump and PumpSwap programs", () => {
  const logs = [
    `Program ${PUMP_PROGRAM_ID} invoke [1]`,
    `Program data: ${buildTradeEvent().toString("base64")}`,
    `Program data: ${buildCompleteEvent().toString("base64")}`,
    `Program data: ${buildPostCompleteBuyEvent().toString("base64")}`,
    `Program ${PUMP_PROGRAM_ID} success`,
    `Program ${PUMP_AMM_PROGRAM_ID} invoke [1]`,
    `Program data: ${buildCreatePoolEvent().toString("base64")}`,
    `Program ${PUMP_AMM_PROGRAM_ID} success`,
    `Program ${PUMP_PROGRAM_ID} invoke [1]`,
    `Program data: ${buildMigrationEvent().toString("base64")}`,
    `Program ${PUMP_PROGRAM_ID} success`,
  ];
  const transaction = makeTransaction({ logs });
  const parsed = decodePumpTransaction({
    transaction,
    signature: "migration-signature",
    transactionIndex: 9,
    tokenDecimalsByMint: { [MINT]: 6 },
  });
  assert.deepEqual(parsed.events.map((event) => event.event_kind), [
    "CURVE_BUY_EXECUTED",
    "CURVE_COMPLETE",
    "POST_COMPLETE_POOL_LEG",
    "POOL_CREATED",
    "CURVE_MIGRATED",
  ]);
  assert.deepEqual(parsed.events.map((event) => event.ordering.event_sequence), [0, 1, 2, 3, 4]);
});

test("curve replay initializes from observed CreateEvent and stops at migration", () => {
  const logs = [
    `Program ${PUMP_PROGRAM_ID} invoke [1]`,
    `Program data: ${buildCreateEvent().toString("base64")}`,
    `Program data: ${buildTradeEvent({ realTokenReserves: 0 }).toString("base64")}`,
    `Program data: ${buildCompleteEvent().toString("base64")}`,
    `Program ${PUMP_PROGRAM_ID} success`,
    `Program ${PUMP_PROGRAM_ID} invoke [1]`,
    `Program data: ${buildMigrationEvent().toString("base64")}`,
    `Program ${PUMP_PROGRAM_ID} success`,
  ];
  const transaction = makeTransaction({ logs });
  const parsed = decodePumpTransaction({
    transaction,
    signature: "create-to-migrate",
    transactionIndex: 0,
    tokenDecimalsByMint: { [MINT]: 6 },
  });
  const created = parsed.events.find((event) => event.event_kind === "MARKET_CREATED");
  assert.ok(created);
  const initial = createInitialCurveStateFromMarketCreated({ marketCreatedEvent: created });
  const replay = replayCurveEvents(initial, parsed.events);
  assert.equal(replay.state.lifecycle, "graduated");
  assert.equal(replay.state.complete, true);
  assert.equal(replay.state.curve_buy_quote_volume_base_units, "500");
});

test("V3 retained fees accrue on the curve and sweep events debit the correct bucket", () => {
  const logs = [
    `Program ${PUMP_PROGRAM_ID} invoke [1]`,
    `Program data: ${buildCreateEvent().toString("base64")}`,
    `Program data: ${buildTradeEvent().toString("base64")}`,
    `Program data: ${buildSweepFeeEvent(0, 5).toString("base64")}`,
    `Program data: ${buildSweepFeeEvent(1, 3).toString("base64")}`,
    `Program ${PUMP_PROGRAM_ID} success`,
  ];
  const transaction = makeTransaction({ logs });
  const parsed = decodePumpTransaction({
    transaction,
    signature: "fee-sweep-replay",
    transactionIndex: 0,
    tokenDecimalsByMint: { [MINT]: 6 },
  });
  const created = parsed.events.find((event) => event.event_kind === "MARKET_CREATED");
  const initial = createInitialCurveStateFromMarketCreated({ marketCreatedEvent: created });
  const replay = replayCurveEvents(initial, parsed.events);
  assert.equal(replay.state.protocol_fees_base_units, "0");
  assert.equal(replay.state.creator_fees_base_units, "0");
  assert.equal(replay.state.fee_movement_count, 2);
  const trade = parsed.events.find((event) => event.event_kind === "CURVE_BUY_EXECUTED");
  assert.equal(trade.payload.fee_balances_delta.protocol_fees_base_units, "5");
  assert.equal(trade.payload.fee_balances_delta.creator_fees_base_units, "3");
});

test("transaction balance delta extraction aggregates token accounts by owner and mint", () => {
  const transaction = makeTransaction({
    preBalances: [100, 0, 0, 0, 0],
    postBalances: [90, 0, 0, 0, 0],
    preTokenBalances: [{
      accountIndex: 2,
      mint: MINT,
      owner: USER,
      uiTokenAmount: { amount: "10", decimals: 6 },
    }],
    postTokenBalances: [{
      accountIndex: 2,
      mint: MINT,
      owner: USER,
      uiTokenAmount: { amount: "25", decimals: 6 },
    }],
  });
  const deltas = extractTransactionBalanceDeltas(transaction);
  assert.equal(deltas.lamports[0].delta_lamports, "-10");
  assert.equal(deltas.tokens[0].delta_base_units, "15");
});
