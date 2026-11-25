import test from "node:test";
import assert from "node:assert/strict";
import {buildRawCandles} from "../src/core/candle-builder.mjs";
const market={chain_id:"solana",network:"synthetic",token_mint:"mint",quote_mint:"SOL",curve_program_id:"program",market_phase:"post_graduation"};
const event=(i,pool,price,quote)=>({event_id:"e"+i,event_kind:"POOL_BUY_EXECUTED",market,provenance:"synthetic",event_time_ms:i,ordering:{ordering_confidence:"synthetic",event_sequence:i},synthetic_metadata:{scenario_id:"fixture"},payload:{pool_address:pool,execution_price_decimal:price,quote_amount_base_units:quote,token_amount_base_units:"1"}});
test("historical candles keep separate pools for the same mint and interval",()=>{
 const rows=buildRawCandles([event(1,"pool-a","1","10"),event(2,"pool-b","9","90"),event(3,"pool-a","2","20")],60000);
 assert.equal(rows.length,2);assert.equal(rows[0].pool_address,"pool-a");assert.equal(rows[0].quote_volume_base_units,"30");assert.equal(rows[0].open_price,"1");assert.equal(rows[0].close_price,"2");assert.equal(rows[1].pool_address,"pool-b");assert.equal(rows[1].quote_volume_base_units,"90");
});
test("unknown pool history is not merged into an identified pool",()=>{
 const rows=buildRawCandles([event(1,undefined,"1","10"),event(2,"pool-a","9","90")],60000);
 assert.equal(rows.length,2);assert.equal(rows[0].pool_address,undefined);assert.equal(rows[1].pool_address,"pool-a");
});
test("distinct curve accounts have separate historical candles",()=>{
 const a=event(1,null,"1","10"),b=event(2,null,"9","90");
 for(const [e,id] of [[a,"curve-a"],[b,"curve-b"]]){e.event_kind="CURVE_BUY_EXECUTED";e.market={...market,market_phase:"bonding_curve",curve_account:id};}
 const rows=buildRawCandles([a,b],60000);assert.equal(rows.length,2);assert.equal(rows[0].market.curve_account,"curve-a");assert.equal(rows[1].market.curve_account,"curve-b");
});

test("observed events cannot be combined across genesis identities or with unpinned history",()=>{
 const observed=(i,genesis)=>({...event(i,"pool-a","1","10"),provenance:"observed_chain",synthetic_metadata:undefined,market:{...market,network:"local_sim",...(genesis?{genesis_hash:genesis}:{})},ordering:{ordering_confidence:"complete",slot:i,transaction_index:0,instruction_index:0,event_sequence:0}});
 assert.equal(buildRawCandles([observed(1,"genesis-a"),observed(2,"genesis-a")],60000).length,1);
 assert.throws(()=>buildRawCandles([observed(1,"genesis-a"),observed(2,"genesis-b")],60000),/MIXED_CANDLE_NETWORK_INSTANCE/);
 assert.throws(()=>buildRawCandles([observed(1,"genesis-a"),observed(2,null)],60000),/MIXED_CANDLE_NETWORK_INSTANCE/);
});
