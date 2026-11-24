import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runParticipantExperiment} from "../src/inner-market/participant-experiment.mjs";
const fixture=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
test("seeded experiments are reproducible and all expected audit outcomes match",()=>{
 const args={base:fixture(),seed:42,runs:100};
 const r=runParticipantExperiment(args);
 assert.deepEqual(r,runParticipantExperiment(args));
 assert.equal(r.total_trials,600);assert.equal(r.total_matches,600);
 assert.equal(r.execution_enabled,false);
});
test("distinct seeds change synthetic experiment samples",()=>{
 const base=fixture();
 assert.notDeepEqual(runParticipantExperiment({base,seed:42,runs:20}).observations,runParticipantExperiment({base,seed:43,runs:20}).observations);
});
test("role summaries count all trials and distinguish risk perturbations",()=>{
 const r=runParticipantExperiment({base:fixture(),runs:100});
 assert.equal(r.summaries.length,6);
 assert.equal(r.summaries[0].stress_trials,0);
 assert.ok(r.summaries.find(x=>x.role_id==="sandwich").review_required>0);
 assert.ok(r.summaries.find(x=>x.role_id==="early-holder").mean_observed_drawdown_bps>200);
 for(const s of r.summaries)assert.equal(s.expected_outcome_matches,s.runs);
});
test("source fixture is not mutated",()=>{
 const base=fixture(),copy=structuredClone(base);
 runParticipantExperiment({base,runs:20});assert.deepEqual(base,copy);
});
test("invalid run controls and non-synthetic input are rejected",()=>{
 const base=fixture();
 assert.throws(()=>runParticipantExperiment({base,runs:0}),/runs/);
 assert.throws(()=>runParticipantExperiment({base,runs:1001}),/runs/);
 assert.throws(()=>runParticipantExperiment({base,seed:-1}),/seed/);
 assert.throws(()=>runParticipantExperiment({base:{...base,sourceMode:"ARCHIVED_HISTORICAL"}}),/synthetic/);
});
