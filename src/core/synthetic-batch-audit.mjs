import {buildUnifiedSyntheticReview} from "./unified-synthetic-review.mjs";
/** Shared raw-input boundary for CLI and browser. Derived exports are not evidence. */
export function assertRawSyntheticBatch(input){
 if(!Array.isArray(input)||!input.some(r=>r?.schema_version==="cook-participant-simulation.1"))throw Error("RAW_SYNTHETIC_REPORT_ARRAY_REQUIRED");
 return input;
}
/** Review completed offline reports independently; never generate market actions. */
export function auditRecordedSyntheticBatch(reports){
 if(!Array.isArray(reports)||reports.length<1||reports.length>100)throw Error("INVALID_REPORT_BATCH");
 const counts=new Map();
 for(const report of reports){
  const id=report?.detector_input?.scenario_id;
  if(typeof id==="string"&&id.trim())counts.set(id,(counts.get(id)??0)+1);
 }
 const results=reports.map((report,index)=>{
  const id=report?.detector_input?.scenario_id;
  const scenario=typeof id==="string"&&id.length<=256?id:null;
  if(scenario!==null&&counts.get(scenario)>1)return {index,scenario_id:scenario,status:"REJECTED",reason:"DUPLICATE_SCENARIO_ID"};
  try{
   const review=buildUnifiedSyntheticReview(report);
   return {index,scenario_id:review.scenario_id,status:review.status,audit:review.accounting,checks:review.checks,issues:review.issues,observed_record_counts:review.observed_record_counts,reserve_product_diagnostic:review.numeric_audit.reserve_product_diagnostic};
  }catch{
   return {index,scenario_id:scenario,status:"REJECTED",reason:"INVALID_OR_INCOMPLETE_REPORT"};
  }
 });
 const summary={report_count:results.length,consistent_count:results.filter(r=>r.status==="INTERNALLY_CONSISTENT").length,
 review_required_count:results.filter(r=>r.status==="REVIEW_REQUIRED").length,rejected_count:results.filter(r=>r.status==="REJECTED").length};
 const checkIds=["accounting","posting_order_balances","record_counts","generator_identity","event_order","record_numeric_consistency","fee_attribution","historical_calibration","market_behavior_validity"];
 const comparison=checkIds.map(id=>{
  const row={id,pass:0,review_required:0,unknown:0,not_evaluated:0};
  for(const r of results){
   const status=r.checks?.find(c=>c.id===id)?.status;
   if(status==="PASS")row.pass++;
   else if(status==="REVIEW_REQUIRED")row.review_required++;
   else if(status==="UNKNOWN")row.unknown++;
   else row.not_evaluated++;
  }
  return row;
 });
 const reserveDiagnostics={no_decrease_observed:0,review_required:0,unknown:0,not_evaluated:0};
 for(const r of results){
  const s=r.reserve_product_diagnostic?.status;
  if(s==="NO_DECREASE_OBSERVED")reserveDiagnostics.no_decrease_observed++;
  else if(s==="REVIEW_REQUIRED")reserveDiagnostics.review_required++;
  else if(s==="UNKNOWN")reserveDiagnostics.unknown++;
  else reserveDiagnostics.not_evaluated++;
 }
 const issueReports=new Map();
 for(const r of results){
  const codes=new Set([...(r.issues??[]),...(r.reason?[r.reason]:[])].map(issue=>issue.split(":")[0]));
  for(const code of codes)issueReports.set(code,(issueReports.get(code)??0)+1);
 }
 const issue_counts=[...issueReports].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([code,report_count])=>({code,report_count}));
 return {source_mode:"SYNTHETIC",status:summary.consistent_count===summary.report_count?"INTERNALLY_CONSISTENT":"REVIEW_REQUIRED",summary,results,comparison,issue_counts,reserve_product_diagnostics:reserveDiagnostics,comparison_scope:"QA_EVIDENCE_ONLY",execution_enabled:false,real_market_validated:false,independent_market_paths_attested:false};
}
