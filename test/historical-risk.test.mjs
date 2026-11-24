import test from "node:test";
import assert from "node:assert/strict";
import {assessHistoricalRisk,assessObservationFreshness} from "../src/inner-market/historical-risk.mjs";
const checks=["accounting","market_coverage","valuation","candle_evidence","source_attestation","wallet_attribution"].map(id=>({id,status:"PASS"}));
const input=()=>({reportChecks:structuredClone(checks),sourceMode:"ARCHIVED_HISTORICAL"});
test("even all declared checks passing cannot establish current market safety",()=>{
 const r=assessHistoricalRisk(input());
 assert.equal(r.status,"EVIDENCE_INCOMPLETE");assert.equal(r.live_risk_assessed,false);assert.equal(r.execution_enabled,false);
 assert.ok(r.alerts.some(a=>a.code==="LIQUIDITY_RISK"&&a.severity==="UNKNOWN"));
});
test("missing checks and synthetic scope are explicitly unknown",()=>{
 const r=assessHistoricalRisk({reportChecks:[],sourceMode:"SYNTHETIC"});
 assert.equal(r.counts.critical,0);assert.ok(r.alerts.some(a=>a.code==="SYNTHETIC_ONLY"));
 assert.ok(r.alerts.some(a=>a.code==="FINANCIAL_AUDIT"&&a.severity==="UNKNOWN"));
});
test("financial review is critical and prioritized",()=>{
 const i=input();i.reportChecks[0].status="REVIEW";i.reportChecks[2].status="REVIEW";
 const r=assessHistoricalRisk(i);assert.equal(r.status,"REVIEW_REQUIRED");assert.equal(r.alerts[0].code,"FINANCIAL_AUDIT");assert.equal(r.counts.warning,1);
});
test("receipt and cash differences are not hidden by a declared consistent result",()=>{
 const r=assessHistoricalRisk({...input(),accountAudit:{schema_version:"cook-archived-account-audit.1",status:"INTERNALLY_CONSISTENT",native:{difference_lamports:"-1"},token:{difference_base_units:"0"}},cashAudit:{schema_version:"cook-archived-cash-crosscheck.1",status:"REVIEW_REQUIRED"}});
 assert.equal(r.status,"REVIEW_REQUIRED");assert.ok(r.alerts.some(a=>a.code==="NATIVE_BALANCE_DIFF"));assert.ok(r.alerts.some(a=>a.code==="CASH_POSTINGS"));
});
test("reject duplicate or unsupported audit states",()=>{
 assert.throws(()=>assessHistoricalRisk({...input(),reportChecks:[checks[0],checks[0]]}));
 assert.throws(()=>assessHistoricalRisk({...input(),reportChecks:[{id:"accounting",status:"SAFE"}]}));
});
test("freshness uses explicit observation time and rejects future or invalid times",()=>{
 const f=observedAtMs=>assessObservationFreshness({observedAtMs,nowMs:1000,maxAgeMs:100});
 assert.equal(f(null).status,"UNKNOWN");assert.equal(f(901).status,"FRESH");assert.equal(f(899).status,"STALE");assert.equal(f(1001).status,"REVIEW");
 assert.equal(f(900).age_ms,100);assert.throws(()=>assessObservationFreshness({nowMs:1000,maxAgeMs:0}));
});
