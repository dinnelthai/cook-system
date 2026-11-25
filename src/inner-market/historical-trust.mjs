// Presentation metadata for offline reports. Never an authorization decision.
const entry=(status,reasons=[])=>({status,reasons,independent_attestation:"UNKNOWN"});
export function describeHistoricalTrust({sourceMode,ready,checks,navEndpoints,tradeEvidence,costBasisEvidence,archivedEvidence,accountSet=null}){
 if(!["SYNTHETIC","ARCHIVED_HISTORICAL"].includes(sourceMode)||typeof ready!=="boolean")throw Error("INVALID_TRUST_CONTEXT");
 const review=checks.filter(x=>x.status==="REVIEW").map(x=>x.id);
 const unknown=checks.filter(x=>x.status==="UNKNOWN"||x.status==="UNAVAILABLE").map(x=>x.id);
 const sample=sourceMode==="SYNTHETIC";
 // Coverage refers only to supplied evidence checks; no independent authentication.
 const evidenceChecks=checks.filter(c=>!["accounting","source_attestation","wallet_attribution","live_execution"].includes(c.id));
 const evidenceStatus=evidenceChecks.some(c=>c.status==="REVIEW")?"REVIEW_REQUIRED":evidenceChecks.length===0||evidenceChecks.some(c=>c.status!=="PASS")?"INCOMPLETE":"SUPPLIED_CHECKS_PASS";
 const dimensions={structure:"ACCEPTED_INPUT",internal_consistency:ready?"INTERNALLY_CONSISTENT":"REVIEW_REQUIRED",evidence_completeness:evidenceStatus,independent_coverage:"UNKNOWN",source_verification:"UNKNOWN",wallet_attribution:"UNKNOWN",settlement_eligibility:sample&&ready?"SYNTHETIC_TEST_ONLY":"BLOCKED",live_execution:"UNAVAILABLE"};
 const group=(available,reasons)=>entry(!ready?"REVIEW_REQUIRED":!available?"UNAVAILABLE":sample?"SYNTHETIC_ONLY":"PROVISIONAL",reasons);
 return {schema_version:"cook-historical-trust.1",grade:ready?"D3":"D2",
  status:ready?"INTERNALLY_CONSISTENT":"REVIEW_REQUIRED",
  source_mode:sourceMode,independent_attestation:"UNKNOWN",historical_settlement_certified:false,
  review_checks:review,unresolved_checks:unknown,dimensions,
  metrics:{
   cash_balance:group(true,archivedEvidence.status==="INTERNALLY_CONSISTENT"?[]:["RECEIPT_EVIDENCE_INCOMPLETE"]),
   inventory_quantity:group(true,["OWNERSHIP_UNATTESTED"]),
   closing_account_set:group(accountSet?.status==="INTERNALLY_CONSISTENT",["ACCOUNT_SET_COMPLETENESS_UNATTESTED","OWNERSHIP_UNATTESTED"]),
   cost_basis:{...group(true,[costBasisEvidence.status,"ALLOCATION_UNATTESTED"]),
    supplied_replay_status:costBasisEvidence.status,coverage_status:costBasisEvidence.status==="INTERNALLY_CONSISTENT"?"SUPPLIED_REPLAY_MATCH":costBasisEvidence.status==="REVIEW_REQUIRED"?"REVIEW_REQUIRED":"INCOMPLETE",
    independent_verification:"UNKNOWN"},
   realized_pnl:{...group(true,[tradeEvidence.status,costBasisEvidence.status,"ECONOMIC_CLASSIFICATION_UNATTESTED","ALLOCATION_UNATTESTED"]),
    coverage_status:tradeEvidence.status==="REVIEW_REQUIRED"||costBasisEvidence.status==="REVIEW_REQUIRED"?"REVIEW_REQUIRED":
     tradeEvidence.status==="INTERNALLY_CONSISTENT"&&costBasisEvidence.status==="INTERNALLY_CONSISTENT"?"SUPPLIED_CHECKS_MATCH":"INCOMPLETE",
    independent_verification:"UNKNOWN"},
   nav_endpoints:group(sample||navEndpoints.status==="INTERNALLY_CONSISTENT",["VALUATION_UNATTESTED"]),
   historical_performance:group(sample,sample?[]:["TIME_SERIES_VALUATION_UNAVAILABLE"])
  }};
}
