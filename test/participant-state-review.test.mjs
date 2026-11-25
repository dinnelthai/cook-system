import test from "node:test";
import assert from "node:assert/strict";
import {runParticipantSimulation} from "../src/simulation/participant-simulator.mjs";
import {reviewParticipantStates,verifyParticipantStateCheckpoint} from "../src/simulation/participant-state-review.mjs";
const fixture=()=>runParticipantSimulation({scenarioId:"state-review",seed:7,steps:120});
test("synthetic state checkpoints reconcile every account and preserve original fixture",()=>{
 const r=fixture(),before=structuredClone(r),v=reviewParticipantStates(r);
 assert.equal(v.status,"INTERNALLY_CONSISTENT");assert.equal(v.endpoint_checked,true);
 assert.deepEqual(v,reviewParticipantStates(r));assert.deepEqual(r,before);
 assert.equal(v.checkpoints[0].processed_event_count,0);
 assert.ok(v.checkpoints[0].accounts.every(a=>a.recorded_activity==="NO_RECORDED_ACTIVITY"));
 const last=v.checkpoints.at(-1);
 assert.equal(last.processed_event_count,r.summary.event_count);
 for(const a of r.agent_states){
  const s=last.accounts.find(x=>x.account_id==="agent:"+a.agent_id);
  assert.equal(s.quote_balance_base_units,a.quote_balance_base_units);assert.equal(s.token_balance_base_units,a.token_balance_base_units);assert.equal(s.intent,"UNKNOWN");
 }
 for(const c of v.checkpoints){
  assert.equal(c.accounts.reduce((n,a)=>n+BigInt(a.quote_balance_base_units),0n).toString(),c.aggregate_quote_base_units);
  assert.equal(c.accounts.reduce((n,a)=>n+BigInt(a.token_balance_base_units),0n).toString(),c.aggregate_token_base_units);
 }
});
test("saved checkpoint is recomputed, not accepted on caller digest alone",()=>{
 const r=fixture(),v=reviewParticipantStates(r),s=v.checkpoints[1];
 assert.equal(verifyParticipantStateCheckpoint(r,s).status,"RECOMPUTED_MATCH");
 const changed=structuredClone(s);changed.accounts[0].quote_balance_base_units="0";
 assert.equal(verifyParticipantStateCheckpoint(r,changed).status,"REVIEW_REQUIRED");
 assert.throws(()=>reviewParticipantStates(r,{checkpoints:[1,1]}),/INVALID_PARTICIPANT_STATE_CHECKPOINTS/);
});
test("contradictory closing state and incorrect event order suppress checkpoints",()=>{
 for(const mutate of [r=>r.agent_states[0].quote_balance_base_units="0",r=>r.detector_input.events.reverse()]){
  const r=fixture();mutate(r);const v=reviewParticipantStates(r);
  assert.equal(v.status,"REVIEW_REQUIRED");assert.deepEqual(v.checkpoints,[]);assert.equal(v.execution_enabled,false);
 }
});
test("requested early prefix cannot skip endpoint audit",()=>{
 const r=fixture(),v=reviewParticipantStates(r,{checkpoints:[0]});
 assert.equal(v.endpoint_checked,true);assert.equal(v.checkpoints.length,1);
 r.agent_states[0].quote_balance_base_units="0";
 assert.equal(reviewParticipantStates(r,{checkpoints:[0]}).status,"REVIEW_REQUIRED");
});
