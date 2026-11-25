import {assertProjectAggregate} from "./project-aggregate.mjs";
import {matchProjectReport} from "./project-report-identity.mjs";
import {buildProjectFinancialCloseReview} from "./project-financial-close-review.mjs";
import {loadLinkedReport} from "./order-receipt-review.mjs";
import {createHash} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";
const sha=x=>createHash("sha256").update(canonicalJson(x),"utf8").digest("hex");
/** Closed interval audit only. Does not prove exit, authorize settlement, or
 * prescribe asset disposal. Outstanding assets are disclosed, not liquidated. */
export function reviewProjectCloseEvidence(projectInput,input,orders=[],archives=[]){
 const p=assertProjectAggregate(projectInput);
 if(matchProjectReport(p,input).status!=="DECLARED_MATCH")throw Error("PROJECT_REPORT_IDENTITY_MISMATCH");
 const f=buildProjectFinancialCloseReview(input);
 const blockers=[],unknown=[];
 const all=orders.filter(o=>o.project_id===p.project_id);
 const unresolved=all.filter(o=>o.stale||!["REPORTED_SUCCESS","REPORTED_FAILURE"].includes(o.status));
 if(unresolved.length)blockers.push("ORDER_RECORDS_UNRESOLVED");
 const matching=all.filter(o=>!unresolved.includes(o));
 const reviewArchives=archives.filter(a=>a.kind==="ORDER_RECEIPT_REVIEW"&&a.project_id===p.project_id&&a.project_revision===p.revision&&!a.stale&&a.payload?.source_attestation==="UNKNOWN");
 const unmatched=matching.filter(o=>{
  const rows=reviewArchives.filter(a=>a.payload.order_id===o.order_id&&a.payload.order_revision===o.revision&&a.payload.order_head_hash===o.head_hash&&a.payload.signature===o.signature);
  return !rows.some(a=>a.payload.status==="INTERNAL_MATCH"&&a.payload.rpc_observation?.status==="DECLARED_SAMPLE_MATCH")||rows.some(a=>a.payload.status==="REVIEW_REQUIRED"||a.payload.rpc_observation?.status==="REVIEW_REQUIRED");
 });
 if(unmatched.length)unknown.push("ORDER_RECEIPT_REVIEW_INCOMPLETE");
 if(!all.length)unknown.push("ORDER_COVERAGE_UNATTESTED");
 if(f.status==="REVIEW_REQUIRED")blockers.push("FINANCIAL_REPORT_REVIEW_REQUIRED");
 if(f.cash_flow.closing_cash_difference_base_units===null)unknown.push("CASH_DIFFERENCE_UNKNOWN");
 else if(f.cash_flow.closing_cash_difference_base_units!=="0")blockers.push("CASH_DIFFERENCE_NONZERO");
 const residuals=[
  ["TOKEN_INVENTORY",f.assets.closing_token_quantity_base_units],
  ["CREATOR_RECEIVABLE",f.creator_receivables.closing_receivable_base_units],
  ["OTHER_ASSETS",f.assets.closing_other_assets_base_units],
  ["LIABILITIES",f.assets.closing_liabilities_base_units]
 ].map(([kind,value])=>({kind,value,status:value===null?"UNKNOWN":BigInt(value)===0n?"DECLARED_ZERO":"OUTSTANDING_RECORDED"}));
 for(const x of residuals){if(x.status==="UNKNOWN")unknown.push(x.kind+"_UNKNOWN");else if(x.status==="OUTSTANDING_RECORDED")blockers.push(x.kind+"_OUTSTANDING");}
 const evidence=f.review_checks.find(c=>c.id==="archived_evidence");
 if(evidence?.status!=="PASS")unknown.push("ARCHIVED_ACCOUNT_EVIDENCE_INCOMPLETE");
 if(p.lifecycle.operational_status==="REVIEW_REQUIRED")blockers.push("PROJECT_REVIEW_REQUIRED");
 if(!["EXIT_IN_PROGRESS","SETTLEMENT_PENDING","CLOSED","ARCHIVED"].includes(p.lifecycle.stage))unknown.push("EXIT_NOT_RECORDED");
 unknown.push("INDEPENDENT_SOURCE_OWNERSHIP_AND_VALUATION_UNATTESTED","PROJECT_WIDE_ACCOUNT_COVERAGE_UNATTESTED");
 return {schema_version:"cook-project-close-evidence.1",project_id:p.project_id,project_revision:p.revision,report_digest:sha(input),recorded_stage:p.lifecycle.stage,status:blockers.length?"REVIEW_REQUIRED":"PARTIAL",
  financial_status:f.status,scope:f.scope,cash_difference_base_units:f.cash_flow.closing_cash_difference_base_units,
  residuals,orders:{recorded:all.length,unresolved:unresolved.length,review_incomplete:unmatched.length},
  blockers,unknown,source_attestation:"UNKNOWN",ownership_attestation:"UNKNOWN",valuation_attestation:"UNKNOWN",settlement_allowed:false,lifecycle_mutated:false,execution_enabled:false};
}
export function createProjectCloseReviewer({path,enabled}={}){
 return (project,link,orders,archives)=>{
  if(!enabled)throw Error("WORKSPACE_DISABLED");
  return {...reviewProjectCloseEvidence(project,loadLinkedReport(project,link,path),orders,archives),report_link_archive_id:link.archive_id};
 };
}
