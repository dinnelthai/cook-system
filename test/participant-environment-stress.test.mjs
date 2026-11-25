import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runParticipantEnvironmentSuite} from "../src/simulation/participant-environment-stress.mjs";
const fixture=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
test("environment stress covers accounting, missing depth evidence, staleness, outage and recovery",()=>{
 const base=fixture(),before=structuredClone(base),args={base,seeds:[701,702],steps:120};
 const r=runParticipantEnvironmentSuite(args);
 assert.equal(r.case_count,13);assert.equal(r.passed_count,13);assert.equal(r.status,"SYNTHETIC_REGRESSION_PASS");
 assert.equal(r.real_market_validated,false);assert.equal(r.execution_enabled,false);
 assert.deepEqual(r,runParticipantEnvironmentSuite(args));assert.deepEqual(base,before);
});
test("non-synthetic, duplicate seeds and contradictory baseline are rejected",()=>{
 const base=fixture();
 assert.throws(()=>runParticipantEnvironmentSuite({base:{...base,sourceMode:"ARCHIVED_HISTORICAL"}}),/INVALID_ENVIRONMENT_SUITE_CONFIG/);
 assert.throws(()=>runParticipantEnvironmentSuite({base,seeds:[1,1]}),/INVALID_ENVIRONMENT_SUITE_CONFIG/);
 base.market.historyComplete=false;assert.throws(()=>runParticipantEnvironmentSuite({base}),/INVALID_ENVIRONMENT_ACCOUNTING_FIXTURE/);
});
