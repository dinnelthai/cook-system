import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reviewSyntheticLaunchBatch} from "../src/inner-market/synthetic-launch-review.mjs";
const base=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
const marker=(id,scenario=id)=>({source_mode:"SYNTHETIC",event_kind:"MARKET_CREATED",event_id:id,scenario_id:scenario});
test("offline creation markers trigger bounded fixed QA once per unique event",()=>{
 const b=base(),before=structuredClone(b),args={base:b,records:[marker("a"),marker("a"),marker("b")],runs:2};
 const r=reviewSyntheticLaunchBatch(args);
 assert.equal(r.unique_creation_count,2);assert.equal(r.duplicate_count,1);
 assert.equal(r.results.length,2);assert.equal(r.results[0].trial_count,12);
 assert.equal(r.results[0].status,"QA_MATCH");assert.equal(r.execution_enabled,false);
 assert.deepEqual(r,reviewSyntheticLaunchBatch(args));assert.deepEqual(b,before);
});
test("reject non-synthetic and conflicting creation markers",()=>{
 const b=base();
 assert.throws(()=>reviewSyntheticLaunchBatch({base:b,records:[{...marker("a"),source_mode:"ARCHIVED_HISTORICAL"}]}),/INVALID_SYNTHETIC_CREATION_RECORD/);
 assert.throws(()=>reviewSyntheticLaunchBatch({base:b,records:[marker("a"),marker("a","different")]}),/CONFLICTING_CREATION_RECORD/);
 assert.throws(()=>reviewSyntheticLaunchBatch({base:{...b,sourceMode:"ARCHIVED_HISTORICAL"},records:[]}),/SYNTHETIC_FIXTURE_REQUIRED/);
});

test("batch totals exclude duplicates and do not count labels as independent templates",()=>{
 const r=reviewSyntheticLaunchBatch({base:base(),records:[marker("a","same"),marker("a","same"),marker("b","same"),marker("c","other")],runs:2});
 assert.deepEqual(r.summary,{qa_match_count:3,review_required_count:0,total_trials:36,total_matches:36,distinct_scenario_labels:2,distinct_qa_templates:1});
 const empty=reviewSyntheticLaunchBatch({base:base(),records:[]});
 assert.equal(empty.summary.total_trials,0);assert.equal(empty.summary.distinct_qa_templates,0);
});
