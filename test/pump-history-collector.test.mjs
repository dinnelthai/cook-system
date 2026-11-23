import test from "node:test";
import assert from "node:assert/strict";
import snapshot from "../src/adapters/pump/pump-idl.snapshot.json" with { type: "json" };
import { decodeBase58, encodeBase58 } from "../src/adapters/pump/borsh.mjs";
import { PUMP_PROGRAM_ID } from "../src/adapters/pump/pump-decoder.mjs";
import { SPL_TOKEN_PROGRAM_ID } from "../src/adapters/pump/pump-account-codec.mjs";
import { derivePumpBondingCurveAddress, fetchPumpMintHistory } from "../src/adapters/pump/pump-history-collector.mjs";

const ZERO_KEY = "11111111111111111111111111111111";
const MINT = "So11111111111111111111111111111111111111112";
const USER = "Vote111111111111111111111111111111111111111";
const SIGNATURE = "history-fixture-signature";

function u8(v){const b=Buffer.alloc(1);b.writeUInt8(v);return b;}
function u32(v){const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;}
function u64(v){const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(v));return b;}
function i64(v){const b=Buffer.alloc(8);b.writeBigInt64LE(BigInt(v));return b;}
function pubkey(v=ZERO_KEY){const b=decodeBase58(v);assert.equal(b.length,32);return b;}
function str(v){const b=Buffer.from(v);return Buffer.concat([u32(b.length),b]);}
function disc(items,name){return Buffer.from(items.find(x=>x.name===name).discriminator);}

function createEvent() {
  return Buffer.concat([
    disc(snapshot.pump.events,"CreateEvent"),
    str("History Fixture"),str("HIST"),str("https://example.invalid/meta"),
    pubkey(MINT),pubkey(derivePumpBondingCurveAddress(MINT)),pubkey(USER),pubkey(USER),
    i64(1_700_000_000),
    u64(1_000_000),u64(2_000_000),u64(500_000),u64(1_500_000),
    pubkey(SPL_TOKEN_PROGRAM_ID),u8(0),u8(0),pubkey(ZERO_KEY),
    u64(2_000_000),u64(0),u8(0),u8(0),
  ]);
}

function tradeEvent() {
  return Buffer.concat([
    disc(snapshot.pump.events,"TradeEvent"),
    pubkey(MINT),u64(500),u64(900),u8(1),pubkey(USER),i64(1_700_000_001),
    u64(2_000_000),u64(1_000_000),u64(100_000),u64(500_000),
    pubkey(ZERO_KEY),u64(100),u64(5),pubkey(USER),u64(50),u64(3),
    u8(0),u64(0),u64(0),u64(0),i64(1_700_000_000),
    str("buy_v3"),u8(0),u64(0),u64(0),u64(0),u64(0),u32(0),
    pubkey(ZERO_KEY),u64(500),u64(2_000_000),u64(100_000),u64(0),u64(0),u64(0),
  ]);
}

function mintAccountInfo() {
  const bytes=Buffer.alloc(82);
  bytes.writeBigUInt64LE(1_500_000n,36);
  bytes.writeUInt8(6,44);
  bytes.writeUInt8(1,45);
  return {context:{slot:101},value:{owner:SPL_TOKEN_PROGRAM_ID,data:[bytes.toString("base64"),"base64"]}};
}

function bondingCurveAccountInfo() {
  const account=snapshot.pump.accounts.find(x=>x.name==="BondingCurve");
  const bytes=Buffer.concat([
    Buffer.from(account.discriminator),
    u64(1_000_000),u64(2_000_000),u64(500_000),u64(100_000),u64(1_500_000),
    u8(0),pubkey(USER),u8(0),u8(0),pubkey(ZERO_KEY),u64(0),u8(0),u8(0),
    u64(50),u64(100),u8(0),u64(2_000_000),u64(0),u64(0),
  ]);
  return {context:{slot:101},value:{owner:PUMP_PROGRAM_ID,data:[bytes.toString("base64"),"base64"]}};
}

function transactionFixture() {
  const keys=[USER,derivePumpBondingCurveAddress(MINT),MINT,PUMP_PROGRAM_ID];
  return {
    slot:100,
    blockTime:1_700_000_010,
    transaction:{signatures:[SIGNATURE],message:{accountKeys:keys,instructions:[]}},
    meta:{
      err:null,
      fee:5000,
      logMessages:[
        `Program ${PUMP_PROGRAM_ID} invoke [1]`,
        `Program data: ${createEvent().toString("base64")}`,
        `Program data: ${tradeEvent().toString("base64")}`,
        `Program ${PUMP_PROGRAM_ID} success`,
      ],
      preBalances:[10_000_000_000,0,0,0],
      postBalances:[9_999_994_500,0,0,0],
      preTokenBalances:[],
      postTokenBalances:[{
        accountIndex:2,mint:MINT,owner:USER,
        uiTokenAmount:{amount:"900",decimals:6,uiAmount:0.0009},
      }],
      innerInstructions:[],
      loadedAddresses:{writable:[],readonly:[]},
    },
  };
}

test("mint history collector replays a complete confirmed fixture and reconciles current curve account", async () => {
  const curveAddress=derivePumpBondingCurveAddress(MINT);
  const tx=transactionFixture();
  const rpc={
    async getAccountInfo(address) {
      if (address===MINT) return mintAccountInfo();
      if (address===curveAddress) return bondingCurveAccountInfo();
      throw new Error(`unexpected account request ${address}`);
    },
    async getSignaturesForAddress(address) {
      assert.equal(address,curveAddress);
      return [{signature:SIGNATURE,slot:100,err:null}];
    },
    async getTransaction(signature) {
      assert.equal(signature,SIGNATURE);
      return tx;
    },
    async getBlock(slot) {
      assert.equal(slot,100);
      return {transactions:[{transaction:{signatures:[SIGNATURE]}}]};
    },
  };
  const result=await fetchPumpMintHistory({rpc,mint:MINT,network:"mainnet",maxSignatures:10});
  assert.equal(result.status,"REPLAYED_FULL_HISTORY");
  assert.equal(result.bonding_curve_address,curveAddress);
  assert.equal(result.signature_coverage.fetched_transactions,1);
  assert.equal(result.events.length,2);
  assert.equal(result.replay.state.curve_buy_quote_volume_base_units,"500");
  assert.equal(result.replay.state.protocol_fees_base_units,"100");
  assert.equal(result.replay.state.creator_fees_base_units,"50");
  assert.equal(result.current_account_reconciliation.status,"PASS");
  assert.equal(result.raw_candles_status,"AVAILABLE");
  assert.equal(result.raw_candles_1m.length,1);
  assert.equal(result.raw_candles_1m[0].quote_volume_base_units,"500");
});
