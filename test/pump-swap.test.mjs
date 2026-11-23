import test from "node:test";
import assert from "node:assert/strict";
import snapshot from "../src/adapters/pump/pump-idl.snapshot.json" with { type: "json" };
import { decodeBase58, encodeBase58 } from "../src/adapters/pump/borsh.mjs";
import {
  PUMP_PROGRAM_ID,
  PUMP_AMM_PROGRAM_ID,
} from "../src/adapters/pump/pump-decoder.mjs";
import {
  SPL_TOKEN_PROGRAM_ID,
  decodePumpSwapPoolAccount,
  decodeTokenAccount,
} from "../src/adapters/pump/pump-account-codec.mjs";
import { decodePumpTransaction } from "../src/adapters/pump/pump-transaction-parser.mjs";
import { reconcilePumpSwapTradesWithTransaction } from "../src/adapters/pump/transaction-reconciler.mjs";
import {
  createInitialPumpSwapPoolState,
  replayPumpSwapPoolEvents,
  reconcilePumpSwapPoolSnapshot,
} from "../src/core/pool-state.mjs";

const ZERO = "11111111111111111111111111111111";
const USER = "Vote111111111111111111111111111111111111111";
const BASE_MINT = "SysvarRent111111111111111111111111111111111";
const QUOTE_MINT = "So11111111111111111111111111111111111111112";
const POOL = "SysvarC1ock11111111111111111111111111111111";
const USER_BASE = "SysvarRecentB1ockHashes11111111111111111111";
const USER_QUOTE = "SysvarS1otHashes111111111111111111111111111";
const BASE_VAULT = "SysvarEpochSchedu1e111111111111111111111111";
const QUOTE_VAULT = "SysvarFees111111111111111111111111111111111";
const GLOBAL_CONFIG = "Config1111111111111111111111111111111111111";
const USER_VOLUME = "SysvarStakeHistory1111111111111111111111111";
const FEE_CONFIG = "Sysvar1nstructions1111111111111111111111111";
const BUYBACK = "SysvarC1ock11111111111111111111111111111111";
const EVENT_AUTHORITY = "SysvarRent111111111111111111111111111111111";

function u8(v){const b=Buffer.alloc(1);b.writeUInt8(v);return b;}
function u16(v){const b=Buffer.alloc(2);b.writeUInt16LE(v);return b;}
function u32(v){const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;}
function u64(v){const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(v));return b;}
function i64(v){const b=Buffer.alloc(8);b.writeBigInt64LE(BigInt(v));return b;}
function i128(v){const b=Buffer.alloc(16);let n=BigInt(v);if(n<0)n=(1n<<128n)+n;b.writeBigUInt64LE(n&((1n<<64n)-1n),0);b.writeBigUInt64LE(n>>64n,8);return b;}
function pubkey(v){const b=decodeBase58(v);assert.equal(b.length,32);return b;}
function str(v){const b=Buffer.from(v);return Buffer.concat([u32(b.length),b]);}
function disc(items,name){return Buffer.from(items.find(x=>x.name===name).discriminator);}

function buildBuyEvent() {
  return Buffer.concat([
    disc(snapshot.pump_amm.events,"BuyEvent"),
    i64(1_700_000_100),
    u64(100),u64(60),
    u64(0),u64(0),
    u64(1000),u64(500),
    u64(50),
    u64(100),u64(2),
    u64(100),u64(2),
    u64(52),u64(55),
    pubkey(POOL),pubkey(USER),pubkey(USER_BASE),pubkey(USER_QUOTE),
    pubkey(ZERO),pubkey(ZERO),pubkey(USER),
    u64(50),u64(1),
    u8(1),
    u64(0),u64(0),u64(0),
    i64(1_700_000_100),
    u64(90),
    str("buy_v2"),
    u64(0),u64(0),
    u64(0),u64(1),
    i128(0),
    u8(0),
    u64(1_000_000),
    u64(0),u64(0),u64(1),
  ]);
}

function poolCreatedEvent() {
  return {
    schema_version:"1.0.0",
    event_id:"pool-create",
    provenance:"observed_chain",
    event_kind:"POOL_CREATED",
    market:{
      chain_id:"solana",network:"mainnet",token_mint:BASE_MINT,quote_mint:QUOTE_MINT,
      curve_program_id:PUMP_PROGRAM_ID,curve_account:null,program_version:null,
      idl_revision:"fixture",market_phase:"post_graduation",
    },
    event_time_ms:1_700_000_000_000,
    ordering:{slot:10,transaction_index:0,instruction_index:0,inner_instruction_index:null,event_sequence:0,ordering_confidence:"complete"},
    source:{source_type:"rpc",source_id:"pool-create",signature:"pool-create"},
    payload:{
      pool_address:POOL,base_mint:BASE_MINT,quote_mint:QUOTE_MINT,
      pool_base_reserves_base_units:"1000",pool_quote_reserves_base_units:"500",
    },
    quality:{is_complete:true,validation_status:"valid",warnings:[],reconciliation_ref:null},
  };
}

function makeTransaction() {
  const keys=[
    POOL,USER,GLOBAL_CONFIG,BASE_MINT,QUOTE_MINT,USER_BASE,USER_QUOTE,
    BASE_VAULT,QUOTE_VAULT,SPL_TOKEN_PROGRAM_ID,SPL_TOKEN_PROGRAM_ID,
    "11111111111111111111111111111111",USER_VOLUME,FEE_CONFIG,BUYBACK,
    EVENT_AUTHORITY,PUMP_AMM_PROGRAM_ID,
  ];
  const buyInstruction=snapshot.pump_amm.instructions.find(x=>x.name==="buy_v2");
  const instructionData=Buffer.concat([Buffer.from(buyInstruction.discriminator),u64(100),u64(60)]);
  const amounts=[
    [5,BASE_MINT,USER,"0","100"],
    [6,QUOTE_MINT,USER,"1000","945"],
    [7,BASE_MINT,POOL,"1000","900"],
    [8,QUOTE_MINT,POOL,"500","554"],
  ];
  const preTokenBalances=amounts.map(([accountIndex,mint,owner,amount])=>({
    accountIndex,mint,owner,uiTokenAmount:{amount,decimals:mint===BASE_MINT?6:9},
  }));
  const postTokenBalances=amounts.map(([accountIndex,mint,owner,pre,post])=>({
    accountIndex,mint,owner,uiTokenAmount:{amount:post,decimals:mint===BASE_MINT?6:9},
  }));
  return {
    slot:20,blockTime:1_700_000_100,
    transaction:{
      signatures:["pool-buy-signature"],
      message:{
        accountKeys:keys,
        instructions:[{
          programIdIndex:16,
          accounts:Array.from({length:17},(_,i)=>i),
          data:encodeBase58(instructionData),
        }],
      },
    },
    meta:{
      err:null,fee:5000,preBalances:Array(17).fill(0),postBalances:Array(17).fill(0),
      preTokenBalances,postTokenBalances,
      innerInstructions:[],loadedAddresses:{writable:[],readonly:[]},
      logMessages:[
        `Program ${PUMP_AMM_PROGRAM_ID} invoke [1]`,
        `Program data: ${buildBuyEvent().toString("base64")}`,
        `Program ${PUMP_AMM_PROGRAM_ID} success`,
      ],
    },
  };
}

test("official PumpSwap IDL includes swap events and trade instructions",()=>{
  assert.ok(snapshot.pump_amm.events.some(x=>x.name==="BuyEvent"));
  assert.ok(snapshot.pump_amm.events.some(x=>x.name==="SellEvent"));
  assert.ok(snapshot.pump_amm.instructions.some(x=>x.name==="buy_v2"));
  assert.ok(snapshot.pump_amm.instructions.some(x=>x.name==="sell_v2"));
});

test("PumpSwap BuyEvent decodes, normalizes and reconciles actor and pool-vault deltas",()=>{
  const transaction=makeTransaction();
  const parsed=decodePumpTransaction({
    transaction,
    signature:"pool-buy-signature",
    transactionIndex:2,
    poolMetadataByAddress:{
      [POOL]:{
        pool_address:POOL,base_mint:BASE_MINT,quote_mint:QUOTE_MINT,
        base_mint_decimals:6,quote_mint_decimals:9,
        pool_base_token_account:BASE_VAULT,pool_quote_token_account:QUOTE_VAULT,
      },
    },
  });
  assert.deepEqual(parsed.unresolved_events, []);
  assert.equal(parsed.status,"DECODED");
  assert.equal(parsed.events.length,1);
  const event=parsed.events[0];
  assert.equal(event.event_kind,"POOL_BUY_EXECUTED");
  assert.equal(event.payload.token_amount_base_units,"100");
  assert.equal(event.payload.quote_amount_base_units,"55");
  assert.equal(event.payload.pool_reserves_before.pool_base_reserves_base_units,"1000");
  assert.equal(event.payload.pool_reserves_before.pool_quote_reserves_base_units,"500");
  const reconciliation=reconcilePumpSwapTradesWithTransaction({transaction,tradeEvents:[event]});
  assert.equal(reconciliation.status,"PASS");
  assert.deepEqual(reconciliation.checks.map(x=>x.status),["PASS","PASS","PASS","PASS"]);
  const deltas=parsed.balance_deltas.token_accounts;
  event.payload.pool_vault_deltas={
    base_delta_base_units:deltas.find(x=>x.address===BASE_VAULT).delta_base_units,
    quote_delta_base_units:deltas.find(x=>x.address===QUOTE_VAULT).delta_base_units,
  };
  const decodedPoolSnapshot={context_slot:25,data:{
    virtual_quote_reserves_base_units:"-3",
    protocol_fees_base_units:"2",
    creator_fees_base_units:"1",
  }};
  const initial=createInitialPumpSwapPoolState({poolCreatedEvent:poolCreatedEvent(),decodedPool:decodedPoolSnapshot});
  const replay=replayPumpSwapPoolEvents(initial,[event]);
  assert.equal(replay.status,"PASS");
  assert.equal(replay.state.pool_base_reserves_base_units,"900");
  assert.equal(replay.state.pool_quote_reserves_base_units,"554");
  assert.equal(replay.state.protocol_fees_base_units,"2");
  assert.equal(replay.state.creator_fees_base_units,"1");
  const current=reconcilePumpSwapPoolSnapshot({
    replayedState:replay.state,
    decodedPool:decodedPoolSnapshot,
    baseVault:{amount_base_units:"900"},
    quoteVault:{amount_base_units:"554"},
  });
  assert.equal(current.status,"PASS");
});

test("PumpSwap v2 fee sweeps move virtual reserves opposite to quote-vault balances",()=>{
  const transaction=makeTransaction();
  const parsed=decodePumpTransaction({
    transaction,
    signature:"pool-buy-with-fees",
    transactionIndex:2,
    poolMetadataByAddress:{
      [POOL]:{
        pool_address:POOL,base_mint:BASE_MINT,quote_mint:QUOTE_MINT,
        base_mint_decimals:6,quote_mint_decimals:9,
        pool_base_token_account:BASE_VAULT,pool_quote_token_account:QUOTE_VAULT,
      },
    },
  });
  const buy=parsed.events[0];
  buy.payload.pool_vault_deltas={base_delta_base_units:"-100",quote_delta_base_units:"54"};
  const market=buy.market;
  const sweep=(signature,slot,bucket,amount,quoteDelta)=>({
    schema_version:"1.0.0",event_id:signature,provenance:"observed_chain",
    event_kind:"POOL_FEE_MOVEMENT",market,event_time_ms:1_700_000_200_000+slot,
    ordering:{slot,transaction_index:0,instruction_index:0,inner_instruction_index:null,event_sequence:0,ordering_confidence:"complete"},
    source:{source_type:"rpc",source_id:signature,signature},
    payload:{pool_address:POOL,amount_base_units:String(amount),fee_bucket:bucket,
      pool_vault_deltas:{base_delta_base_units:"0",quote_delta_base_units:String(quoteDelta)}},
    quality:{is_complete:true,validation_status:"valid",warnings:[],reconciliation_ref:null},
  });
  const finalPool={data:{
    virtual_quote_reserves_base_units:"0",
    protocol_fees_base_units:"0",
    creator_fees_base_units:"0",
  }};
  const initial=createInitialPumpSwapPoolState({
    poolCreatedEvent:poolCreatedEvent(),
    decodedPool:finalPool,
  });
  const replay=replayPumpSwapPoolEvents(initial,[
    buy,
    sweep("protocol-sweep",21,0,2,-2),
    sweep("creator-sweep",22,1,1,-1),
  ]);
  assert.equal(replay.status,"PASS");
  assert.equal(replay.state.pool_quote_reserves_base_units,"551");
  assert.equal(replay.state.protocol_fees_base_units,"0");
  assert.equal(replay.state.creator_fees_base_units,"0");
  assert.equal(replay.state.virtual_quote_reserves_base_units,"0");
  assert.equal(
    BigInt(replay.state.pool_quote_reserves_base_units)+BigInt(replay.state.virtual_quote_reserves_base_units),
    551n,
  );
});

test("PumpSwap Pool account and token vault account decoders read current state",()=>{
  const poolAccount=snapshot.pump_amm.accounts.find(x=>x.name==="Pool");
  const poolBytes=Buffer.concat([
    Buffer.from(poolAccount.discriminator),
    u8(1),u16(0),pubkey(USER),pubkey(BASE_MINT),pubkey(QUOTE_MINT),
    pubkey(USER),pubkey(BASE_VAULT),pubkey(QUOTE_VAULT),
    u64(1000),pubkey(USER),u8(0),u8(0),i128(-3),u64(0),u8(0),u8(0),
    u64(2),u64(1),
  ]);
  const decodedPool=decodePumpSwapPoolAccount({
    context:{slot:30},
    value:{owner:PUMP_AMM_PROGRAM_ID,data:[poolBytes.toString("base64"),"base64"]},
  });
  assert.equal(decodedPool.status,"DECODED");
  assert.equal(decodedPool.data.base_mint,BASE_MINT);
  assert.equal(decodedPool.data.pool_quote_token_account,QUOTE_VAULT);
  assert.equal(decodedPool.data.protocol_fees_base_units,"2");

  const tokenBytes=Buffer.alloc(165);
  pubkey(BASE_MINT).copy(tokenBytes,0);
  pubkey(POOL).copy(tokenBytes,32);
  tokenBytes.writeBigUInt64LE(900n,64);
  tokenBytes.writeUInt8(1,108);
  const decodedVault=decodeTokenAccount({
    context:{slot:30},
    value:{owner:SPL_TOKEN_PROGRAM_ID,data:[tokenBytes.toString("base64"),"base64"]},
  });
  assert.equal(decodedVault.mint,BASE_MINT);
  assert.equal(decodedVault.token_authority,POOL);
  assert.equal(decodedVault.amount_base_units,"900");
});
