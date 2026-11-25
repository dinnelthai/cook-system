import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,writeFile,symlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {evaluateQuotePlan,createEmergencyHaltController,createFileHaltStorage} from "../src/risk/quote-risk-gate.mjs";
const input=()=>({riskState:{halted:false},market:{market_id:"paper-market",mid_price_decimal:"1.25",observed_at_ms:1000,data_completeness:"synthetic",source_status:"SYNTHETIC_ONLY",volatility_bps:100},
 portfolio:{inventory_value_quote_base_units:"100",max_inventory_value_quote_base_units:"1000",quote_balance_base_units:"500",base_inventory_base_units:"1000",current_drawdown_bps:50},
 policy:{max_market_age_ms:5000,base_spread_bps:100,min_spread_bps:50,max_spread_bps:500,max_inventory_skew_bps:200,max_order_notional_base_units:"250",max_base_order_base_units:"500",max_drawdown_bps:500}});
test("paper quote plan is bounded, inventory-aware and never executable",()=>{
 const r=evaluateQuotePlan({...input(),nowMs:2000});assert.equal(r.status,"PAPER_PLAN_READY");
 assert.ok(Number(r.quote.bid_price_decimal)<Number(r.quote.ask_price_decimal));assert.equal(r.quote.buy.notional_base_units,"250");
 assert.equal(r.execution_enabled,false);assert.equal(r.transaction_submission_enabled,false);
});
test("stale data, halt and drawdown limits fail closed",()=>{
 const stale=input();stale.market.observed_at_ms=0;assert.equal(evaluateQuotePlan({...stale,nowMs:10000}).status,"BLOCKED");
 const halted=input();assert.equal(evaluateQuotePlan({...halted,nowMs:2000,riskState:{halted:true}}).status,"BLOCKED");
 const drawdown=input();drawdown.portfolio.current_drawdown_bps=900;assert.equal(evaluateQuotePlan({...drawdown,nowMs:2000}).status,"BLOCKED");
});
test("emergency halt controller defaults closed and requires explicit resume approval",async()=>{
 let stored=null;const c=createEmergencyHaltController({readState:async()=>stored,writeState:async s=>{stored=s;}});
 assert.equal((await c.load()).halted,true);await c.halt({reason:"operator test",atMs:10});assert.equal((await c.load()).halted,true);
 await assert.rejects(()=>c.resume({operatorConfirmed:false,reason:"resume",atMs:20}),/EXPLICIT_OPERATOR_CONFIRMATION_REQUIRED/);
 await c.resume({operatorConfirmed:true,reason:"operator verified",atMs:20});assert.equal((await c.load()).halted,false);
});
test("file-backed emergency halt persists and fails closed after corrupt state",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-halt-")),path=join(dir,"risk","halt.json");
 try{const store=createFileHaltStorage(path),c=createEmergencyHaltController(store);assert.equal((await c.load()).halted,true);
  await c.halt({reason:"test stop",atMs:10});assert.equal((await c.load()).halted,true);
  await c.resume({operatorConfirmed:true,reason:"manual review",atMs:20});assert.equal((await c.load()).halted,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test("missing or malformed paper halt state cannot authorize a paper plan",()=>{
 const i=input();delete i.riskState;
 for(const riskState of [undefined,null,{}, {halted:"false"}]){
  const r=evaluateQuotePlan({...i,riskState,nowMs:2000});assert.equal(r.status,"BLOCKED");assert.ok(r.reasons.includes("HALT_STATE_UNKNOWN"));
 }
});
test("invalid persisted halt timestamps default to halted",async()=>{
 const c=createEmergencyHaltController({readState:async()=>({schema_version:"cook-emergency-halt.1",halted:false,reason:"test",operator_confirmed:true,at_ms:-1}),writeState:async()=>{}});
 assert.equal((await c.load()).halted,true);
});

test("missing, malformed or extreme volatility cannot silently produce a quote",()=>{
 for(const volatility_bps of [undefined,null,-1,10001,1.5]){
  const i=input();if(volatility_bps===undefined)delete i.market.volatility_bps;else i.market.volatility_bps=volatility_bps;
  const r=evaluateQuotePlan({...i,nowMs:2000});assert.equal(r.status,"BLOCKED");assert.ok(r.reasons.includes("MARKET_VOLATILITY_INVALID"));
  assert.equal(r.quote.buy.enabled,false);assert.equal(r.quote.sell.enabled,false);
 }
});
test("inventory skew and drawdown policies cannot produce zero or nonsensical reservation prices",()=>{
 const i=input();i.policy.max_inventory_skew_bps=10000;
 assert.throws(()=>evaluateQuotePlan({...i,nowMs:2000}),/INVALID_SPREAD_POLICY/);
 const j=input();j.policy.max_drawdown_bps=10001;
 assert.throws(()=>evaluateQuotePlan({...j,nowMs:2000}),/INVALID_SPREAD_POLICY/);
});
test("unbounded numeric strings are rejected before BigInt parsing",()=>{
 const i=input();i.portfolio.quote_balance_base_units="9".repeat(10000);
 assert.throws(()=>evaluateQuotePlan({...i,nowMs:2000}),/invalid quote balance/);
 const j=input();j.market.mid_price_decimal="9".repeat(10000);
 assert.throws(()=>evaluateQuotePlan({...j,nowMs:2000}),/invalid price/);
});

test("file-backed halt treats a symbolic-link state file as unavailable and stays halted",{skip:process.platform==="win32"},async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-halt-link-")),path=join(dir,"risk","halt.json"),target=join(dir,"outside.json");
 try{await (await import("node:fs/promises")).mkdir(join(dir,"risk"));await writeFile(target,JSON.stringify({schema_version:"cook-emergency-halt.1",halted:false,reason:"operator",at_ms:1,operator_confirmed:true}));await symlink(target,path);
  const c=createEmergencyHaltController(createFileHaltStorage(path));const state=await c.load();assert.equal(state.halted,true);assert.equal(state.reason,"HALT_STATE_UNAVAILABLE");
 }finally{await rm(dir,{recursive:true,force:true});}
});
