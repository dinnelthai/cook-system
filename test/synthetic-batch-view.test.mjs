import test from "node:test";
import assert from "node:assert/strict";
import {runParticipantSimulation} from "../src/simulation/participant-simulator.mjs";
import {reviewSyntheticBatchInput} from "../web/synthetic-batch-view.mjs";
import {auditRecordedSyntheticBatch} from "../src/simulation/synthetic-batch-audit.mjs";
const fixture=id=>runParticipantSimulation({scenarioId:id,seed:7,steps:30});
test("browser review shares CLI audit and preserves unknown and rejected evidence",()=>{
 const a=fixture("a"),b=fixture("b"),c=fixture("c");
 b.summary.event_count+=1;delete c.opening_agent_states;
 const input=[a,b,c],v=reviewSyntheticBatchInput(input);
 assert.deepEqual(v.audit,auditRecordedSyntheticBatch(input));
 assert.deepEqual(v.metrics,[["报告总数",3],["内部一致",1],["需复核",1],["拒绝",1]]);
 assert.deepEqual(v.comparison.find(r=>r[0]==="历史校准"),["历史校准",0,0,2,1]);
 assert.ok(v.rows[1][4].includes("SUMMARY_COUNT_MISMATCH:event_count"));
 assert.equal(v.rows[2][2],"—");
});
test("derived batch exports and non-synthetic data are not accepted as source",()=>{
 const input=[fixture("a")],v=reviewSyntheticBatchInput(input);
 assert.throws(()=>reviewSyntheticBatchInput(v.audit));
 assert.throws(()=>reviewSyntheticBatchInput(v.audit.results));
 assert.throws(()=>reviewSyntheticBatchInput([{sourceMode:"ARCHIVED_HISTORICAL"}]));
});

test("CLI and browser raw batch boundary agree on invalid arrays",async()=>{
 const {assertRawSyntheticBatch}=await import("../src/core/synthetic-batch-audit.mjs");
 for(const bad of [[null],[{}],[{sourceMode:"ARCHIVED_HISTORICAL"}]]){
  assert.throws(()=>assertRawSyntheticBatch(bad),/RAW_SYNTHETIC_REPORT_ARRAY_REQUIRED/);
  assert.throws(()=>reviewSyntheticBatchInput(bad),/RAW_SYNTHETIC_REPORT_ARRAY_REQUIRED/);
 }
 const malformed=[{schema_version:"cook-participant-simulation.1"}];
 assert.deepEqual(reviewSyntheticBatchInput(malformed).audit,auditRecordedSyntheticBatch(assertRawSyntheticBatch(malformed)));
});
