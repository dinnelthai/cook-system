import {assertProjectAggregate} from "./project-aggregate.mjs";
import {describeProjectLifecycleEvidence} from "./project-lifecycle-evidence.mjs";
import {describeProjectRiskReview} from "./project-risk-review.mjs";
const hex=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const reviewKinds=["TREASURY_REVIEW","MARKET_EVIDENCE_REVIEW","PROJECT_CLOSE_REVIEW"];
const current=(p,r)=>r.project_id===p.project_id&&r.project_revision===p.revision&&r.stale===false;
const goodScope=(p,a)=>current(p,a)&&a.payload?.project_id===p.project_id&&a.payload?.project_revision===p.revision&&a.payload.source_attestation==="UNKNOWN"&&a.payload.execution_enabled===false;
const terminal=new Set(["REPORTED_SUCCESS","REPORTED_FAILURE"]);
/** M18–24: read-only review projection, scoped to a single local snapshot.
 * A digest/link match establishes internal association, not source truth.
 * Never sums different intervals, infers trading permissions or initiates actions. */
export function buildProjectBusinessReview(projectInput,archives=[],orders=[]){
 const p=assertProjectAggregate(projectInput);
 if(!Array.isArray(archives)||archives.length>256||!Array.isArray(orders)||orders.length>256)throw Error("PROJECT_BUSINESS_REVIEW_INPUT_LIMIT");
 const scoped=archives.filter(a=>goodScope(p,a));
 const allOrders=orders.filter(o=>o.project_id===p.project_id);
 const findings=[];
 const add=(code,reference)=>findings.push({code,reference});
 const links=new Map();
 for(const a of scoped.filter(x=>x.kind==="HISTORICAL_REPORT_LINK")){
  const v=a.payload,s=v.scope;
  if(v.status!=="DECLARED_MATCH"||!hex(v.report_digest)||!s||s.projectId!==p.project_id||!p.token.mint||s.tokenMint!==p.token.mint||
    !p.network.genesis_hash||s.genesisHash!==p.network.genesis_hash||s.quoteAsset!=="SOL_LAMPORTS"||
    !(p.network.cluster==="localnet"?["localnet","local_sim"].includes(s.network):s.network===p.network.cluster)||
    typeof s.openingCutoff!=="string"||!s.openingCutoff||typeof s.closingCutoff!=="string"||!s.closingCutoff||s.openingCutoff===s.closingCutoff){
   add("REPORT_LINK_SCOPE_CONFLICT",a.archive_id);continue;
  }
  links.set(a.archive_id,{archive_id:a.archive_id,report_digest:v.report_digest,opening_cutoff:s.openingCutoff,closing_cutoff:s.closingCutoff,reviews:[]});
 }
 for(const a of scoped.filter(x=>reviewKinds.includes(x.kind)||x.kind==="ORDER_RECEIPT_REVIEW")){
  const v=a.payload,link=links.get(a.kind==="ORDER_RECEIPT_REVIEW"?v.archive_id:v.report_link_archive_id);
  if(!link||v.report_digest!==link.report_digest){add("REVIEW_REPORT_LINK_CONFLICT",a.archive_id);continue;}
  link.reviews.push({kind:a.kind,archive_id:a.archive_id,status:v.status});
  if(v.status==="REVIEW_REQUIRED"||v.rpc_observation?.status==="REVIEW_REQUIRED")add("LINKED_REVIEW_CONFLICT",a.archive_id);
 }
 const intervals=[...links.values()].map(l=>({...l,reviews:l.reviews.sort((a,b)=>a.archive_id.localeCompare(b.archive_id,"en"))}));
 const scopeDigests=new Map();
 for(const l of intervals){
  const key=JSON.stringify([l.opening_cutoff,l.closing_cutoff]);
  if(!scopeDigests.has(key))scopeDigests.set(key,new Set());
  scopeDigests.get(key).add(l.report_digest);
 }
 const multipleVersions=[...scopeDigests.values()].filter(s=>s.size>1).length;
 if(multipleVersions)add("MULTIPLE_REPORT_DIGESTS_FOR_INTERVAL",null);
 const receipts=allOrders.map(o=>{
  const stale=!current(p,o);
  const matches=scoped.filter(a=>a.kind==="ORDER_RECEIPT_REVIEW"&&a.payload.order_id===o.order_id&&a.payload.order_revision===o.revision&&a.payload.order_head_hash===o.head_hash&&a.payload.signature===o.signature);
  const conflict=o.status==="REVIEW_REQUIRED"||matches.some(a=>a.payload.status==="REVIEW_REQUIRED"||a.payload.rpc_observation?.status==="REVIEW_REQUIRED");
  const linked=matches.filter(a=>links.get(a.payload.archive_id)?.report_digest===a.payload.report_digest&&hex(a.payload.report_digest));
  const status=conflict?"REVIEW_REQUIRED":stale?"STALE":!terminal.has(o.status)?"UNRESOLVED":
    linked.some(a=>a.payload.status==="INTERNAL_MATCH"&&a.payload.rpc_observation?.status==="DECLARED_SAMPLE_MATCH")?"DECLARED_SAMPLE_MATCH":"EVIDENCE_INCOMPLETE";
  if(conflict)add("ORDER_REVIEW_CONFLICT",o.order_id);
  return {order_id:o.order_id,recorded_status:o.status,project_revision:o.project_revision,order_revision:o.revision,stale,status,receipt_review_count:matches.length};
 });
 const lifecycle=describeProjectLifecycleEvidence(p,archives,orders),risk=describeProjectRiskReview(p,archives,orders);
 const section=(kind)=>({linked_report_count:intervals.filter(x=>x.reviews.some(r=>r.kind===kind)).length,
  review_count:intervals.reduce((n,x)=>n+x.reviews.filter(r=>r.kind===kind).length,0),
  status:intervals.some(x=>x.reviews.some(r=>r.kind===kind&&r.status==="REVIEW_REQUIRED"))?"REVIEW_REQUIRED":
    intervals.some(x=>x.reviews.some(r=>r.kind===kind))?"DECLARED_EVIDENCE_PRESENT":"MISSING"});
 const treasury=section("TREASURY_REVIEW"),market=section("MARKET_EVIDENCE_REVIEW"),close=section("PROJECT_CLOSE_REVIEW");
 const gates=[
  {id:"project_identity",status:p.token.mint&&p.network.genesis_hash?"DECLARED_PRESENT":"MISSING"},
  {id:"linked_closed_interval",status:intervals.length?"DECLARED_PRESENT":"MISSING"},
  {id:"treasury_review",status:treasury.status},{id:"market_review",status:market.status},
  {id:"order_evidence",status:receipts.length?"DECLARED_RECORDS_PRESENT":"MISSING"},
  ...["independent_genesis_check","retained_finalized_history","independent_account_ownership","independent_financial_parity","real_browser_acceptance","load_and_recovery_acceptance"].map(id=>({id,status:"NOT_RUN"}))
 ];
 return {schema_version:"cook-project-business-review.1",project_id:p.project_id,project_revision:p.revision,recorded_stage:p.lifecycle.stage,
  status:findings.length||risk.status==="REVIEW_REQUIRED"?"REVIEW_REQUIRED":"EVIDENCE_INCOMPLETE",
  treasury:{...treasury,project_wide_total:null,live_balance:null},market:{...market,live_market_assessed:false},close,
  orders:{record_count:receipts.length,unresolved_count:receipts.filter(r=>!["DECLARED_SAMPLE_MATCH"].includes(r.status)).length,records:receipts},
  risk:{...risk.counts,status:risk.status},lifecycle:{recorded_stage:lifecycle.recorded_stage,blockers:lifecycle.blockers},
  intervals,findings,data_integration:{status:"EXTERNAL_ACCEPTANCE_PENDING",gates,real_data_connected:false,source_attestation:"UNKNOWN"},
  source_attestation:"UNKNOWN",lifecycle_mutated:false,settlement_allowed:false,execution_enabled:false};
}
