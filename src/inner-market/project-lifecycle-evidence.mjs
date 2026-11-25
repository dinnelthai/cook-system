import {assertProjectAggregate,PROJECT_STAGES} from "./project-aggregate.mjs";
import {evidenceApplicable,archiveApplicable} from "./project-evidence-scope.mjs";
/** Retrospective evidence coverage, never an executable lifecycle transition.
 * Archived observations are declarations from a configured source, not independent verification. */
export function describeProjectLifecycleEvidence(projectInput,archive,orders=[]){
 const p=assertProjectAggregate(projectInput);
 const scoped=archive.filter(a=>archiveApplicable(p,a));
 const stale=archive.filter(a=>a.project_id===p.project_id&&!evidenceApplicable(p,a)).length;
 const scopeConflicts=archive.filter(a=>evidenceApplicable(p,a)&&!scoped.includes(a));
 const issuanceIdentity=v=>Boolean(p.token.mint&&p.token.issuance_signature)&&v.mint===p.token.mint&&v.signature===p.token.issuance_signature;
 const marketIdentity=(v,m)=>v.market_id===m.market_id&&v.market_account===m.market_account&&v.identity_digest===m.identity_digest&&v.venue===m.venue;
 const identityConflicts=scoped.filter(a=>a.kind==="ISSUANCE_OBSERVATION"?!issuanceIdentity(a.payload):
  a.kind==="MARKET_OBSERVATION"?!p.markets.some(m=>marketIdentity(a.payload,m)):false);
 const evidence_conflicts=[...scopeConflicts.map(a=>({archive_id:a.archive_id,code:"CURRENT_ARCHIVE_SCOPE_CONFLICT"})),
  ...identityConflicts.map(a=>({archive_id:a.archive_id,code:"CURRENT_OBSERVATION_IDENTITY_CONFLICT"}))];
 function summarize(kind,match){
  const rows=scoped.filter(a=>a.kind===kind&&match(a.payload));
  const status=rows.some(a=>a.payload.status==="REVIEW_REQUIRED")?"REVIEW_REQUIRED":rows.some(a=>a.payload.status==="OBSERVATIONS_MATCH")?"OBSERVED_NOT_ATTESTED":rows.length?"UNKNOWN":"MISSING";
  return {status,archive_ids:rows.map(a=>a.archive_id)};
 }
 const issuance=summarize("ISSUANCE_OBSERVATION",issuanceIdentity);
 const invalidIssuance=identityConflicts.filter(a=>a.kind==="ISSUANCE_OBSERVATION");
 if(invalidIssuance.length){issuance.status="REVIEW_REQUIRED";issuance.archive_ids.push(...invalidIssuance.map(a=>a.archive_id));}
 const markets=p.markets.map(m=>({market_id:m.market_id,venue:m.venue,registered_verification_status:m.verification_status,
  ...summarize("MARKET_OBSERVATION",v=>marketIdentity(v,m))})).map(m=>{
  const conflicts=identityConflicts.filter(a=>a.kind==="MARKET_OBSERVATION"&&a.payload.market_id===m.market_id);
  return conflicts.length?{...m,status:"REVIEW_REQUIRED",archive_ids:[...m.archive_ids,...conflicts.map(a=>a.archive_id)]}:m;
 });
 function venueStatus(venue){
  const entries=markets.filter(m=>m.venue===venue);
  if(entries.some(m=>m.status==="REVIEW_REQUIRED"))return "REVIEW_REQUIRED";
  if(entries.length&&entries.every(m=>m.status==="OBSERVED_NOT_ATTESTED"))return "OBSERVED_NOT_ATTESTED";
  return entries.length?"UNKNOWN":"MISSING";
 }
 const histories=scoped.filter(a=>a.kind==="GRADUATION_HISTORY_REVIEW");
 const historicalMilestones=["LAUNCHED","GRADUATION_PENDING","PUMPSWAP_ACTIVE"].map(stage=>{
  const rows=histories.flatMap(a=>(a.payload.milestones??[]).filter(m=>m.stage===stage).map(m=>({...m,archive_id:a.archive_id})));
  const status=rows.some(m=>m.status==="REVIEW_REQUIRED")?"REVIEW_REQUIRED":rows.some(m=>m.status==="REPLAY_MATCH_NOT_ATTESTED")?"REPLAY_MATCH_NOT_ATTESTED":rows.some(m=>m.status==="RECORDED_NOT_ATTESTED")?"RECORDED_NOT_ATTESTED":rows.some(m=>m.status==="MIGRATION_LINK_ONLY")?"MIGRATION_LINK_ONLY":rows.length?"UNKNOWN":"MISSING";
  return {stage,status,archive_ids:rows.map(m=>m.archive_id)};
 });
 const allCloseReviews=scoped.filter(a=>a.kind==="PROJECT_CLOSE_REVIEW");
 const closeReviews=allCloseReviews.filter(a=>!["STALE","UNKNOWN_LEGACY"].includes(a.evidence_snapshot_status));
 const closeEvidence={status:closeReviews.some(a=>a.payload.status==="REVIEW_REQUIRED"||(Array.isArray(a.payload.blockers)&&a.payload.blockers.length>0))?"REVIEW_REQUIRED":closeReviews.length?"PARTIAL":"MISSING",
  archive_ids:closeReviews.map(a=>a.archive_id),blockers:[...new Set(closeReviews.flatMap(a=>a.payload.blockers??[]))],unknown:[...new Set(closeReviews.flatMap(a=>a.payload.unknown??[]))]};
 const allOrders=orders.filter(o=>o.project_id===p.project_id);
 const currentOrders=allOrders.filter(o=>evidenceApplicable(p,o));
 const staleOrders=allOrders.filter(o=>!currentOrders.includes(o));
 const unresolvedOrders=allOrders.filter(o=>!["REPORTED_SUCCESS","REPORTED_FAILURE"].includes(o.status));
 const blockers=[...new Set(evidence_conflicts.map(x=>x.code))];
 if(issuance.status!=="OBSERVED_NOT_ATTESTED")blockers.push("ISSUANCE_EVIDENCE_"+issuance.status);
 if(venueStatus("PUMP_BONDING_CURVE")!=="OBSERVED_NOT_ATTESTED")blockers.push("CURVE_IDENTITY_"+venueStatus("PUMP_BONDING_CURVE"));
 if(unresolvedOrders.length)blockers.push("ORDER_EVIDENCE_UNRESOLVED");
 if(staleOrders.length)blockers.push("STALE_ORDER_EVIDENCE");
 const swapStatus=venueStatus("PUMP_SWAP");
 if(swapStatus==="REVIEW_REQUIRED")blockers.push("PUMPSWAP_IDENTITY_REVIEW_REQUIRED");
 else if(p.lifecycle.stage==="PUMPSWAP_ACTIVE"&&swapStatus!=="OBSERVED_NOT_ATTESTED")blockers.push("PUMPSWAP_IDENTITY_"+swapStatus);
 if(p.lifecycle.operational_status==="REVIEW_REQUIRED")blockers.push("PROJECT_REVIEW_REQUIRED");
 if(closeEvidence.status==="REVIEW_REQUIRED")blockers.push("PROJECT_CLOSE_REVIEW_REQUIRED");
 if(allCloseReviews.length!==closeReviews.length)blockers.push("CLOSE_EVIDENCE_SNAPSHOT_OUTDATED_OR_UNKNOWN");
 if(historicalMilestones.some(m=>m.status==="REVIEW_REQUIRED"))blockers.push("GRADUATION_HISTORY_CONFLICT");
 blockers.push("INDEPENDENT_ATTESTATION_UNAVAILABLE");
 const steps=PROJECT_STAGES.map(stage=>({stage,recorded:stage===p.lifecycle.stage?"CURRENT":"NOT_CURRENT",evidence_status:
  stage==="LAUNCHED"?issuance.status:stage==="BONDING_CURVE_ACTIVE"?venueStatus("PUMP_BONDING_CURVE"):
  stage==="GRADUATION_PENDING"?historicalMilestones.find(m=>m.stage===stage).status:
  stage==="PUMPSWAP_ACTIVE"?swapStatus:
  ["SETTLEMENT_PENDING","CLOSED"].includes(stage)?closeEvidence.status:"NOT_ASSESSED"}));
 return {schema_version:"cook-project-lifecycle-evidence.1",project_id:p.project_id,project_revision:p.revision,recorded_stage:p.lifecycle.stage,operational_status:p.lifecycle.operational_status,issuance,markets,steps,historical_milestones:historicalMilestones,close_evidence:closeEvidence,stale_archive_count:stale,
  report_link_count:scoped.filter(a=>a.kind==="HISTORICAL_REPORT_LINK"&&a.payload.status==="DECLARED_MATCH").length,
  order_review_count:currentOrders.length,stale_order_count:staleOrders.length,unresolved_order_count:unresolvedOrders.length,evidence_conflicts,
  historical_stage_path_inferred:false,blockers,source_attestation:"UNKNOWN",lifecycle_mutated:false,settlement_allowed:false,execution_enabled:false};
}
