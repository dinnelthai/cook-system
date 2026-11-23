import test from "node:test";
import assert from "node:assert/strict";
import launchpadIdl from "../src/adapters/raydium/idl/raydium_launchpad.json" with { type: "json" };
import cpmmIdl from "../src/adapters/raydium/idl/raydium_cp_swap.json" with { type: "json" };
import {
  ANCHOR_EVENT_IX_TAG,
  RAYDIUM_CPMM_PROGRAM_ID,
  RAYDIUM_LAUNCHLAB_PROGRAM_ID,
  decodeRaydiumAccount,
  decodeRaydiumEvent,
  decodeRaydiumInstruction,
  decodeRaydiumTransaction,
  getRaydiumIdlMetadata,
} from "../src/adapters/raydium/raydium-decoder.mjs";
import { BorshReader, decodeBase58, readIdlDefinition, createTypeMap } from "../src/adapters/pump/borsh.mjs";

const ZERO = "11111111111111111111111111111111";
const MINT = "BzPyyYCTmQNq2BcfQ4ANAvCYk54rnmQEXMFvFT8RhWMi";
const WSOL = "So11111111111111111111111111111111111111112";
const POOL = "CUUso33BfcnWkVuWhZnMdWWJVj2SyVhJb7TMJnNg634e";
const CPMM_POOL = "9pqo6WVjKvYNnRgvPVaoTe1zZvnhtB248ChKnUmKfHH4";

function u8(value) { const b=Buffer.alloc(1); b.writeUInt8(value); return b; }
function u16(value) { const b=Buffer.alloc(2); b.writeUInt16LE(value); return b; }
function u32(value) { const b=Buffer.alloc(4); b.writeUInt32LE(value); return b; }
function u64(value) { const b=Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value)); return b; }
function i64(value) { const b=Buffer.alloc(8); b.writeBigInt64LE(BigInt(value)); return b; }
function pubkey(value) { const b=decodeBase58(value); assert.equal(b.length,32); return b; }
function discriminator(items,name) { return Buffer.from(items.find(x=>x.name===name).discriminator); }
function b64(bytes) { return bytes.toString("base64"); }
function b58(bytes) {
  const alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n=BigInt("0x"+bytes.toString("hex")), out="";
  while(n>0n){const r=Number(n%58n);out=alphabet[r]+out;n/=58n;}
  let zeros=0;while(zeros<bytes.length&&bytes[zeros]===0)zeros++;
  return "1".repeat(zeros)+(out||"");
}

function launchLabTradeEvent() {
  return Buffer.concat([
    discriminator(launchpadIdl.events,"TradeEvent"),
    pubkey(POOL),
    u64(793_100_000_000_000),u64(1_073_000_000_000_000),u64(30_000_000_000),
    u64(700_000_000_000_000),u64(85_000_000_000),u64(699_000_000_000_000),u64(86_000_000_000),
    u64(1_000_000_000),u64(10_000_000_000),
    u64(2_500_000),u64(1_000_000),u64(500_000),u64(250_000),
    u8(0),u8(0),u8(1),
  ]);
}

function cpmmSwapEvent() {
  return Buffer.concat([
    discriminator(cpmmIdl.events,"SwapEvent"),
    pubkey(CPMM_POOL),
    u64(783_000_000_000),u64(137_000_000_000_000),
    u64(1_000_000_000),u64(100_000_000_000),
    u64(0),u64(0),u8(1),pubkey(WSOL),pubkey(MINT),
    u64(2_500_000),u64(0),u8(1),
  ]);
}

function launchLabPoolState() {
  const account=launchpadIdl.accounts.find(x=>x.name==="PoolState");
  return Buffer.concat([
    Buffer.from(account.discriminator),
    u64(1),u8(1),u8(2),u8(6),u8(9),u8(1),
    u64(1_000_000_000_000_000),u64(793_100_000_000_000),
    u64(1_073_000_000_000_000),u64(30_000_000_000),
    u64(699_000_000_000_000),u64(86_000_000_000),
    u64(85_000_000_000),u64(1_000_000),u64(2_000_000),
    u64(1_000_000),u64(1_000_000),
    u64(0),u64(0),u64(0),u64(0),u64(0),
    pubkey(ZERO),pubkey(ZERO),pubkey(MINT),pubkey(WSOL),
    pubkey(ZERO),pubkey(ZERO),pubkey(ZERO),
    u8(0),u8(0),u64(0),Buffer.alloc(54),
  ]);
}

test("official Raydium LaunchLab and CPMM program IDs and IDL provenance are pinned", () => {
  assert.equal(RAYDIUM_LAUNCHLAB_PROGRAM_ID,"LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj");
  assert.equal(RAYDIUM_CPMM_PROGRAM_ID,"CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");
  const metadata=getRaydiumIdlMetadata();
  assert.equal(metadata.launchlab.source_blob_sha,"70186e3f02c2bead7e5a9a92453104df853683ed");
  assert.equal(metadata.cpmm.source_blob_sha,"923d272a4e56643ef7fece05ca137c036b0295de");
});

test("shared Borsh reader decodes Anchor enums with and without payload fields", () => {
  const typeMap=createTypeMap({launchlab:launchpadIdl},"launchlab");
  const direction=typeMap.get("TradeDirection");
  const decoded=readIdlDefinition(new BorshReader(u8(1)),direction,typeMap);
  assert.deepEqual(decoded.value,{variant:"Sell",fields:null});
  const curve=typeMap.get("CurveParams");
  const bytes=Buffer.concat([u8(0),u64(100),u64(80),u64(70),u8(1)]);
  const decodedCurve=readIdlDefinition(new BorshReader(bytes),curve,typeMap);
  assert.equal(decodedCurve.value.variant,"Constant");
  assert.equal(decodedCurve.value.fields.data.supply,100n);
  assert.equal(decodedCurve.value.fields.data.migrate_type,1n);
});

test("LaunchLab TradeEvent decodes from Anchor event-CPI data", () => {
  const data=Buffer.concat([ANCHOR_EVENT_IX_TAG,launchLabTradeEvent()]);
  const result=decodeRaydiumEvent({programId:RAYDIUM_LAUNCHLAB_PROGRAM_ID,data});
  assert.equal(result.status,"DECODED");
  assert.equal(result.event_name,"TradeEvent");
  assert.equal(result.event_cpi,true);
  assert.equal(result.data.pool_state,POOL);
  assert.equal(result.data.trade_direction.variant,"Buy");
  assert.equal(result.data.pool_status.variant,"Fund");
  assert.equal(result.data.amount_in,1_000_000_000n);
  assert.equal(result.data.amount_out,10_000_000_000n);
  assert.equal(result.data.platform_fee,1_000_000n);
});

test("Raydium CPMM SwapEvent decodes exact input/output and transfer fee fields", () => {
  const result=decodeRaydiumEvent({
    programId:RAYDIUM_CPMM_PROGRAM_ID,
    data:cpmmSwapEvent(),
  });
  assert.equal(result.status,"DECODED");
  assert.equal(result.event_name,"SwapEvent");
  assert.equal(result.data.pool_id,CPMM_POOL);
  assert.equal(result.data.base_input,true);
  assert.equal(result.data.input_mint,WSOL);
  assert.equal(result.data.output_mint,MINT);
  assert.equal(result.data.input_amount,1_000_000_000n);
  assert.equal(result.data.output_amount,100_000_000_000n);
});

test("LaunchLab PoolState account decodes with its current IDL layout", () => {
  const result=decodeRaydiumAccount({
    programId:RAYDIUM_LAUNCHLAB_PROGRAM_ID,
    data:launchLabPoolState(),
  });
  assert.equal(result.status,"DECODED");
  assert.equal(result.account_name,"PoolState");
  assert.equal(result.data.status,2n);
  assert.equal(result.data.migrate_type,1n);
  assert.equal(result.data.base_mint,MINT);
  assert.equal(result.data.quote_mint,WSOL);
  assert.equal(result.data.real_base,699_000_000_000_000n);
  assert.equal(result.data.amm_creator_fee_on.variant,"QuoteToken");
});

test("Raydium transaction parser extracts LaunchLab event CPI from inner instructions", () => {
  const keys=[RAYDIUM_LAUNCHLAB_PROGRAM_ID,POOL,MINT,WSOL,ZERO];
  const eventData=Buffer.concat([ANCHOR_EVENT_IX_TAG,launchLabTradeEvent()]);
  const tx={
    slot:472_621_000,
    blockTime:1_795_371_395,
    transaction:{signatures:["fixture-signature"],message:{accountKeys:keys,instructions:[]}},
    meta:{
      err:null,
      loadedAddresses:{writable:[],readonly:[]},
      innerInstructions:[{index:0,instructions:[{
        programIdIndex:0,
        accounts:[1,2,3,4],
        data:b58(eventData),
      }]}],
      logMessages:[],
    },
  };
  const result=decodeRaydiumTransaction({transaction:tx,signature:"fixture-signature",transactionIndex:4});
  assert.equal(result.status,"DECODED");
  assert.equal(result.events.length,1);
  assert.equal(result.events[0].event_name,"TradeEvent");
  assert.equal(result.events[0].source,"event_cpi_instruction");
  assert.equal(result.events[0].outer_instruction_index,0);
  assert.equal(result.events[0].data.pool_state,POOL);
});

test("failed Raydium transactions never contribute decoded execution events", () => {
  const keys=[RAYDIUM_CPMM_PROGRAM_ID];
  const tx={
    slot:1,
    transaction:{signatures:["failed"],message:{accountKeys:keys,instructions:[]}},
    meta:{err:{InstructionError:[0,"Custom"]},loadedAddresses:{writable:[],readonly:[]},innerInstructions:[]},
  };
  const result=decodeRaydiumTransaction({transaction:tx,signature:"failed"});
  assert.equal(result.status,"FAILED_TRANSACTION");
  assert.deepEqual(result.events,[]);
});
