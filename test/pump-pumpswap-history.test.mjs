import test from "node:test";
import assert from "node:assert/strict";
import {reviewGraduationHistory} from "../src/inner-market/graduation-history-review.mjs";
import snapshot from "../src/adapters/pump/pump-idl.snapshot.json" with { type: "json" };
import { decodeBase58 } from "../src/adapters/pump/borsh.mjs";
import {
  PUMP_PROGRAM_ID,
  PUMP_AMM_PROGRAM_ID,
} from "../src/adapters/pump/pump-decoder.mjs";
import {
  SPL_TOKEN_PROGRAM_ID,
} from "../src/adapters/pump/pump-account-codec.mjs";
import { derivePumpBondingCurveAddress, fetchPumpMintHistory } from "../src/adapters/pump/pump-history-collector.mjs";

const ZERO = "11111111111111111111111111111111";
const USER = "Vote111111111111111111111111111111111111111";
const MINT = "SysvarRent111111111111111111111111111111111";
const POOL = "SysvarC1ock11111111111111111111111111111111";
const USER_BASE = "SysvarRecentB1ockHashes11111111111111111111";
const USER_QUOTE = "SysvarS1otHashes111111111111111111111111111";
const BASE_VAULT = "SysvarEpochSchedu1e111111111111111111111111";
const QUOTE_VAULT = "SysvarFees111111111111111111111111111111111";
const MIGRATION_SIG = "pump-migration-signature";
const POOL_BUY_SIG = "pumpswap-buy-signature";

function u8(v){const b=Buffer.alloc(1);b.writeUInt8(v);return b;}
function u16(v){const b=Buffer.alloc(2);b.writeUInt16LE(v);return b;}
function u32(v){const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;}
function u64(v){const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(v));return b;}
function i64(v){const b=Buffer.alloc(8);b.writeBigInt64LE(BigInt(v));return b;}
function i128(v){const b=Buffer.alloc(16);let n=BigInt(v);if(n<0)n=(1n<<128n)+n;b.writeBigUInt64LE(n&((1n<<64n)-1n),0);b.writeBigUInt64LE(n>>64n,8);return b;}
function pubkey(v){const b=decodeBase58(v);assert.equal(b.length,32);return b;}
function str(v){const b=Buffer.from(v);return Buffer.concat([u32(b.length),b]);}
function disc(items,name){return Buffer.from(items.find(x=>x.name===name).discriminator);}

function createEvent() {
  return Buffer.concat([
    disc(snapshot.pump.events,"CreateEvent"),
    str("Full History Fixture"),str("FULL"),str("https://example.invalid/full"),
    pubkey(MINT),pubkey(derivePumpBondingCurveAddress(MINT)),pubkey(USER),pubkey(USER),
    i64(1_700_000_000),
    u64(1_000_000),u64(2_000_000),u64(500_000),u64(1_500_000),
    pubkey(SPL_TOKEN_PROGRAM_ID),u8(0),u8(0),pubkey(ZERO),
    u64(2_000_000),u64(0),u8(0),u8(0),
  ]);
}

function completingTradeEvent() {
  return Buffer.concat([
    disc(snapshot.pump.events,"TradeEvent"),
    pubkey(MINT),u64(500_000),u64(900_000),u8(1),pubkey(USER),i64(1_700_000_010),
    u64(2_000_000),u64(1_000_000),u64(100_000),u64(0),
    pubkey(ZERO),u64(100),u64(5),pubkey(USER),u64(50),u64(3),
    u8(0),u64(0),u64(0),u64(0),i64(1_700_000_000),
    str("buy_v3"),u8(0),u64(0),u64(0),u64(0),u64(0),u32(0),
    pubkey(ZERO),u64(500_000),u64(2_000_000),u64(100_000),u64(0),u64(0),u64(0),
  ]);
}

function completeEvent() {
  return Buffer.concat([
    disc(snapshot.pump.events,"CompleteEvent"),
    pubkey(USER),pubkey(MINT),pubkey(derivePumpBondingCurveAddress(MINT)),
    i64(1_700_000_011),pubkey(ZERO),
  ]);
}

function migrationEvent() {
  return Buffer.concat([
    disc(snapshot.pump.events,"CompletePumpAmmMigrationEvent"),
    pubkey(USER),pubkey(MINT),u64(400),u64(300),u64(10),
    pubkey(derivePumpBondingCurveAddress(MINT)),i64(1_700_000_012),
    pubkey(POOL),pubkey(ZERO),
  ]);
}

function createPoolEvent() {
  return Buffer.concat([
    disc(snapshot.pump_amm.events,"CreatePoolEvent"),
    i64(1_700_000_012),u16(0),pubkey(USER),pubkey(MINT),pubkey("So11111111111111111111111111111111111111112"),
    u8(6),u8(9),u64(400),u64(300),u64(1000),u64(500),
    u64(100),u64(300),u64(250),u8(1),pubkey(POOL),pubkey(USER),
    pubkey(USER_BASE),pubkey(USER_QUOTE),pubkey(USER),u8(0),u64(50),u8(0),u8(0),
  ]);
}

function poolBuyEvent() {
  return Buffer.concat([
    disc(snapshot.pump_amm.events,"BuyEvent"),
    i64(1_700_000_100),
    u64(100),u64(60),u64(0),u64(0),u64(1000),u64(500),u64(50),
    u64(100),u64(2),u64(100),u64(2),u64(52),u64(55),
    pubkey(POOL),pubkey(USER),pubkey(USER_BASE),pubkey(USER_QUOTE),
    pubkey(ZERO),pubkey(ZERO),pubkey(USER),u64(50),u64(1),u8(1),
    u64(0),u64(0),u64(0),i64(1_700_000_100),u64(90),str("buy_v2"),
    u64(0),u64(0),u64(0),u64(1),i128(-3),u8(0),u64(1_000_000),
    u64(0),u64(0),u64(1),
  ]);
}

function mintAccountInfo() {
  const bytes=Buffer.alloc(82);
  bytes.writeBigUInt64LE(1_500_000n,36);
  bytes.writeUInt8(6,44);
  bytes.writeUInt8(1,45);
  return {context:{slot:102},value:{owner:SPL_TOKEN_PROGRAM_ID,data:[bytes.toString("base64"),"base64"]}};
}

function curveAccountInfo() {
  const account=snapshot.pump.accounts.find(x=>x.name==="BondingCurve");
  const bytes=Buffer.concat([
    Buffer.from(account.discriminator),
    u64(1_000_000),u64(2_000_000),u64(0),u64(500_000),u64(1_500_000),
    u8(1),pubkey(USER),u8(0),u8(0),pubkey(ZERO),u64(0),u8(0),u8(0),
    u64(0),u64(0),u8(0),u64(2_000_000),u64(0),u64(0),
  ]);
  return {context:{slot:102},value:{owner:PUMP_PROGRAM_ID,data:[bytes.toString("base64"),"base64"]}};
}

function poolAccountInfo() {
  const account=snapshot.pump_amm.accounts.find(x=>x.name==="Pool");
  const bytes=Buffer.concat([
    Buffer.from(account.discriminator),
    u8(1),u16(0),pubkey(USER),pubkey(MINT),pubkey("So11111111111111111111111111111111111111112"),
    pubkey(USER),pubkey(BASE_VAULT),pubkey(QUOTE_VAULT),u64(1000),pubkey(USER),
    u8(0),u8(0),i128(-3),u64(50),u8(0),u8(0),u64(2),u64(1),
  ]);
  return {context:{slot:102},value:{owner:PUMP_AMM_PROGRAM_ID,data:[bytes.toString("base64"),"base64"]}};
}

function tokenAccountInfo(mint, amount) {
  const bytes=Buffer.alloc(165);
  pubkey(mint).copy(bytes,0);
  pubkey(POOL).copy(bytes,32);
  bytes.writeBigUInt64LE(BigInt(amount),64);
  bytes.writeUInt8(1,108);
  return {context:{slot:102},value:{owner:SPL_TOKEN_PROGRAM_ID,data:[bytes.toString("base64"),"base64"]}};
}

function migrationTransaction() {
  return {
    slot:100,blockTime:1_700_000_012,
    transaction:{signatures:[MIGRATION_SIG],message:{accountKeys:[USER,derivePumpBondingCurveAddress(MINT),MINT,POOL,PUMP_PROGRAM_ID,PUMP_AMM_PROGRAM_ID],instructions:[]}},
    meta:{
      err:null,fee:5000,preBalances:Array(6).fill(0),postBalances:Array(6).fill(0),
      preTokenBalances:[],postTokenBalances:[],innerInstructions:[],
      loadedAddresses:{writable:[],readonly:[]},
      logMessages:[
        `Program ${PUMP_PROGRAM_ID} invoke [1]`,
        `Program data: ${createEvent().toString("base64")}`,
        `Program data: ${completingTradeEvent().toString("base64")}`,
        `Program data: ${completeEvent().toString("base64")}`,
        `Program ${PUMP_PROGRAM_ID} success`,
        `Program ${PUMP_AMM_PROGRAM_ID} invoke [1]`,
        `Program data: ${createPoolEvent().toString("base64")}`,
        `Program ${PUMP_AMM_PROGRAM_ID} success`,
        `Program ${PUMP_PROGRAM_ID} invoke [1]`,
        `Program data: ${migrationEvent().toString("base64")}`,
        `Program ${PUMP_PROGRAM_ID} success`,
      ],
    },
  };
}

function poolBuyTransaction() {
  const keys=[
    POOL,USER,"Config1111111111111111111111111111111111111",MINT,
    "So11111111111111111111111111111111111111112",USER_BASE,USER_QUOTE,
    BASE_VAULT,QUOTE_VAULT,SPL_TOKEN_PROGRAM_ID,SPL_TOKEN_PROGRAM_ID,
    ZERO,"SysvarStakeHistory1111111111111111111111111",
    "Sysvar1nstructions1111111111111111111111111",USER,
    "SysvarRent111111111111111111111111111111111",PUMP_AMM_PROGRAM_ID,
  ];
  const ix=snapshot.pump_amm.instructions.find(x=>x.name==="buy_v2");
  const data=Buffer.concat([Buffer.from(ix.discriminator),u64(100),u64(60)]);
  const balances=[
    [5,MINT,USER,"0","100"],
    [6,"So11111111111111111111111111111111111111112",USER,"1000","945"],
    [7,MINT,POOL,"1000","900"],
    [8,"So11111111111111111111111111111111111111112",POOL,"500","554"],
  ];
  return {
    slot:101,blockTime:1_700_000_100,
    transaction:{
      signatures:[POOL_BUY_SIG],
      message:{accountKeys:keys,instructions:[{
        programIdIndex:16,accounts:Array.from({length:17},(_,i)=>i),
        data:encode58(data),
      }]},
    },
    meta:{
      err:null,fee:5000,preBalances:Array(17).fill(0),postBalances:Array(17).fill(0),
      preTokenBalances:balances.map(([accountIndex,mint,owner,amount])=>({
        accountIndex,mint,owner,uiTokenAmount:{amount,decimals:mint===MINT?6:9},
      })),
      postTokenBalances:balances.map(([accountIndex,mint,owner,pre,post])=>({
        accountIndex,mint,owner,uiTokenAmount:{amount:post,decimals:mint===MINT?6:9},
      })),
      innerInstructions:[],loadedAddresses:{writable:[],readonly:[]},
      logMessages:[
        `Program ${PUMP_AMM_PROGRAM_ID} invoke [1]`,
        `Program data: ${poolBuyEvent().toString("base64")}`,
        `Program ${PUMP_AMM_PROGRAM_ID} success`,
      ],
    },
  };
}

function encode58(bytes) {
  const alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n=BigInt("0x"+bytes.toString("hex"));
  let out="";
  while(n>0n){const r=Number(n%58n);out=alphabet[r]+out;n/=58n;}
  for(const b of bytes){if(b!==0)break;out="1"+out;}
  return out||"1";
}

test("full mint collector follows migration into PumpSwap and reconciles post-graduation swaps",async()=>{
  const curve=derivePumpBondingCurveAddress(MINT);
  const migration=migrationTransaction();
  const poolBuy=poolBuyTransaction();
  const rpc={
    async getAccountInfo(address){
      if(address===MINT)return mintAccountInfo();
      if(address===curve)return curveAccountInfo();
      if(address===POOL)return poolAccountInfo();
      if(address===BASE_VAULT)return tokenAccountInfo(MINT,900);
      if(address===QUOTE_VAULT)return tokenAccountInfo("So11111111111111111111111111111111111111112",554);
      throw new Error("unexpected account "+address);
    },
    async getSignaturesForAddress(address){
      if(address===curve)return [{signature:MIGRATION_SIG,slot:100,err:null}];
      if(address===POOL)return [
        {signature:POOL_BUY_SIG,slot:101,err:null},
        {signature:MIGRATION_SIG,slot:100,err:null},
      ];
      throw new Error("unexpected signature address "+address);
    },
    async getTransaction(signature){
      if(signature===MIGRATION_SIG)return migration;
      if(signature===POOL_BUY_SIG)return poolBuy;
      throw new Error("unexpected signature "+signature);
    },
    async getBlock(slot){
      if(slot===100)return {transactions:[{transaction:{signatures:[MIGRATION_SIG]}}]};
      if(slot===101)return {transactions:[{transaction:{signatures:[POOL_BUY_SIG]}}]};
      throw new Error("unexpected slot "+slot);
    },
  };
  for (const network of ["mainnet", "local_sim"]) {
  const result=await fetchPumpMintHistory({rpc,mint:MINT,network,maxSignatures:20});
  assert.ok(result.events.every(event => event.market.network === network && event.provenance === "observed_chain"));
  assert.equal(result.curve_replay_status,"REPLAYED_FULL_CURVE_HISTORY");
  assert.notEqual(result.event_timeline_audit.curve.status,"REVIEW_REQUIRED");
  assert.equal(result.candle_integrity_audit.status,"CONSISTENT");
  assert.equal(result.source_provenance.source_attestation,"UNKNOWN");
  assert.equal(result.source_provenance.status,"UNVERIFIED");
  assert.equal(result.signature_coverage.pagination_evidence.status,"TERMINATION_DECLARED");
  assert.equal(result.historical_read_evidence.status,"PARTIAL");
  assert.equal(result.historical_read_evidence.history_complete_attested,false);
  await assert.rejects(()=>fetchPumpMintHistory({rpc:{...rpc,getGenesisHash:async()=>"wrong"},mint:MINT,network,expectedGenesisHash:"expected"}),/PINNED_GENESIS_MISMATCH/);
  assert.equal(result.pool_replays.length,1);
  assert.equal(result.pool_replays[0].replay_status,"REPLAYED_FULL_POOL_HISTORY");
  assert.equal(result.status,"REPLAYED_FULL_HISTORY");
  assert.equal(result.pool_replays[0].replay.state.pool_base_reserves_base_units,"900");
  assert.equal(result.pool_replays[0].replay.state.pool_quote_reserves_base_units,"554");
  assert.equal(result.pool_replays[0].replay.state.virtual_quote_reserves_base_units,"-3");
  assert.equal(BigInt(result.pool_replays[0].replay.state.pool_quote_reserves_base_units)+BigInt(result.pool_replays[0].replay.state.virtual_quote_reserves_base_units),551n);
  assert.equal(result.pool_replays[0].trade_balance_reconciliation_complete,true);
  assert.equal(result.pool_replays[0].current_account_reconciliation.status,"PASS");
  assert.equal(result.events.filter(x=>x.event_kind==="POOL_BUY_EXECUTED").length,1);
  assert.equal(result.raw_candles_status,"AVAILABLE");
  assert.equal(result.raw_candles_1m.length,2);
  const archived=JSON.parse(JSON.stringify(result,(_,v)=>typeof v==="bigint"?v.toString():v));
  const review=reviewGraduationHistory(archived);
  assert.equal(review.scope.token_mint,MINT);assert.equal(review.lifecycle.migration_pool_address,POOL);
  assert.equal(review.pools.length,1);assert.equal(review.source_attestation,"UNKNOWN");assert.equal(review.settlement_allowed,false);
  }
  // Encoded synthetic stage-event regression, not a retained RPC receipt.
  // The earlier creation values must not silently become a final snapshot.
  const init = Buffer.concat([
    disc(snapshot.pump_amm.events,"InitBoostEvent"),i64(1_700_000_012),
    pubkey(MINT),pubkey(curve),pubkey(POOL),i128(172772587),u64(662281004),
  ]);
  const logIndex=migration.meta.logMessages.findIndex(log=>log.startsWith("Program data: "+createPoolEvent().toString("base64")));
  assert.ok(logIndex>=0);
  migration.meta.logMessages.splice(logIndex+1,0,"Program data: "+init.toString("base64"));
  const partial=await fetchPumpMintHistory({rpc,mint:MINT,network:"local_sim",maxSignatures:20});
  const pool=partial.pool_replays[0];
  assert.equal(pool.replay_status,"PARTIAL_POOL_HISTORY");
  assert.equal(pool.replay,null);
  assert.equal(pool.current_account_reconciliation.status,"UNKNOWN");
  assert.equal(pool.initialization_evidence.length,1);
  assert.equal(pool.initialization_evidence[0].status,"POOL_INITIALIZATION_PHASE_UNRECONCILED");
  assert.notEqual(partial.status,"REPLAYED_FULL_HISTORY");
});
