import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getParticipantCatalogue,getParticipantStressCases,buildParticipantStressInput,evaluateParticipantStressCases} from "../src/inner-market/participant-stress-lab.mjs";
import {buildHistoricalMvpReport} from "../src/inner-market/historical-mvp-report.mjs";
const fixture=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
test("catalogue contains distinct role definitions",()=>{
 const roles=getParticipantCatalogue();
 assert.deepEqual(roles.map(r=>r.id),["independent","retail","sniper","arbitrage","sandwich","early-holder"]);
 assert.equal(new Set(roles.map(r=>r.observable)).size,6);
});
test("fixed cases reproduce expected audit behavior",()=>{
 const r=evaluateParticipantStressCases({base:fixture(),reportBuilder:buildHistoricalMvpReport});
 assert.equal(r.length,6);
 assert.ok(r.every(x=>x.passed&&x.execution_enabled===false&&x.source_mode==="SYNTHETIC"));
 assert.equal(r.find(x=>x.case_id==="holder-impairment").observed_drawdown_bps,"2000");
});
test("reference uncertainty and execution uncertainty suppress final accounting",()=>{
 const base=fixture();
 for(const id of ["arbitrage-reference","sandwich-shortfall"]){
  const r=buildHistoricalMvpReport(buildParticipantStressInput(base,id));
  assert.equal(r.status,"REVIEW_REQUIRED");
  assert.equal(r.accounting.realized_project_pnl_base_units,null);
 }
});
test("scenario patches never mutate original market fixture",()=>{
 const base=fixture(),copy=structuredClone(base);
 for(const c of getParticipantStressCases())buildParticipantStressInput(base,c.id);
 assert.deepEqual(base,copy);
});
test("archived market data and arbitrary case IDs rejected",()=>{
 assert.throws(()=>buildParticipantStressInput({...fixture(),sourceMode:"ARCHIVED_HISTORICAL"},"baseline"),/synthetic/);
 assert.throws(()=>buildParticipantStressInput(fixture(),"custom"),/unknown/);
});
test("catalogue copy cannot mutate built-in case definitions",()=>{
 const cases=getParticipantStressCases();cases[0].expectedAuditStatus="INVALID";
 assert.equal(getParticipantStressCases()[0].expectedAuditStatus,"REPORT_READY");
});
