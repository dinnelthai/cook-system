import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildTerminalCandles} from "../src/inner-market/terminal-candles.mjs";
import {buildTerminalState,advanceReview} from "../src/inner-market/terminal-state.mjs";
const fixture=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
function withEvidence(){
 const input=fixture();
 const market={chain_id:"solana",network:"synthetic",token_mint:input.scope.tokenMint,quote_mint:"synthetic-quote",curve_program_id:"synthetic-curve",market_phase:"bonding_curve"};
 input.market.candleEvidence={
  schema_version:"terminal-candle-evidence.1",scope:input.scope,market,complete:true,startTimeMs:0,endTimeMs:180000,
  events:input.market.trades.map((t,i)=>({schema_version:"1.0.0",event_id:t.id,provenance:"synthetic",event_kind:t.side==="BUY"?"CURVE_BUY_EXECUTED":"CURVE_SELL_EXECUTED",market,event_time_ms:60000+i*60000,ordering:{event_sequence:i,ordering_confidence:"synthetic"},source:{source_type:"simulator",source_id:"fixture"},payload:{signature:"synthetic-"+i,actor_address:"synthetic-wallet",token_amount_base_units:i?"50":"100",quote_amount_base_units:t.quoteNotionalBaseUnits,quote_mint:market.quote_mint,execution_price_decimal:i?"1.8":"2",fee_components:[]},quality:{is_complete:true,validation_status:"valid"},synthetic_metadata:{scenario_id:"candle-test",random_seed:0,generator_version:"test.1"}}))
 };
 return input;
}
test("no candle evidence is explicitly unavailable, not fabricated",()=>{
 assert.equal(buildTerminalCandles(fixture()).status,"UNAVAILABLE");
 assert.equal(buildTerminalState(fixture()).settlement_allowed,true);
});
test("confirmed synthetic evidence is matched per event and aggregated",()=>{
 const i=withEvidence(),r=buildTerminalCandles(i);
 assert.equal(r.status,"CONSISTENT");assert.equal(r.external_attestation,"UNKNOWN");
 assert.equal(r.candles.length,2);assert.equal(r.candles[0].quote_volume_base_units,"200");
 assert.equal(r.candles[1].sell_quote_volume_base_units,"90");
 const merged=buildTerminalCandles(i,300000).candles[0];
 assert.equal(merged.open_price,"2");assert.equal(merged.close_price,"1.8");
 assert.equal(merged.high_price,"2");assert.equal(merged.low_price,"1.8");assert.equal(merged.quote_volume_base_units,"290");
 assert.equal(merged.execution_count,2);assert.equal(buildTerminalState(i).settlement_allowed,true);
});
test("inconsistent evidence is suppressed and prevents settlement",()=>{
 for(const mutate of [
  i=>i.market.candleEvidence.events.pop(),
  i=>i.market.candleEvidence.events[0].payload.quote_amount_base_units="199",
  i=>i.market.candleEvidence.events[0].quality.validation_status="warning",
  i=>i.market.candleEvidence.events[0].provenance="observed_chain",
  i=>i.market.candleEvidence.events[1].synthetic_metadata.scenario_id="other",
  i=>i.market.candleEvidence.events[0].event_time_ms=180000,
  i=>i.market.candleEvidence.events[0].payload.execution_price_decimal="0",
  i=>i.market.candleEvidence.events[1].event_id=i.market.candleEvidence.events[0].event_id
 ]){
  const i=withEvidence();mutate(i);const r=buildTerminalCandles(i);
  assert.equal(r.status,"REVIEW");assert.deepEqual(r.candles,[]);
  const s=buildTerminalState(i);assert.equal(s.settlement_allowed,false);assert.throws(()=>advanceReview("REVIEW","settle",s));
 }
});
test("unsupported interval cannot silently change calculation",()=>assert.throws(()=>buildTerminalCandles(withEvidence(),123)));
