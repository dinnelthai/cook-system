import {canonicalJson} from "../core/canonical-json.mjs";
import {sortForReplay} from "../core/event-order.mjs";
import {buildUnifiedSyntheticReview} from "../core/unified-synthetic-review.mjs";
import {createFixtureRandomStream} from "./fixture-random-stream.mjs";
import {runParticipantSimulation} from "./participant-simulator.mjs";
const PROFILES=["BASELINE","DELAY_REORDER","DUPLICATE_DELIVERY","MISSING_RECORD","CONFLICTING_DUPLICATE","CORRUPTED_AMOUNT"];
/** Synthetic data-plane fault injection only. Does not generate attack sequences,
 * modify canonical event history, optimize behavior, or connect to a network. */
export function stressParticipantObservation(report,{seed=42,profile="BASELINE"}={}){
 if(!Number.isSafeInteger(seed)||!PROFILES.includes(profile))throw Error("INVALID_OBSERVATION_STRESS_CONFIG");
 if(buildUnifiedSyntheticReview(report).status!=="INTERNALLY_CONSISTENT")throw Error("INVALID_CANONICAL_FIXTURE");
 const canonical=report.detector_input.events;
 if(!canonical.length)throw Error("EMPTY_CANONICAL_FIXTURE");
 const random=createFixtureRandomStream(seed,"observation:"+profile);
 const delivery=canonical.map((event,index)=>({event:structuredClone(event),received_at_ms:event.event_time_ms+(profile==="DELAY_REORDER"?Math.floor(random()*5000):0),delivery_sequence:index}));
 const trade=delivery.find(x=>x.event.event_kind==="CURVE_BUY_EXECUTED"||x.event.event_kind==="CURVE_SELL_EXECUTED");
 if(profile==="MISSING_RECORD")delivery.splice(Math.floor(random()*delivery.length),1);
 if(profile==="DUPLICATE_DELIVERY"||profile==="CONFLICTING_DUPLICATE"){
  const original=delivery[Math.floor(random()*delivery.length)],copy=structuredClone(original);
  copy.delivery_sequence=canonical.length;copy.received_at_ms+=1;
  if(profile==="CONFLICTING_DUPLICATE")copy.event.quality.warnings=["INJECTED_CONFLICT"];
  delivery.push(copy);
 }
 if(profile==="CORRUPTED_AMOUNT"){
  if(!trade)throw Error("NO_TRADE_FIXTURE");
  trade.event.payload.quote_amount_base_units=(BigInt(trade.event.payload.quote_amount_base_units)+1n).toString();
 }
 delivery.sort((a,b)=>a.received_at_ms-b.received_at_ms||a.delivery_sequence-b.delivery_sequence);
 const issues=[];let normalized=null,ledgerStatus="NOT_RUN";
 try{normalized=sortForReplay(delivery.map(x=>x.event));}
 catch{issues.push("EVENT_ORDER_OR_DUPLICATE_CONFLICT");}
 if(normalized){
  const expected=new Map(canonical.map(x=>[x.event_id,x]));
  if(normalized.length!==canonical.length||normalized.some(x=>!expected.has(x.event_id)))issues.push("CANONICAL_RECORD_COVERAGE_MISMATCH");
  if(normalized.some(x=>expected.has(x.event_id)&&canonicalJson(x)!==canonicalJson(expected.get(x.event_id))))issues.push("CANONICAL_RECORD_CONTENT_MISMATCH");
  const observed=structuredClone(report);observed.detector_input.events=normalized;
  try{ledgerStatus=buildUnifiedSyntheticReview(observed).status;if(ledgerStatus!=="INTERNALLY_CONSISTENT")issues.push("OBSERVED_LEDGER_REVIEW_REQUIRED");}
  catch{ledgerStatus="REVIEW_REQUIRED";issues.push("OBSERVED_LEDGER_INVALID");}
 }
 const status=issues.length?"REVIEW_REQUIRED":"RECOVERED_INTERNAL_MATCH";
 const expectedStatus=["BASELINE","DELAY_REORDER","DUPLICATE_DELIVERY"].includes(profile)?"RECOVERED_INTERNAL_MATCH":"REVIEW_REQUIRED";
 return {schema_version:"cook-participant-observation-stress.1",scenario_id:report.detector_input.scenario_id,profile,seed,status,expected_status:expectedStatus,passed:status===expectedStatus,
  canonical_event_count:canonical.length,delivery_count:delivery.length,normalized_event_count:normalized?.length??null,ledger_status:ledgerStatus,issues,
  canonical_reference_available_in_test_only:true,source_attestation:"UNKNOWN",real_market_validated:false,execution_enabled:false};
}
/** Batch of independent seed paths, not template labels or empirical attack rates. */
export function runParticipantObservationSuite({seeds=[701,702,703,704,705],steps=240}={}){
 if(!Array.isArray(seeds)||!seeds.length||seeds.length>100||new Set(seeds).size!==seeds.length||seeds.some(s=>!Number.isSafeInteger(s))||!Number.isSafeInteger(steps)||steps<60||steps>1000)throw Error("INVALID_OBSERVATION_SUITE_CONFIG");
 const cases=[];
 for(const seed of seeds){
  const report=runParticipantSimulation({scenarioId:"observation-qa-"+seed,seed,steps});
  for(const profile of PROFILES)cases.push(stressParticipantObservation(report,{seed,profile}));
 }
 return {schema_version:"cook-participant-observation-suite.1",status:cases.every(c=>c.passed)?"SYNTHETIC_REGRESSION_PASS":"REVIEW_REQUIRED",
  seeds:[...seeds],steps,case_count:cases.length,passed_count:cases.filter(c=>c.passed).length,cases,real_market_validated:false,execution_enabled:false};
}
