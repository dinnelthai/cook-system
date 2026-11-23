import test from "node:test";
import assert from "node:assert/strict";
import snapshot from "../src/adapters/pump/pump-idl.snapshot.json" with { type: "json" };
import { decodeBase58 } from "../src/adapters/pump/borsh.mjs";
import {
  PUMP_FEES_PROGRAM_ID,
  PUMP_FEE_CONFIG_PDA,
  decodeProgramAccount,
} from "../src/adapters/pump/pump-decoder.mjs";
import { fetchPumpFeeConfigHistory } from "../src/adapters/pump/pump-fee-history.mjs";
import { feeConfigSnapshotRecordFromDecodedAccount } from "../src/adapters/pump/fee-resolver.mjs";

const ZERO_KEY = "11111111111111111111111111111111";
function u8(value) { const b=Buffer.alloc(1); b.writeUInt8(value); return b; }
function u32(value) { const b=Buffer.alloc(4); b.writeUInt32LE(value); return b; }
function u64(value) { const b=Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value)); return b; }
function u128(value) { const b=Buffer.alloc(16); const n=BigInt(value); b.writeBigUInt64LE(n & ((1n<<64n)-1n),0); b.writeBigUInt64LE(n>>64n,8); return b; }
function pubkey(value=ZERO_KEY) { const b=decodeBase58(value); assert.equal(b.length,32); return b; }
function feeConfigBytes() {
  const fees = Buffer.concat([u64(0),u64(100),u64(50)]);
  const tier = Buffer.concat([u128(0),fees]);
  return Buffer.concat([
    Buffer.from(snapshot.fees.accounts.find(x=>x.name==="FeeConfig").discriminator),
    u8(255),
    pubkey(),
    Buffer.concat([u64(0),u64(125),u64(0)]),
    u32(1),
    tier,
    u32(0),
    Buffer.concat([u64(0),u64(125),u64(0)]),
  ]);
}

function makeRpc() {
  let transactionCalls = 0;
  return {
    transactionCalls: () => transactionCalls,
    async getAccountInfo(address) {
      assert.equal(address, PUMP_FEE_CONFIG_PDA);
      return {
        context: { slot: 100 },
        value: {
          owner: PUMP_FEES_PROGRAM_ID,
          data: [feeConfigBytes().toString("base64"), "base64"],
        },
      };
    },
    async getSignaturesForAddress(address) {
      assert.equal(address, PUMP_FEE_CONFIG_PDA);
      return [];
    },
    async getTransaction() {
      transactionCalls += 1;
      return null;
    },
  };
}

test("fee history refuses to backdate a current-only snapshot", async () => {
  const rpc = makeRpc();
  const result = await fetchPumpFeeConfigHistory({ rpc });
  assert.equal(result.status, "CURRENT_SNAPSHOT_WITH_HISTORICAL_GAPS");
  assert.equal(result.current_snapshot_slot, 100);
  assert.equal(result.decoded_update_events, 0);
  assert.equal(result.timeline.coverage_complete, false);
  assert.equal(result.timeline.entries.length, 1);
  assert.equal(rpc.transactionCalls(), 0);
});

test("fee history can be complete when an explicit baseline snapshot is supplied", async () => {
  const decoded = decodeProgramAccount({
    programId: PUMP_FEES_PROGRAM_ID,
    data: feeConfigBytes(),
    encoding: "base64",
  });
  const baseline = feeConfigSnapshotRecordFromDecodedAccount({
    decodedAccount: decoded,
    eventId: "baseline-snapshot",
    ordering: {
      slot: 1,
      transaction_index: 0,
      instruction_index: 0,
      inner_instruction_index: null,
      event_sequence: 0,
    },
  });
  const result = await fetchPumpFeeConfigHistory({
    rpc: makeRpc(),
    initialSnapshotRecord: baseline,
  });
  assert.equal(result.status, "HISTORICAL_FEE_CONFIG_COVERAGE_COMPLETE");
  assert.equal(result.timeline.coverage_complete, true);
  assert.equal(result.timeline.entries.length, 2);
});
