import test from "node:test";
import assert from "node:assert/strict";
import {auditRecordedSyntheticBatch} from "../src/simulation/synthetic-batch-audit.mjs";
import {runParticipantSimulation} from "../src/simulation/participant-simulator.mjs";
const report=id=>runParticipantSimulation({scenarioId:id,seed:7,steps:30});
test("batch reviews existing reports separately without claiming independent market paths",()=>{
 const input=[report("a"),report("b")],copy=structuredClone(input);
 const r=auditRecordedSyntheticBatch(input);
 assert.equal(r.status,"INTERNALLY_CONSISTENT");
 assert.equal(r.summary.consistent_count,2);assert.equal(r.independent_market_paths_attested,false);
 assert.deepEqual(input,copy);
});
test("invalid reports do not suppress neighboring reports",()=>{
 const bad=report("b");delete bad.opening_agent_states;
 const r=auditRecordedSyntheticBatch([report("a"),bad,report("c")]);
 assert.equal(r.status,"REVIEW_REQUIRED");assert.equal(r.summary.consistent_count,2);assert.equal(r.summary.rejected_count,1);
});
test("duplicate scenario identities reject both reports",()=>{
 const r=auditRecordedSyntheticBatch([report("a"),report("a"),report("b")]);
 assert.equal(r.summary.rejected_count,2);assert.equal(r.summary.consistent_count,1);
 assert.equal(r.results[0].reason,"DUPLICATE_SCENARIO_ID");
});
test("opposite endpoint discrepancies across scenarios never cancel",()=>{
 const a=report("a"),b=report("b");
 a.agent_states[0].quote_balance_base_units=(BigInt(a.agent_states[0].quote_balance_base_units)+1n).toString();
 b.agent_states[0].quote_balance_base_units=(BigInt(b.agent_states[0].quote_balance_base_units)-1n).toString();
 const r=auditRecordedSyntheticBatch([a,b]);
 assert.equal(r.summary.review_required_count,2);assert.equal(r.summary.consistent_count,0);
 assert.equal(r.results[0].audit.accounts.find(x=>x.account_id==="agent:issuer").quote_difference_base_units,"1");
 assert.equal(r.results[1].audit.accounts.find(x=>x.account_id==="agent:issuer").quote_difference_base_units,"-1");
});
test("empty and oversized batch inputs fail explicitly",()=>{
 assert.throws(()=>auditRecordedSyntheticBatch([]),/INVALID_REPORT_BATCH/);
 assert.throws(()=>auditRecordedSyntheticBatch(Array(101).fill(null)),/INVALID_REPORT_BATCH/);
});
