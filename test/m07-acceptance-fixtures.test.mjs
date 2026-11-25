import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reviewRecordedSyntheticSimulation} from "../src/core/synthetic-report-ledger.mjs";
import {auditRecordedSyntheticBatch} from "../src/core/synthetic-batch-audit.mjs";
import {reviewSyntheticBatchInput} from "../web/synthetic-batch-view.mjs";
import {createHistoricalProjectCatalogue} from "../src/inner-market/historical-project-catalogue.mjs";
const read=name=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/"+name,import.meta.url),"utf8"));
test("fixed M07 single and pass-array inputs reproduce exact expected accounting",()=>{
 const single=reviewRecordedSyntheticSimulation(read("m07/report-single.json"));
 assert.equal(single.audit.status,"INTERNALLY_CONSISTENT");
 assert.equal(single.audit.entry_count,2);
 const input=read("m07/report-array-pass.json"),r=auditRecordedSyntheticBatch(input);
 assert.equal(r.summary.consistent_count,2);
 assert.deepEqual(reviewSyntheticBatchInput(input).audit,r);
});
test("fixed mixed batch keeps opposite differences and rejected records distinct",()=>{
 const input=read("m07/report-array-mixed.json"),r=auditRecordedSyntheticBatch(input);
 assert.deepEqual(r.summary,{report_count:4,consistent_count:1,review_required_count:2,rejected_count:1});
 assert.equal(r.results[1].audit.accounts.find(a=>a.account_id==="agent:sample-account").quote_difference_base_units,"1");
 assert.equal(r.results[2].audit.accounts.find(a=>a.account_id==="agent:sample-account").quote_difference_base_units,"-1");
 assert.deepEqual(reviewSyntheticBatchInput(input).audit,r);
});
test("fixed project fixtures cover separate and conflicting catalogue records",()=>{
 const c=createHistoricalProjectCatalogue(),a=read("inner-market-mvp.json");
 c.add(a);c.add(read("m07/catalogue-second.json"));
 assert.equal(c.list().length,2);assert.equal(c.add(a).status,"ALREADY_PRESENT");
 assert.throws(()=>c.add(read("m07/catalogue-conflict.json")),/CONFLICTING_CLOSED_INTERVAL/);
 assert.equal(c.list().length,2);
});

test("legacy fixed accounting fixtures retain accounting review without claiming generator validation",()=>{
 const r=auditRecordedSyntheticBatch(read("m07/report-array-pass.json"));
 for(const result of r.results){
  assert.equal(result.status,"INTERNALLY_CONSISTENT");
  assert.equal(result.checks.find(c=>c.id==="generator_identity").status,"UNKNOWN");
  assert.equal(result.checks.find(c=>c.id==="record_numeric_consistency").status,"UNKNOWN");
 }
 assert.equal(r.execution_enabled,false);
});
