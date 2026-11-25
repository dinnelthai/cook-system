import {reviewRecordedSyntheticSimulation} from "./synthetic-report-ledger.mjs";
import {sortForReplay} from "../core/event-order.mjs";
/** Unified retrospective QA of a supplied completed synthetic report.
 * No new actions, price forecasts, participant policies or live integration. */
export function buildUnifiedSyntheticReview(report){
 const {audit,ledger_input,fee_attribution}=reviewRecordedSyntheticSimulation(report);
 const events=report.detector_input.events;
 const issues=[...audit.issues],checks=[];
 function check(id,status,evidence=[]){checks.push({id,status,evidence});if(status==="REVIEW_REQUIRED")issues.push(...evidence);}
 check("accounting",audit.status==="INTERNALLY_CONSISTENT"?"PASS":"REVIEW_REQUIRED");
 const observed={event_count:events.length,trade_count:ledger_input.entries.length/2,agent_count:ledger_input.opening.length-1};
 const countIssues=Object.keys(observed).filter(k=>report.summary?.[k]!==observed[k]).map(k=>"SUMMARY_COUNT_MISMATCH:"+k);
 check("record_counts",countIssues.length?"REVIEW_REQUIRED":"PASS",countIssues);
 const versionSet=new Set(events.map(e=>e.synthetic_metadata?.generator_version));
 const versionIssues=events.length&&(versionSet.size!==1||[...versionSet].some(v=>typeof v!=="string"||!v.trim()))?["GENERATOR_VERSION_INCONSISTENT"]:[];
 check("generator_identity",versionIssues.length?"REVIEW_REQUIRED":events.length?"PASS":"UNKNOWN",versionIssues);
 let orderIssues=[];
 try{
  const sorted=sortForReplay(events);
  if(sorted.some((e,i)=>e.event_id!==events[i].event_id))orderIssues.push("RECORDED_EVENT_ORDER_MISMATCH");
  if(events.some((e,i)=>e.ordering?.event_sequence!==i))orderIssues.push("RECORDED_SEQUENCE_NOT_CONTIGUOUS");
 }catch{orderIssues=["INVALID_RECORDED_EVENT_ORDER"];}
 check("event_order",orderIssues.length?"REVIEW_REQUIRED":events.length?"PASS":"UNKNOWN",orderIssues);
 check("fee_attribution","UNKNOWN",[fee_attribution]);
 check("historical_calibration","UNKNOWN",["NO_INDEPENDENT_HISTORICAL_CALIBRATION"]);
 check("market_behavior_validity","UNKNOWN",["SYNTHETIC_RECORDS_ONLY"]);
 return {schema_version:"cook-unified-synthetic-review.1",source_mode:"SYNTHETIC",scenario_id:audit.scenario_id,
  status:checks.some(c=>c.status==="REVIEW_REQUIRED")?"REVIEW_REQUIRED":"INTERNALLY_CONSISTENT",
  observed_record_counts:observed,checks,issues,accounting:audit,fee_attribution,
  real_market_validated:false,execution_enabled:false,
  limitation:"Internal retrospective QA only; consistent records do not establish real-market behavior, fee attribution or completeness of an external source."};
}
