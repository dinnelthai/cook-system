import test from "node:test";
import assert from "node:assert/strict";
import {createFixtureRandomStream,shuffledFixtureRound} from "../src/simulation/fixture-random-stream.mjs";
import {runParticipantSimulation} from "../src/simulation/participant-simulator.mjs";
import {stressParticipantObservation,runParticipantObservationSuite} from "../src/simulation/participant-observation-stress.mjs";
test("QA random streams are domain separated, exact-seed reproducible and shuffle without duplication",()=>{
 const sample=(seed,domain,id)=>{const r=createFixtureRandomStream(seed,domain,id);return Array.from({length:10},r)};
 assert.deepEqual(sample(0,"participant","a"),sample(0,"participant","a"));
 assert.notDeepEqual(sample(0,"participant","a"),sample(4294967296,"participant","a"));
 assert.notDeepEqual(sample(0,"participant","a"),sample(0,"participant","b"));
 assert.notDeepEqual(sample(0,"schedule","a"),sample(0,"participant","a"));
 const r=createFixtureRandomStream(7,"schedule"),items=["a","b","c","d","e"];
 assert.deepEqual(shuffledFixtureRound(items,r).sort(),items);
});
test("fault suite recovers delayed and duplicate observations but identifies missing and contradictory data",()=>{
 const r=runParticipantObservationSuite({seeds:[701,702,703],steps:120});
 assert.equal(r.case_count,18);assert.equal(r.passed_count,18);assert.equal(r.status,"SYNTHETIC_REGRESSION_PASS");
 assert.equal(r.real_market_validated,false);assert.deepEqual(r,runParticipantObservationSuite({seeds:[701,702,703],steps:120}));
});
test("data-plane fault injection leaves original simulation intact",()=>{
 const report=runParticipantSimulation({seed:42,steps:120}),before=structuredClone(report);
 for(const profile of ["MISSING_RECORD","CONFLICTING_DUPLICATE","CORRUPTED_AMOUNT"]){
  const r=stressParticipantObservation(report,{profile,seed:42});assert.equal(r.status,"REVIEW_REQUIRED");assert.equal(r.execution_enabled,false);
 }
 assert.deepEqual(report,before);
});
