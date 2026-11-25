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

test("candle event quantity must agree with the corresponding project journal",()=>{
 const i=withEvidence();i.market.candleEvidence.events[0].payload.token_amount_base_units="99";
 const s=buildTerminalState(i);
 assert.equal(s.status,"REVIEW_REQUIRED");
 assert.ok(s.issues.includes("PROJECT_TRADE_QUANTITY_MISMATCH:b"));
 assert.equal(s.treasury.realized_project_pnl_base_units,null);
 assert.equal(s.settlement_allowed,false);
});

test("contradictory candle evidence cannot coexist with a ready unified report",async()=>{
 const {buildUnifiedHistoricalReport}=await import("../src/inner-market/unified-historical-report.mjs");
 const i=withEvidence();i.market.candleEvidence.events[0].quality.validation_status="warning";
 const r=buildUnifiedHistoricalReport(i);
 assert.equal(r.status,"REVIEW_REQUIRED");
 assert.equal(r.trust.grade,"D2");
 assert.ok(r.issues.includes("CANDLE_EVIDENCE_CONTRADICTION"));
 assert.equal(r.terminal_state.risk.status,"REVIEW_REQUIRED");
 assert.ok(Object.values(r.accounting).every(v=>v===null));
 assert.equal(r.settlement_allowed,false);
});

test("different curve accounts cannot be mixed into one report candle series",()=>{
 const i=withEvidence();i.market.candleEvidence.events[1].market={...i.market.candleEvidence.events[1].market,curve_account:"other-curve"};
 const r=buildTerminalCandles(i);assert.equal(r.reason,"CURVE_IDENTITY_MISMATCH");assert.deepEqual(r.candles,[]);
 assert.equal(buildTerminalState(i).status,"REVIEW_REQUIRED");
});
test("synthetic candle evidence cannot mix generator versions or seeds",()=>{
 for(const [field,value] of [["random_seed",1],["generator_version","other.1"]]){
  const i=withEvidence();i.market.candleEvidence.events[1].synthetic_metadata[field]=value;
  assert.equal(buildTerminalCandles(i).reason,"MIXED_SCENARIOS");
 }
});
test("historical SOL report rejects a non-SOL candle quote mint",()=>{
 const i=withEvidence();i.sourceMode="ARCHIVED_HISTORICAL";i.market.candleEvidence.market.network="local_sim";
 assert.equal(buildTerminalCandles(i).reason,"QUOTE_ASSET_MISMATCH");
});

test("closed market quality calls the canonical analyzer only after event parity",async()=>{
 const {describeClosedMarketQuality}=await import("../src/inner-market/closed-market-quality.mjs");
 const i=withEvidence(),before=structuredClone(i),v=describeClosedMarketQuality(i);
 assert.equal(v.status,"DESCRIPTIVE_ONLY");assert.equal(v.event_count,2);assert.equal(v.execution_enabled,false);assert.deepEqual(i,before);
 assert.equal(describeClosedMarketQuality(fixture()).status,"UNKNOWN");
 i.market.candleEvidence.events[0].payload.quote_amount_base_units="199";
 const bad=describeClosedMarketQuality(i);assert.equal(bad.status,"REVIEW_REQUIRED");assert.equal(bad.event_count,null);
});
