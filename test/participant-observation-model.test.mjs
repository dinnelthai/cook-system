import test from "node:test";
import assert from "node:assert/strict";
import {runParticipantSimulation} from "../src/simulation/participant-simulator.mjs";
import {createObserverProfiles,reviewParticipantObservationCoverage} from "../src/simulation/participant-observation-model.mjs";
const fixture=()=>runParticipantSimulation({scenarioId:"coverage",seed:7,steps:120});
const profiles=(r,latency,missing)=>r.agent_states.map(a=>({agent_id:a.agent_id,observation_latency_ms:latency,missing_record_bps:missing}));
test("heterogeneous observer profiles are deterministic, detached and bounded",()=>{
 const r=fixture(),copy=structuredClone(r),a=createObserverProfiles(r,7);
 assert.deepEqual(a,createObserverProfiles(r,7));assert.notDeepEqual(a,createObserverProfiles(r,8));
 assert.equal(a.length,r.agent_states.length);assert.deepEqual(r,copy);
 const v=reviewParticipantObservationCoverage(r,{seed:7});
 assert.deepEqual(v,reviewParticipantObservationCoverage(r,{seed:7}));assert.equal(v.observation_feedback_to_behavior,false);
 assert.equal(v.real_market_validated,false);assert.deepEqual(r,copy);
});
test("observer checkpoints never include future events; delayed delivery catches up",()=>{
 const r=fixture(),events=r.detector_input.events,first=events[0].event_time_ms,end=events.at(-1).event_time_ms;
 const points=[first,first+1000,end+1000];
 const a=reviewParticipantObservationCoverage(r,{profiles:profiles(r,1000,0),checkpoints:points});
 for(const observer of a.observers){
  assert.equal(observer.samples[0].received_record_count,0);
  assert.equal(observer.samples[0].status,"DELAYED");
  for(const s of observer.samples){
   assert.equal(s.received_record_count,events.filter(e=>e.event_time_ms+1000<=s.checkpoint_ms).length);
   assert.equal(s.oracle_record_count,s.received_record_count+s.not_yet_due_record_count+s.missing_after_due_count);
  }
  assert.equal(observer.samples.at(-1).status,"MATCHED_TEST_ORACLE");
 }
});
test("complete loss remains incomplete; no observed timestamp is fabricated",()=>{
 const r=fixture(),end=r.detector_input.events.at(-1).event_time_ms;
 const v=reviewParticipantObservationCoverage(r,{profiles:profiles(r,0,10000),checkpoints:[end]});
 for(const o of v.observers){
  const s=o.samples[0];assert.equal(s.status,"INCOMPLETE");assert.equal(s.received_record_count,0);
  assert.equal(s.missing_after_due_count,r.summary.event_count);assert.equal(s.latest_observed_event_age_ms,null);
 }
});
test("invalid profiles, checkpoints and noncanonical fixtures are rejected",()=>{
 const r=fixture(),p=profiles(r,0,0);
 assert.throws(()=>reviewParticipantObservationCoverage(r,{profiles:p.slice(1)}),/INVALID_OBSERVER_PROFILE/);
 assert.throws(()=>reviewParticipantObservationCoverage(r,{profiles:p.map(a=>({...a,observation_latency_ms:-1}))}),/INVALID_OBSERVER_PROFILE/);
 assert.throws(()=>reviewParticipantObservationCoverage(r,{checkpoints:[1,1]}),/INVALID_OBSERVER_CHECKPOINTS/);
 r.detector_input.events.reverse();assert.throws(()=>reviewParticipantObservationCoverage(r),/INVALID_CANONICAL_FIXTURE/);
});
