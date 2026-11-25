import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runPoolEvidenceStress,runOfflineRiskLaboratory} from "../src/simulation/offline-risk-laboratory.mjs";
const base=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
test("fixed reserve evidence faults use canonical reconciliation",()=>{
 const a=runPoolEvidenceStress();
 assert.equal(a.case_count,6);assert.equal(a.passed_count,6);assert.equal(a.status,"SYNTHETIC_REGRESSION_PASS");
 assert.equal(a.cases.find(c=>c.case_id==="SLOT_MISMATCH").actual_status,"UNKNOWN");
 assert.equal(a.cases.find(c=>c.case_id==="NEGATIVE_EFFECTIVE_RESERVE").actual_status,"FAIL");
 assert.equal(a.live_liquidity_assessed,false);assert.deepEqual(a,runPoolEvidenceStress());
});
test("offline lab runs canonical participant and pool groups, never predicts profit",()=>{
 const input=base(),before=structuredClone(input),v=runOfflineRiskLaboratory({base:input,seeds:[701],steps:120});
 assert.equal(v.status,"SYNTHETIC_REGRESSION_PASS");assert.equal(v.participant.groups.length,4);
 assert.equal(v.pools.passed_count,6);assert.equal(v.business.status,"SYNTHETIC_REGRESSION_PASS");assert.equal(v.business.stress.case_count,6);assert.equal(v.business.business.cases.length,13);assert.equal(v.real_market_validated,false);
 assert.equal(v.lp_position_valuation,null);assert.equal(v.operating_profit_forecast,null);assert.equal(v.execution_enabled,false);assert.deepEqual(input,before);
});
test("lab rejects non-synthetic inputs and oversized work",()=>{
 assert.throws(()=>runOfflineRiskLaboratory({base:{sourceMode:"ARCHIVED_HISTORICAL"}}),/OFFLINE_LAB_INPUT_LIMIT/);
 assert.throws(()=>runOfflineRiskLaboratory({base:base(),seeds:[1,2,3,4,5,6]}),/OFFLINE_LAB_INPUT_LIMIT/);
});

test("fixed business stress artifact is reproducible and retains distinct groups",async()=>{
 const {evaluateOfflineBusinessScenarios}=await import("../src/simulation/offline-business-scenarios.mjs");
 const input=base(),before=structuredClone(input),r=evaluateOfflineBusinessScenarios(input);
 assert.equal(r.status,"SYNTHETIC_REGRESSION_PASS");assert.equal(r.stress.case_count,6);assert.equal(r.stress.passed_count,6);
 assert.equal(r.business.cases.length,13);assert.ok(r.stress.cases.every(c=>c.checks.length===4&&c.passed));
 assert.equal(r.stress.cases.find(c=>c.case_id==="retail-coverage").actual_status,"REVIEW_REQUIRED");
 assert.equal(r.real_market_validated,false);assert.equal(r.settlement_allowed,false);assert.match(r.digest,/^[a-f0-9]{64}$/);
 assert.deepEqual(r,evaluateOfflineBusinessScenarios(input));assert.deepEqual(input,before);
 assert.throws(()=>evaluateOfflineBusinessScenarios({...input,sourceMode:"ARCHIVED_HISTORICAL"}),/SYNTHETIC_FIXTURE_REQUIRED/);
});
