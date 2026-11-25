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

test("unified batch detects summary contradictions even with a balanced ledger",()=>{
 const a=report("a");a.summary.trade_count+=1;
 const r=auditRecordedSyntheticBatch([a,report("b")]);
 assert.equal(r.summary.review_required_count,1);assert.equal(r.summary.consistent_count,1);
 assert.equal(r.results[0].audit.status,"INTERNALLY_CONSISTENT");
 assert.ok(r.results[0].issues.includes("SUMMARY_COUNT_MISMATCH:trade_count"));
 assert.equal(r.results[0].checks.find(c=>c.id==="historical_calibration").status,"UNKNOWN");
});

test("batch comparison distinguishes unknown evidence from rejected reports",()=>{
 const a=report("a"),b=report("b");b.summary.event_count+=1;
 const c=report("c");delete c.opening_agent_states;
 const r=auditRecordedSyntheticBatch([a,b,c]);
 assert.deepEqual(r.comparison.find(x=>x.id==="record_counts"),{id:"record_counts",pass:1,review_required:1,unknown:0,not_evaluated:1});
 assert.deepEqual(r.comparison.find(x=>x.id==="historical_calibration"),{id:"historical_calibration",pass:0,review_required:0,unknown:2,not_evaluated:1});
 for(const row of r.comparison)assert.equal(row.pass+row.review_required+row.unknown+row.not_evaluated,3);
 assert.equal(r.results[0].observed_record_counts.event_count,a.detector_input.events.length);
 assert.equal(r.comparison_scope,"QA_EVIDENCE_ONLY");
});
test("issue counts count affected reports rather than duplicate occurrences",()=>{
 const a=report("a"),b=report("b");a.agent_states[0].quote_balance_base_units="0";a.agent_states[1].quote_balance_base_units="0";b.agent_states[0].quote_balance_base_units="0";
 const r=auditRecordedSyntheticBatch([a,b]);
 assert.deepEqual(r.issue_counts.find(x=>x.code==="ACCOUNT_BALANCE_MISMATCH"),{code:"ACCOUNT_BALANCE_MISMATCH",report_count:2});
 assert.equal(r.independent_market_paths_attested,false);
});
test("duplicate scenarios remain not evaluated in comparison and rejection counts",()=>{
 const r=auditRecordedSyntheticBatch([report("a"),report("a")]);
 assert.ok(r.comparison.every(x=>x.not_evaluated===2&&x.pass===0));
 assert.deepEqual(r.issue_counts,[{code:"DUPLICATE_SCENARIO_ID",report_count:2}]);
});

test("batch exposes numeric evidence audit instead of hiding it in the issue list",()=>{
 const a=report("a"),b=report("b");
 b.detector_input.events.find(e=>e.event_kind.startsWith("CURVE_")).payload.execution_price_decimal="0";
 const v=auditRecordedSyntheticBatch([a,b]);
 assert.deepEqual(v.comparison.find(x=>x.id==="record_numeric_consistency"),{id:"record_numeric_consistency",pass:1,review_required:1,unknown:0,not_evaluated:0});
});

test("batch exposes reserve-product diagnostic separately from accounting consistency",()=>{
 const r=auditRecordedSyntheticBatch([report("a"),report("b")]);
 assert.equal(r.results.length,2);
 assert.equal(Object.values(r.reserve_product_diagnostics).reduce((a,b)=>a+b,0),2);
 for(const row of r.results)assert.ok(["NO_DECREASE_OBSERVED","REVIEW_REQUIRED","UNKNOWN"].includes(row.reserve_product_diagnostic.status));
 assert.equal(r.real_market_validated,false);
});
