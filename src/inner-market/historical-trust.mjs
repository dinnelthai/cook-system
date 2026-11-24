// Presentation metadata for offline reports. Never an authorization decision.
const entry=(status,reasons=[])=>({status,reasons,independent_attestation:"UNKNOWN"});
export function describeHistoricalTrust({sourceMode,ready,checks,navEndpoints,tradeEvidence,costBasisEvidence,archivedEvidence}){
 if(!["SYNTHETIC","ARCHIVED_HISTORICAL"].includes(sourceMode)||typeof ready!=="boolean")throw Error("INVALID_TRUST_CONTEXT");
 const review=checks.filter(x=>x.status==="REVIEW").map(x=>x.id);
 const unknown=checks.filter(x=>x.status==="UNKNOWN"||x.status==="UNAVAILABLE").map(x=>x.id);
 const sample=sourceMode==="SYNTHETIC";
 const group=(available,reasons)=>entry(!ready?"REVIEW_REQUIRED":!available?"UNAVAILABLE":sample?"SYNTHETIC_ONLY":"PROVISIONAL",reasons);
 return {schema_version:"cook-historical-trust.1",grade:ready?"D3":"D2",
  status:ready?"INTERNALLY_CONSISTENT":"REVIEW_REQUIRED",
  source_mode:sourceMode,independent_attestation:"UNKNOWN",historical_settlement_certified:false,
  review_checks:review,unresolved_checks:unknown,
  metrics:{
   cash_balance:group(true,archivedEvidence.status==="INTERNALLY_CONSISTENT"?[]:["RECEIPT_EVIDENCE_INCOMPLETE"]),
   inventory_quantity:group(true,["OWNERSHIP_UNATTESTED"]),
   cost_basis:group(true,[costBasisEvidence.status,"ALLOCATION_UNATTESTED"]),
   realized_pnl:group(true,[tradeEvidence.status,"ECONOMIC_CLASSIFICATION_UNATTESTED","ALLOCATION_UNATTESTED"]),
   nav_endpoints:group(sample||navEndpoints.status==="INTERNALLY_CONSISTENT",["VALUATION_UNATTESTED"]),
   historical_performance:group(sample,sample?[]:["TIME_SERIES_VALUATION_UNAVAILABLE"])
  }};
}
