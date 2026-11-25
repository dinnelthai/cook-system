import {assertProjectAggregate,PROJECT_STAGES} from "./project-aggregate.mjs";
/** Retrospective evidence coverage, never an executable lifecycle transition.
 * Archived observations are declarations from a configured source, not independent verification. */
export function describeProjectLifecycleEvidence(projectInput,archive,orders=[]){
 const p=assertProjectAggregate(projectInput);
 const scoped=archive.filter(a=>a.project_id===p.project_id&&a.project_revision===p.revision&&a.stale===false&&a.payload?.project_id===p.project_id&&a.payload?.project_revision===p.revision&&a.payload.source_attestation==="UNKNOWN"&&a.payload.execution_enabled===false);
 const stale=archive.filter(a=>a.project_id===p.project_id&&a.project_revision!==p.revision).length;
 function summarize(kind,match){
  const rows=scoped.filter(a=>a.kind===kind&&match(a.payload));
  const status=rows.some(a=>a.payload.status==="REVIEW_REQUIRED")?"REVIEW_REQUIRED":rows.some(a=>a.payload.status==="OBSERVATIONS_MATCH")?"OBSERVED_NOT_ATTESTED":rows.length?"UNKNOWN":"MISSING";
  return {status,archive_ids:rows.map(a=>a.archive_id)};
 }
 const issuance=summarize("ISSUANCE_OBSERVATION",v=>Boolean(p.token.mint&&p.token.issuance_signature)&&v.mint===p.token.mint&&v.signature===p.token.issuance_signature);
 const markets=p.markets.map(m=>({market_id:m.market_id,venue:m.venue,registered_verification_status:m.verification_status,
  ...summarize("MARKET_OBSERVATION",v=>v.market_id===m.market_id&&v.market_account===m.market_account&&v.identity_digest===m.identity_digest&&v.venue===m.venue)}));
 function venueStatus(venue){
  const entries=markets.filter(m=>m.venue===venue);
  if(entries.some(m=>m.status==="REVIEW_REQUIRED"))return "REVIEW_REQUIRED";
  if(entries.some(m=>m.status==="OBSERVED_NOT_ATTESTED"))return "OBSERVED_NOT_ATTESTED";
  return entries.length?"UNKNOWN":"MISSING";
 }
 const currentOrders=orders.filter(o=>o.project_id===p.project_id&&o.project_revision===p.revision&&o.stale===false);
 const blockers=[];
 if(issuance.status!=="OBSERVED_NOT_ATTESTED")blockers.push("ISSUANCE_EVIDENCE_"+issuance.status);
 if(venueStatus("PUMP_BONDING_CURVE")!=="OBSERVED_NOT_ATTESTED")blockers.push("CURVE_IDENTITY_"+venueStatus("PUMP_BONDING_CURVE"));
 if(currentOrders.some(o=>["REVIEW_REQUIRED","OUTCOME_UNKNOWN","RECORDED"].includes(o.status)))blockers.push("ORDER_EVIDENCE_UNRESOLVED");
 if(p.lifecycle.operational_status==="REVIEW_REQUIRED")blockers.push("PROJECT_REVIEW_REQUIRED");
 blockers.push("INDEPENDENT_ATTESTATION_UNAVAILABLE");
 const steps=PROJECT_STAGES.map(stage=>({stage,recorded:stage===p.lifecycle.stage?"CURRENT":"NOT_CURRENT",evidence_status:
  stage==="LAUNCHED"?issuance.status:stage==="BONDING_CURVE_ACTIVE"?venueStatus("PUMP_BONDING_CURVE"):
  stage==="PUMPSWAP_ACTIVE"?venueStatus("PUMP_SWAP"):"NOT_ASSESSED"}));
 return {schema_version:"cook-project-lifecycle-evidence.1",project_id:p.project_id,project_revision:p.revision,recorded_stage:p.lifecycle.stage,operational_status:p.lifecycle.operational_status,issuance,markets,steps,stale_archive_count:stale,
  report_link_count:scoped.filter(a=>a.kind==="HISTORICAL_REPORT_LINK"&&a.payload.status==="DECLARED_MATCH").length,
  order_review_count:currentOrders.length,blockers,source_attestation:"UNKNOWN",lifecycle_mutated:false,settlement_allowed:false,execution_enabled:false};
}
