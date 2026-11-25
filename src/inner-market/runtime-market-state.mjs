import {archiveApplicable} from "./project-evidence-scope.mjs";
/** Preserve closed curve intervals and historical migration/pool evidence as
 * distinct observations. No automatic active venue or temporal inference. */
export function describeRuntimeMarkets(project,{archives,intervals,lifecycle,operational}){
 const byId=new Map(),duplicate=new Set(),issues=[],unknown=[];
 for(const a of archives.filter(x=>archiveApplicable(project,x))){
  if(byId.has(a.archive_id))duplicate.add(a.archive_id);else byId.set(a.archive_id,a);
 }
 const curve_intervals=intervals.map(i=>{
  const rows=i.reviews.filter(r=>r.kind==="MARKET_EVIDENCE_REVIEW");
  const records=rows.flatMap(r=>{
   const a=byId.get(r.archive_id);
   if(!a||duplicate.has(r.archive_id)||a.kind!==r.kind||a.payload.report_link_archive_id!==i.archive_id||a.payload.report_digest!==i.report_digest){
    issues.push({code:"RUNTIME_MARKET_LINK_CONFLICT",reference:r.archive_id});return [];
   }
   const v=a.payload,q=v.closed_market_quality;
   const descriptive=q?.status==="DESCRIPTIVE_ONLY"||q?.status==="NO_EXECUTIONS";
   const countValid=Number.isSafeInteger(q?.event_count)&&q.event_count>=0;
   const candle=v.candle_evidence_status;
   const conflict=v.status==="REVIEW_REQUIRED"||q?.status==="REVIEW_REQUIRED"||candle==="REVIEW"||
    (q?.event_count!=null&&(!countValid||q.event_count!==v.observed_trade_record_count))||
    (descriptive&&(!countValid||(q.status==="DESCRIPTIVE_ONLY"&&q.event_count===0)||(q.status==="NO_EXECUTIONS"&&q.event_count!==0)))||
    (descriptive&&candle!=null&&candle!==(q.status==="NO_EXECUTIONS"?"EMPTY":"CONSISTENT"))||
    (descriptive&&v.participant_coverage?.record_count!=null&&v.participant_coverage.record_count!==q.event_count)||
    (q?.execution_enabled!=null&&q.execution_enabled!==false)||(q?.live_state!=null&&q.live_state!==false)||(q?.source_attestation!=null&&q.source_attestation!=="UNKNOWN");
   if(conflict)issues.push({code:"RUNTIME_MARKET_QUALITY_CONFLICT",reference:a.archive_id});
   else if(!descriptive||v.status!=="PARTIAL")unknown.push({code:"RUNTIME_MARKET_QUALITY_UNAVAILABLE",reference:a.archive_id});
   const visible=!conflict&&descriptive&&v.status==="PARTIAL";
   return [{archive_id:a.archive_id,status:conflict?"REVIEW_REQUIRED":visible?q.status:"UNKNOWN",
    candle_status:conflict?"UNKNOWN":candle??"UNKNOWN",ordering_status:visible?q.ordering_status??"UNKNOWN":"UNKNOWN",
    event_count:visible?q.event_count:null}];
  });
  const countConflict=new Set(records.filter(r=>r.event_count!==null).map(r=>r.event_count)).size>1;
  if(countConflict)issues.push({code:"RUNTIME_MARKET_REVIEW_COUNT_CONFLICT",reference:i.archive_id});
  const blocked=countConflict||records.some(r=>r.status==="REVIEW_REQUIRED")||records.length!==rows.length;
  if(blocked)for(const r of records){r.status="REVIEW_REQUIRED";r.event_count=null;r.ordering_status="UNKNOWN";r.candle_status="UNKNOWN";}
  return {report_link_archive_id:i.archive_id,report_digest:i.report_digest,opening_cutoff:i.opening_cutoff,closing_cutoff:i.closing_cutoff,
   status:blocked?"REVIEW_REQUIRED":records.length&&records.every(r=>["DESCRIPTIVE_ONLY","NO_EXECUTIONS"].includes(r.status))?"DECLARED_EVIDENCE_PRESENT":"INCOMPLETE",records};
 });
 return {schema_version:"cook-runtime-markets.1",registered:project.markets.map(m=>({market_id:m.market_id,venue:m.venue,verification_status:m.verification_status})),
  curve_intervals,migration_milestones:lifecycle.historical_milestones,historical_pools:operational.pools,
  status:issues.length||operational.status==="REVIEW_REQUIRED"||lifecycle.historical_milestones.some(m=>m.status==="REVIEW_REQUIRED")?"REVIEW_REQUIRED":"EVIDENCE_INCOMPLETE",
  issues,unknown,active_venue:null,live_state:null,common_snapshot_established:false,source_attestation:"UNKNOWN",execution_enabled:false};
}
