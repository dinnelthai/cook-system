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
   const conflict=v.status==="REVIEW_REQUIRED"||q?.status==="REVIEW_REQUIRED"||
    (q?.event_count!=null&&(!Number.isSafeInteger(q.event_count)||q.event_count<0||q.event_count!==v.observed_trade_record_count))||
    (q?.status==="NO_EXECUTIONS"&&q.event_count!==0);
   if(conflict)issues.push({code:"RUNTIME_MARKET_QUALITY_CONFLICT",reference:a.archive_id});
   else if(!q||q.status==="UNKNOWN")unknown.push({code:"RUNTIME_MARKET_QUALITY_UNAVAILABLE",reference:a.archive_id});
   return [{archive_id:a.archive_id,status:conflict?"REVIEW_REQUIRED":q?.status==="DESCRIPTIVE_ONLY"?"DESCRIPTIVE_ONLY":q?.status==="NO_EXECUTIONS"?"NO_EXECUTIONS":"UNKNOWN",
    candle_status:v.candle_evidence_status??"UNKNOWN",ordering_status:conflict?"UNKNOWN":q?.ordering_status??"UNKNOWN",
    event_count:!conflict&&Number.isSafeInteger(q?.event_count)?q.event_count:null}];
  });
  return {report_link_archive_id:i.archive_id,report_digest:i.report_digest,opening_cutoff:i.opening_cutoff,closing_cutoff:i.closing_cutoff,
   status:records.some(r=>r.status==="REVIEW_REQUIRED")||records.length!==rows.length?"REVIEW_REQUIRED":records.length&&records.every(r=>["DESCRIPTIVE_ONLY","NO_EXECUTIONS"].includes(r.status))?"DECLARED_EVIDENCE_PRESENT":"INCOMPLETE",records};
 });
 return {schema_version:"cook-runtime-markets.1",registered:project.markets.map(m=>({market_id:m.market_id,venue:m.venue,verification_status:m.verification_status})),
  curve_intervals,migration_milestones:lifecycle.historical_milestones,historical_pools:operational.pools,
  status:issues.length||operational.status==="REVIEW_REQUIRED"||lifecycle.historical_milestones.some(m=>m.status==="REVIEW_REQUIRED")?"REVIEW_REQUIRED":"EVIDENCE_INCOMPLETE",
  issues,unknown,active_venue:null,live_state:null,common_snapshot_established:false,source_attestation:"UNKNOWN",execution_enabled:false};
}
