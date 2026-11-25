import {runParticipantExperiment} from "./participant-experiment.mjs";
/** Bounded offline QA of supplied synthetic creation records, not a live
 * discovery service or participant execution engine. No timers, RPC or signing. */
export function reviewSyntheticLaunchBatch({records,base,seed=42,runs=10}={}){
 if(base?.sourceMode!=="SYNTHETIC")throw Error("SYNTHETIC_FIXTURE_REQUIRED");
 if(!Array.isArray(records)||records.length>1000||!Number.isSafeInteger(seed)||seed<0||seed>4294967295||!Number.isSafeInteger(runs)||runs<1||runs>100||records.length*runs>1000)throw Error("INVALID_SYNTHETIC_BATCH");
 const seen=new Map(),results=[];
 for(const record of records){
  if(record?.source_mode!=="SYNTHETIC"||record.event_kind!=="MARKET_CREATED"||typeof record.event_id!=="string"||!record.event_id.trim()||typeof record.scenario_id!=="string"||!record.scenario_id.trim())throw Error("INVALID_SYNTHETIC_CREATION_RECORD");
  if(seen.has(record.event_id)){
   if(seen.get(record.event_id)!==record.scenario_id)throw Error("CONFLICTING_CREATION_RECORD");
   continue;
  }
  seen.set(record.event_id,record.scenario_id);
  const report=runParticipantExperiment({base,seed,runs});
  results.push({event_id:record.event_id,scenario_id:record.scenario_id,qa_fixture_project_id:base.scope.projectId,
   status:report.total_matches===report.total_trials?"QA_MATCH":"REVIEW_REQUIRED",trial_count:report.total_trials,match_count:report.total_matches,role_summaries:report.summaries});
 }
 const summary={qa_match_count:results.filter(r=>r.status==="QA_MATCH").length,review_required_count:results.filter(r=>r.status==="REVIEW_REQUIRED").length,total_trials:results.reduce((n,r)=>n+r.trial_count,0),total_matches:results.reduce((n,r)=>n+r.match_count,0),distinct_scenario_labels:new Set(results.map(r=>r.scenario_id)).size,distinct_qa_templates:results.length?1:0};
 return {source_mode:"SYNTHETIC",status:"QA_ONLY",input_count:records.length,unique_creation_count:seen.size,duplicate_count:records.length-seen.size,summary,results,execution_enabled:false,live_discovery_enabled:false,independent_market_paths_claimed:false,note:"Reuses fixed synthetic QA fixture per creation marker; not trading or market competition simulation."};
}
