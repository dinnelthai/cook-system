import {assertProjectAggregate} from "./project-aggregate.mjs";
import {describeProjectLifecycleEvidence} from "./project-lifecycle-evidence.mjs";
const rank={CRITICAL:0,WARNING:1,UNKNOWN:2};
const current=(p,r)=>r.project_id===p.project_id&&r.project_revision===p.revision&&r.stale===false;
const knownOutcome=new Set(["REPORTED_SUCCESS","REPORTED_FAILURE"]);
/** Retrospective risk and evidence review. Does not calculate live exposure,
 * issue a trading permission, or mutate any project or order. */
export function describeProjectRiskReview(projectInput,archives=[],orders=[]){
 const p=assertProjectAggregate(projectInput);
 const lifecycle=describeProjectLifecycleEvidence(p,archives,orders);
 const findings=new Map();
 function add(category,code,severity,reference=null){
  const key=category+":"+code;
  const old=findings.get(key);
  if(!old){findings.set(key,{category,code,severity,references:reference?[reference]:[]});return;}
  if(rank[severity]<rank[old.severity])old.severity=severity;
  if(reference&&!old.references.includes(reference))old.references.push(reference);
 }
 for(const code of lifecycle.blockers){
  const severity=code==="PROJECT_REVIEW_REQUIRED"||code==="GRADUATION_HISTORY_CONFLICT"||code==="PROJECT_CLOSE_REVIEW_REQUIRED"||code.endsWith("_REVIEW_REQUIRED")?"CRITICAL":"UNKNOWN";
  add("LIFECYCLE",code,severity);
 }
 if(p.lifecycle.operational_status==="HALTED")add("LIFECYCLE","PROJECT_RECORDED_HALTED","WARNING");
 const scoped=archives.filter(a=>current(p,a)&&a.payload?.project_id===p.project_id&&a.payload?.project_revision===p.revision&&a.payload.source_attestation==="UNKNOWN"&&a.payload.execution_enabled===false);
 const stale=archives.filter(a=>a.project_id===p.project_id&&a.project_revision!==p.revision);
 if(stale.length)add("EVIDENCE","STALE_ARCHIVES_EXIST","WARNING");
 const treasury=scoped.filter(a=>a.kind==="TREASURY_REVIEW");
 if(!treasury.length)add("TREASURY","TREASURY_REVIEW_MISSING","UNKNOWN");
 for(const a of treasury){
  const v=a.payload;
  if(v.status==="REVIEW_REQUIRED")add("TREASURY","TREASURY_EVIDENCE_CONFLICT","CRITICAL",a.archive_id);
  if(v.creator_fee_audit?.status==="REVIEW_REQUIRED")add("CREATOR_FEE","CREATOR_FEE_RECONCILIATION_CONFLICT","CRITICAL",a.archive_id);
  if(v.account_set?.status==="REVIEW_REQUIRED")add("ACCOUNT","ACCOUNT_SET_CONFLICT","CRITICAL",a.archive_id);
  if(v.budget_review?.status==="RECORDED_INTERVAL_INFLOW_EXCEEDS_CONFIGURED_BUDGET")add("BUDGET","RECORDED_INFLOW_ABOVE_CURRENT_BUDGET","WARNING",a.archive_id);
  for(const code of v.unknown??[])add("TREASURY",code,"UNKNOWN",a.archive_id);
 }
 const marketReviews=scoped.filter(a=>a.kind==="MARKET_EVIDENCE_REVIEW");
 if(!marketReviews.length)add("MARKET","MARKET_EVIDENCE_REVIEW_MISSING","UNKNOWN");
 for(const a of marketReviews){
  const v=a.payload;
  if(v.status==="REVIEW_REQUIRED")add("MARKET","MARKET_EVIDENCE_CONFLICT","CRITICAL",a.archive_id);
  for(const code of v.issues??[])add("MARKET",code,"CRITICAL",a.archive_id);
  for(const code of v.unknown??[])add("MARKET",code,"UNKNOWN",a.archive_id);
 }
 const allOrders=orders.filter(o=>o.project_id===p.project_id);
 for(const o of allOrders){
  if(!current(p,o)){add("ORDER","STALE_ORDER_REVISION","WARNING",o.order_id);continue;}
  if(o.status==="REVIEW_REQUIRED")add("ORDER","ORDER_OUTCOME_CONFLICT","CRITICAL",o.order_id);
  else if(!knownOutcome.has(o.status))add("ORDER","ORDER_OUTCOME_UNKNOWN","UNKNOWN",o.order_id);
  else if(o.status==="REPORTED_FAILURE")add("ORDER","REPORTED_TRANSACTION_FAILURE","WARNING",o.order_id);
  const matches=scoped.filter(a=>a.kind==="ORDER_RECEIPT_REVIEW"&&a.payload.order_id===o.order_id&&a.payload.order_revision===o.revision&&a.payload.order_head_hash===o.head_hash&&a.payload.signature===o.signature);
  if(matches.some(a=>a.payload.status==="REVIEW_REQUIRED"||a.payload.rpc_observation?.status==="REVIEW_REQUIRED"))add("ORDER","RECEIPT_EVIDENCE_CONFLICT","CRITICAL",o.order_id);
  else if(!matches.some(a=>a.payload.status==="INTERNAL_MATCH"&&a.payload.rpc_observation?.status==="DECLARED_SAMPLE_MATCH"))add("ORDER","RECEIPT_EVIDENCE_INCOMPLETE","UNKNOWN",o.order_id);
 }
 if(!allOrders.length)add("ORDER","ORDER_COVERAGE_UNATTESTED","UNKNOWN");
 for(const a of scoped.filter(a=>a.kind==="PROJECT_CLOSE_REVIEW")){
  if(a.payload.status==="REVIEW_REQUIRED")add("CLOSE","CLOSE_REVIEW_REQUIRED","CRITICAL",a.archive_id);
  for(const code of a.payload.blockers??[])add("CLOSE",code,"WARNING",a.archive_id);
  for(const code of a.payload.unknown??[])add("CLOSE",code,"UNKNOWN",a.archive_id);
 }
 for(const code of ["LIVE_BALANCE_UNAVAILABLE","CURRENT_EXPOSURE_UNAVAILABLE","CURRENT_MARKET_RISK_UNAVAILABLE","INDEPENDENT_SOURCE_ATTESTATION_UNAVAILABLE"])add("COVERAGE",code,"UNKNOWN");
 const rows=[...findings.values()].map(x=>({...x,references:x.references.sort()})).sort((a,b)=>rank[a.severity]-rank[b.severity]||a.category.localeCompare(b.category,"en")||a.code.localeCompare(b.code,"en"));
 const counts={critical:0,warning:0,unknown:0};
 for(const row of rows)counts[row.severity.toLowerCase()]++;
 return {schema_version:"cook-project-risk-review.1",project_id:p.project_id,project_revision:p.revision,
  status:counts.critical?"REVIEW_REQUIRED":counts.warning?"WARNING":"EVIDENCE_INCOMPLETE",counts,findings:rows,
  coverage:{current_archive_count:scoped.length,stale_archive_count:stale.length,order_count:allOrders.length,treasury_review_count:treasury.length,market_evidence_review_count:marketReviews.length},
  source_attestation:"UNKNOWN",live_risk_assessed:false,settlement_allowed:false,execution_enabled:false,lifecycle_mutated:false};
}
