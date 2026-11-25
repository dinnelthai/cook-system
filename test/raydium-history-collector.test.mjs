import test from "node:test";
import assert from "node:assert/strict";
import launchpadIdl from "../src/adapters/raydium/idl/raydium_launchpad.json" with { type: "json" };
import cpmmIdl from "../src/adapters/raydium/idl/raydium_cp_swap.json" with { type: "json" };
import {
  RAYDIUM_CPMM_PROGRAM_ID,
  RAYDIUM_LAUNCHLAB_PROGRAM_ID,
} from "../src/adapters/raydium/raydium-decoder.mjs";
import {
  deriveRaydiumCpmmPoolAddress,
  deriveRaydiumLaunchLabPoolAddress,
  fetchRaydiumMintHistory,
} from "../src/adapters/raydium/raydium-history-collector.mjs";
import { decodeBase58 } from "../src/adapters/pump/borsh.mjs";

const MINT="BzPyyYCTmQNq2BcfQ4ANAvCYk54rnmQEXMFvFT8RhWMi";
const WSOL="So11111111111111111111111111111111111111112";
const AMM_CONFIG="9UQpPzgjju8DhHGcdnGDuXck4VGnHzGhRxT2NmEr6aS8";
const LAUNCH_POOL="CUUso33BfcnWkVuWhZnMdWWJVj2SyVhJb7TMJnNg634e";
const CPMM_POOL="9pqo6WVjKvYNnRgvPVaoTe1zZvnhtB248ChKnUmKfHH4";
const LAUNCH_BASE_VAULT="Stake11111111111111111111111111111111111111";
const LAUNCH_QUOTE_VAULT="Config1111111111111111111111111111111111111";
const CPMM_BASE_VAULT="2VBQvti8ACZnCa8kPhj1QLmyU5ohxeuCa4T9DS5LJkuP";
const CPMM_QUOTE_VAULT="6yxjrn9RLSEsZev6CaP4YACyw3TdRZeMTNEygm4UnDVy";
const LP_MINT="SysvarRent111111111111111111111111111111111";
const USER="Vote111111111111111111111111111111111111111";
const ZERO="11111111111111111111111111111111";
const TOKEN_PROGRAM="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const CREATE_SIG="launch-create";
const TRADE_SIG="launch-trade";
const MIGRATE_SIG="launch-migrate";
const SWAP_SIG="cpmm-swap";

function u8(v){const b=Buffer.alloc(1);b.writeUInt8(v);return b;}
function u16(v){const b=Buffer.alloc(2);b.writeUInt16LE(v);return b;}
function u64(v){const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(v));return b;}
function u32(v){const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;}
function str(v){const b=Buffer.from(v);return Buffer.concat([u32(b.length),b]);}
function pubkey(v){const b=decodeBase58(v);assert.equal(b.length,32);return b;}
function b64(b){return b.toString("base64");}
function b58(bytes){
  const alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n=BigInt("0x"+bytes.toString("hex")),out="";
  while(n>0n){const r=Number(n%58n);out=alphabet[r]+out;n/=58n;}
  let zeros=0;while(zeros<bytes.length&&bytes[zeros]===0)zeros++;
  return "1".repeat(zeros)+(out||"");
}
function disc(items,name){return Buffer.from(items.find(x=>x.name===name).discriminator);}

function mintInfo(decimals){
  const b=Buffer.alloc(82);
  b.writeBigUInt64LE(1_000_000_000_000_000n,36);
  b.writeUInt8(decimals,44);
  b.writeUInt8(1,45);
  return {context:{slot:110},value:{owner:TOKEN_PROGRAM,data:[b64(b),"base64"]}};
}
function tokenInfo(mint,amount,authority=USER){
  const b=Buffer.alloc(165);
  pubkey(mint).copy(b,0);
  pubkey(authority).copy(b,32);
  b.writeBigUInt64LE(BigInt(amount),64);
  b.writeUInt8(1,108);
  return {context:{slot:110},value:{owner:TOKEN_PROGRAM,data:[b64(b),"base64"]}};
}
function launchLabPoolInfo(){
  const account=launchpadIdl.accounts.find(x=>x.name==="PoolState");
  const b=Buffer.concat([
    Buffer.from(account.discriminator),
    u64(1),u8(1),u8(2),u8(6),u8(9),u8(1),
    u64(1_000_000_000_000_000),u64(793_100_000_000_000),
    u64(1_073_000_000_000_000),u64(30_000_000_000),
    u64(699_000_000_000_000),u64(86_000_000_000),
    u64(85_000_000_000),u64(1_000_000),u64(2_000_000),
    u64(1_000_000),
    u64(1_000_000),u64(0),u64(0),u64(0),u64(0),
    pubkey(ZERO),pubkey(ZERO),pubkey(MINT),pubkey(WSOL),
    pubkey(LAUNCH_BASE_VAULT),pubkey(LAUNCH_QUOTE_VAULT),pubkey(USER),
    u8(0),u8(0),u64(0),Buffer.alloc(54),
  ]);
  return {context:{slot:110},value:{owner:RAYDIUM_LAUNCHLAB_PROGRAM_ID,data:[b64(b),"base64"]}};
}
function cpmmPoolInfo(){
  const account=cpmmIdl.accounts.find(x=>x.name==="PoolState");
  const b=Buffer.concat([
    Buffer.from(account.discriminator),
    pubkey(AMM_CONFIG),pubkey(USER),
    pubkey(CPMM_QUOTE_VAULT),pubkey(CPMM_BASE_VAULT),pubkey(LP_MINT),
    pubkey(WSOL),pubkey(MINT),pubkey(TOKEN_PROGRAM),pubkey(TOKEN_PROGRAM),pubkey(ZERO),
    u8(253),u8(0),u8(9),u8(9),u8(6),
    u64(1_000_000),u64(0),u64(0),u64(0),u64(0),u64(0),u64(1),
    u8(0),u8(1),Buffer.alloc(6),u64(0),u64(0),
    ...Array.from({length:28},()=>u64(0)),
  ]);
  return {context:{slot:110},value:{owner:RAYDIUM_CPMM_PROGRAM_ID,data:[b64(b),"base64"]}};
}
function launchPoolCreateEvent(){
  return Buffer.concat([
    disc(launchpadIdl.events,"PoolCreateEvent"),
    pubkey(LAUNCH_POOL),pubkey(USER),pubkey(ZERO),
    u8(6),str("Moon Cat"),str("MCAT"),str("https://example.invalid/mcat"),
    u8(0),u64(1_000_000_000),u64(793_100_000),u64(85_000_000),u8(1),
    u64(0),u64(0),u64(0),u8(0),
  ]);
}
function launchTradeEvent(){
  return Buffer.concat([
    disc(launchpadIdl.events,"TradeEvent"),
    pubkey(LAUNCH_POOL),
    u64(793_100_000_000_000),u64(1_073_000_000_000_000),u64(30_000_000_000),
    u64(1_000),u64(100),u64(900),u64(110),
    u64(10),u64(100),u64(1),u64(1),u64(0),u64(0),
    u8(0),u8(0),u8(1),
  ]);
}
function cpmmSwapEvent(){
  return Buffer.concat([
    disc(cpmmIdl.events,"SwapEvent"),
    pubkey(CPMM_POOL),
    u64(110),u64(900),u64(5),u64(50),u64(0),u64(0),
    u8(1),pubkey(WSOL),pubkey(MINT),u64(1),u64(0),u8(0),
  ]);
}
function eventTx(signature,slot,blockTime,programId,poolAddress,eventBytes,balances,tradeInstruction){
  const idl=programId===RAYDIUM_LAUNCHLAB_PROGRAM_ID?launchpadIdl:cpmmIdl;
  const ixDef=idl.instructions.find(x=>x.name===tradeInstruction.name);
  const keys=[...new Set([
    programId,poolAddress,
    ...Object.values(tradeInstruction.accounts),
    ...balances.map(x=>x.address),
  ])];
  const pre=balances.filter(x=>x.pre!==null).map(x=>({
    accountIndex:keys.indexOf(x.address),mint:x.mint,owner:USER,
    uiTokenAmount:{amount:String(x.pre),decimals:x.mint===MINT?6:9,uiAmount:null},
  }));
  const post=balances.filter(x=>x.post!==null).map(x=>({
    accountIndex:keys.indexOf(x.address),mint:x.mint,owner:USER,
    uiTokenAmount:{amount:String(x.post),decimals:x.mint===MINT?6:9,uiAmount:null},
  }));
  const instructionData=Buffer.concat([disc(idl.instructions,tradeInstruction.name),...tradeInstruction.args]);
  return {
    slot,blockTime,
    transaction:{signatures:[signature],message:{accountKeys:keys,instructions:[{
      programIdIndex:keys.indexOf(programId),
      accounts:ixDef.accounts.map(a=>keys.indexOf(tradeInstruction.accounts[a.name]??ZERO)),
      data:b58(instructionData),
    }]}},
    meta:{
      err:null,fee:5000,
      preBalances:Array(keys.length).fill(0),postBalances:Array(keys.length).fill(0),
      preTokenBalances:pre,postTokenBalances:post,
      innerInstructions:[{index:0,instructions:[{
        programIdIndex:keys.indexOf(programId),
        accounts:[keys.indexOf(poolAddress)],
        data:b58(Buffer.concat([Buffer.from("e445a52e51cb9a1d","hex"),eventBytes])),
      }]}],
      loadedAddresses:{writable:[],readonly:[]},
      logMessages:[],
    },
  };
}
function createOrMigrationTx(signature,slot,blockTime,instruction=null,balances=[],innerInstructions=[]){
  const keys=[RAYDIUM_LAUNCHLAB_PROGRAM_ID,LAUNCH_POOL,USER,MINT,WSOL,
    ...balances.map(x=>x.address)];
  const pre=balances.filter(x=>x.pre!==null).map(x=>({
    accountIndex:keys.indexOf(x.address),mint:x.mint,owner:USER,
    uiTokenAmount:{amount:String(x.pre),decimals:x.mint===MINT?6:9,uiAmount:null},
  }));
  const post=balances.filter(x=>x.post!==null).map(x=>({
    accountIndex:keys.indexOf(x.address),mint:x.mint,owner:USER,
    uiTokenAmount:{amount:String(x.post),decimals:x.mint===MINT?6:9,uiAmount:null},
  }));
  const compiled=[];
  if(instruction){
    const ixDef=launchpadIdl.instructions.find(x=>x.name==="migrate_to_cpswap");
    const ixKeys=ixDef.accounts.map(x=>instruction[x.name] ?? ZERO);
    const accountKeys=[RAYDIUM_LAUNCHLAB_PROGRAM_ID,...ixKeys];
    return {
      slot,blockTime,
      transaction:{signatures:[signature],message:{
        accountKeys,
        instructions:[{
          programIdIndex:0,
          accounts:ixKeys.map((_,i)=>i+1),
          data:b58(Buffer.from(ixDef.discriminator)),
        }],
      }},
      meta:{
        err:null,fee:5000,
        preBalances:Array(accountKeys.length).fill(0),postBalances:Array(accountKeys.length).fill(0),
        preTokenBalances:pre.map(x=>({...x,accountIndex:accountKeys.indexOf(keys[x.accountIndex])})),
        postTokenBalances:post.map(x=>({...x,accountIndex:accountKeys.indexOf(keys[x.accountIndex])})),
        innerInstructions:innerInstructions.length?[{index:0,instructions:innerInstructions.map(item=>({
          programIdIndex:accountKeys.indexOf(item.programId),
          accounts:item.accounts??[],
          data:b58(item.data),
        }))}]:[],
        loadedAddresses:{writable:[],readonly:[]},logMessages:[],
      },
    };
  }
  return {
    slot,blockTime,
    transaction:{signatures:[signature],message:{accountKeys:keys,instructions:compiled}},
    meta:{
      err:null,fee:5000,
      preBalances:Array(keys.length).fill(0),postBalances:Array(keys.length).fill(0),
      preTokenBalances:pre,postTokenBalances:post,
      innerInstructions:innerInstructions.length?[{index:0,instructions:innerInstructions.map(item=>({
        programIdIndex:keys.indexOf(item.programId),
        accounts:item.accounts??[],
        data:b58(item.data),
      }))}]:[],
      loadedAddresses:{writable:[],readonly:[]},logMessages:[],
    },
  };
}

test("Raydium LaunchLab and CPMM PDAs match the supplied MCAT token's observed market addresses",()=>{
  assert.equal(deriveRaydiumLaunchLabPoolAddress({mint:MINT,quoteMint:WSOL}).address,LAUNCH_POOL);
  assert.equal(deriveRaydiumCpmmPoolAddress({ammConfig:AMM_CONFIG,tokenA:MINT,tokenB:WSOL}).address,CPMM_POOL);
});

test("collector follows a LaunchLab pool through CPMM migration, swaps, and vault-delta reconciliation",async()=>{
  const launchCreate=createOrMigrationTx(CREATE_SIG,98,1_795_371_300,null,[
    {address:LAUNCH_BASE_VAULT,mint:MINT,pre:null,post:1000},
    {address:LAUNCH_QUOTE_VAULT,mint:WSOL,pre:null,post:100},
  ],[{
    programId:RAYDIUM_LAUNCHLAB_PROGRAM_ID,
    accounts:[1],
    data:Buffer.concat([Buffer.from("e445a52e51cb9a1d","hex"),launchPoolCreateEvent()]),
  }]);
  const launchTrade=eventTx(TRADE_SIG,99,1_795_371_301,RAYDIUM_LAUNCHLAB_PROGRAM_ID,LAUNCH_POOL,launchTradeEvent(),[
    {address:LAUNCH_BASE_VAULT,mint:MINT,pre:1000,post:900},
    {address:LAUNCH_QUOTE_VAULT,mint:WSOL,pre:100,post:110},
  ],{
    name:"buy_exact_in",
    accounts:{
      payer:USER,authority:ZERO,global_config:ZERO,platform_config:ZERO,pool_state:LAUNCH_POOL,
      user_base_token:USER,user_quote_token:USER,base_vault:LAUNCH_BASE_VAULT,quote_vault:LAUNCH_QUOTE_VAULT,
      base_token_mint:MINT,quote_token_mint:WSOL,base_token_program:TOKEN_PROGRAM,
      quote_token_program:TOKEN_PROGRAM,event_authority:ZERO,program:RAYDIUM_LAUNCHLAB_PROGRAM_ID,
    },
    args:[u64(10),u64(100),u64(0)],
  });
  const migration=createOrMigrationTx(MIGRATE_SIG,100,1_795_371_302,{
    payer:USER,base_mint:MINT,quote_mint:WSOL,platform_config:ZERO,
    cpswap_program:RAYDIUM_CPMM_PROGRAM_ID,cpswap_pool:CPMM_POOL,
    cpswap_authority:ZERO,cpswap_lp_mint:LP_MINT,cpswap_base_vault:CPMM_BASE_VAULT,
    cpswap_quote_vault:CPMM_QUOTE_VAULT,cpswap_config:AMM_CONFIG,
    cpswap_create_pool_fee:ZERO,cpswap_observation:ZERO,lock_program:ZERO,
    lock_authority:ZERO,lock_lp_vault:ZERO,authority:ZERO,pool_state:LAUNCH_POOL,
    global_config:ZERO,base_vault:LAUNCH_BASE_VAULT,quote_vault:LAUNCH_QUOTE_VAULT,
    pool_lp_token:ZERO,base_token_program:TOKEN_PROGRAM,quote_token_program:TOKEN_PROGRAM,
    associated_token_program:ZERO,system_program:ZERO,rent_program:ZERO,metadata_program:ZERO,
  },[
    {address:LAUNCH_BASE_VAULT,mint:MINT,pre:900,post:0},
    {address:LAUNCH_QUOTE_VAULT,mint:WSOL,pre:110,post:0},
    {address:CPMM_BASE_VAULT,mint:MINT,pre:null,post:900},
    {address:CPMM_QUOTE_VAULT,mint:WSOL,pre:null,post:110},
  ],[{
    programId:RAYDIUM_CPMM_PROGRAM_ID,
    accounts:[],
    data:Buffer.concat([
      disc(cpmmIdl.instructions,"initialize"),
      u64(110),u64(900),u64(0),
    ]),
  }]);
  const cpmmSwap=eventTx(SWAP_SIG,101,1_795_371_303,RAYDIUM_CPMM_PROGRAM_ID,CPMM_POOL,cpmmSwapEvent(),[
    {address:CPMM_BASE_VAULT,mint:MINT,pre:900,post:850},
    {address:CPMM_QUOTE_VAULT,mint:WSOL,pre:110,post:115},
  ],{
    name:"swap_base_input",
    accounts:{
      payer:USER,authority:ZERO,amm_config:AMM_CONFIG,pool_state:CPMM_POOL,
      input_token_account:USER,output_token_account:USER,input_vault:CPMM_QUOTE_VAULT,
      output_vault:CPMM_BASE_VAULT,input_token_program:TOKEN_PROGRAM,output_token_program:TOKEN_PROGRAM,
      input_token_mint:WSOL,output_token_mint:MINT,observation_state:ZERO,
    },
    args:[u64(5),u64(50)],
  });
  const transactions=new Map([
    [CREATE_SIG,launchCreate],[TRADE_SIG,launchTrade],[MIGRATE_SIG,migration],[SWAP_SIG,cpmmSwap],
  ]);
  const signatures=new Map([
    [LAUNCH_POOL,[
      {signature:MIGRATE_SIG,slot:100,err:null},
      {signature:TRADE_SIG,slot:99,err:null},
      {signature:CREATE_SIG,slot:98,err:null},
    ]],
    [CPMM_POOL,[
      {signature:SWAP_SIG,slot:101,err:null},
      {signature:MIGRATE_SIG,slot:100,err:null},
    ]],
  ]);
  const rpc={
    async getAccountInfo(address){
      if(address===MINT)return mintInfo(6);
      if(address===WSOL)return mintInfo(9);
      if(address===deriveRaydiumLaunchLabPoolAddress({mint:MINT,quoteMint:WSOL}).address)return launchLabPoolInfo();
      if(address===CPMM_POOL)return cpmmPoolInfo();
      if(address===LAUNCH_BASE_VAULT)return tokenInfo(MINT,0);
      if(address===LAUNCH_QUOTE_VAULT)return tokenInfo(WSOL,0);
      if(address===CPMM_BASE_VAULT)return tokenInfo(MINT,850);
      if(address===CPMM_QUOTE_VAULT)return tokenInfo(WSOL,115);
      throw new Error("unexpected account "+address);
    },
    async getSignaturesForAddress(address,{limit=1000}={}){
      const page=signatures.get(address)??[];
      return page.slice(0,limit);
    },
    async getTransaction(signature){return transactions.get(signature)??null;},
    async getBlock(){throw new Error("block lookup should not be needed for unique slots");},
  };
  const result=await fetchRaydiumMintHistory({rpc,mint:MINT,quoteMint:WSOL,maxSignatures:10});
  assert.equal(result.status,"REPLAYED_FULL_LAUNCHLAB_TO_CPMM_HISTORY");
  assert.equal(result.launchlab.pool_address,LAUNCH_POOL);
  assert.equal(result.cpmm.pool_address,CPMM_POOL);
  assert.equal(result.normalized_events.length,2);
  assert.equal(result.normalized_events[0].event_kind,"CURVE_BUY_EXECUTED");
  assert.equal(result.normalized_events[0].payload.actor_address,USER);
  assert.equal(result.normalized_events[0].payload.actor_role,"payer");
  assert.equal(result.normalized_events[1].event_kind,"POOL_BUY_EXECUTED");
  assert.equal(result.normalized_events[1].payload.actor_address,USER);
  assert.equal(result.normalized_events[1].payload.actor_role,"payer");
  assert.equal(result.raw_candles_1m.length,2);
  assert.equal(result.launchlab.vault_delta_replay.status,"PASS");
  assert.equal(result.cpmm.vault_delta_replay.status,"PASS");
  assert.equal(result.coverage_complete,true);
  assert.equal(result.source_provenance.status,"UNVERIFIED");
  await assert.rejects(()=>fetchRaydiumMintHistory({rpc:{...rpc,getGenesisHash:async()=>"wrong"},mint:MINT,quoteMint:WSOL,expectedGenesisHash:"expected"}),/PINNED_GENESIS_MISMATCH/);
  assert.equal(result.vault_reconciliation_pass,true);
});
