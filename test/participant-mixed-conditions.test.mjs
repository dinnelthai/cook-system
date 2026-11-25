import test from "node:test";
import assert from "node:assert/strict";
import {runParticipantSimulation} from "../src/simulation/participant-simulator.mjs";
import {reviewMixedParticipantConditions} from "../src/simulation/participant-mixed-conditions.mjs";
const fixture=(seed=701)=>runParticipantSimulation({scenarioId:"mixed-qa",seed,steps:120});
test("mixed conditions coexist on one immutable event path, with independent recovery",()=>{
 for(const seed of [701,702,703]){
  const report=fixture(seed),before=structuredClone(report),v=reviewMixedParticipantConditions(report,{seed});
  assert.equal(v.status,"SYNTHETIC_REGRESSION_PASS");assert.equal(v.cohorts.length,4);
  assert.equal(v.passive_fixture_account_count,4);assert.equal(v.checks.length,8);
  assert.equal(v.cohorts.find(c=>c.cohort==="OUTAGE").final_received_count,0);
  assert.ok(v.cohorts.filter(c=>c.cohort!=="OUTAGE").every(c=>c.final_received_count===report.summary.event_count*c.observer_count));
  assert.deepEqual(v,reviewMixedParticipantConditions(report,{seed}));assert.deepEqual(report,before);
  assert.equal(v.real_market_validated,false);assert.equal(v.observation_feedback_to_behavior,false);
 }
});
test("retrospective mixed conditions reject invalid fixture and balances",()=>{
 const report=fixture();
 assert.throws(()=>reviewMixedParticipantConditions({...report,status:"ARCHIVED_HISTORICAL"}),/INVALID_MIXED_PARTICIPANT_FIXTURE/);
 report.agent_states[0].quote_balance_base_units=(BigInt(report.agent_states[0].quote_balance_base_units)+1n).toString();
 assert.throws(()=>reviewMixedParticipantConditions(report),/INVALID_CANONICAL_FIXTURE/);
});
