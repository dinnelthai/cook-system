import test from "node:test";
import assert from "node:assert/strict";
import {runParticipantSimulation} from "../src/simulation/participant-simulator.mjs";
import {buildUnifiedSyntheticReview} from "../src/simulation/unified-synthetic-review.mjs";
const fixture=()=>runParticipantSimulation({scenarioId:"unified-review",seed:7,steps:120});
test("unified review recomputes counts and ledger without claiming calibration",()=>{
 const r=fixture(),copy=structuredClone(r),v=buildUnifiedSyntheticReview(r);
 assert.equal(v.status,"INTERNALLY_CONSISTENT");assert.equal(v.observed_record_counts.trade_count,r.summary.trade_count);
 assert.equal(v.checks.find(c=>c.id==="fee_attribution").status,"UNKNOWN");
 assert.equal(v.real_market_validated,false);assert.deepEqual(r,copy);
});
test("out-of-order and mixed-version evidence cannot pass unified review",()=>{
 for(const [mutate,issue] of [
 [r=>r.detector_input.events.reverse(),"RECORDED_EVENT_ORDER_MISMATCH"],
 [r=>r.detector_input.events[0].synthetic_metadata.generator_version="other","GENERATOR_VERSION_INCONSISTENT"],
 [r=>r.detector_input.events[0].ordering.event_sequence=999,"RECORDED_SEQUENCE_NOT_CONTIGUOUS"]]){
  const r=fixture();mutate(r);const v=buildUnifiedSyntheticReview(r);
  assert.equal(v.status,"REVIEW_REQUIRED");assert.ok(v.issues.includes(issue));
 }
});
test("caller supplied audit claims cannot hide actual endpoint discrepancy",()=>{
 const r=fixture();r.agent_states[0].quote_balance_base_units="0";
 r.conservation_audit={status:"BALANCED"};
 const v=buildUnifiedSyntheticReview(r);
 assert.equal(v.status,"REVIEW_REQUIRED");assert.equal(v.accounting.status,"REVIEW_REQUIRED");
});

test("synthetic ledger rejects mixed protocol, phase and explicit curve identity",()=>{
 for(const [key,value] of [["curve_program_id","other"],["market_phase","post_graduation"],["curve_account","other"],["pool_account","other"]]){
  const r=fixture();r.detector_input.events[0].market={...r.detector_input.events[0].market,[key]:value};
  assert.throws(()=>buildUnifiedSyntheticReview(r),/INVALID_OR_DUPLICATE_SIMULATION_EVENT/);
 }
});
