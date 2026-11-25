const signed=v=>typeof v==="string"&&v.length<=160&&/^(0|-?[1-9][0-9]*)$/.test(v);
const unsigned=v=>signed(v)&&!v.startsWith("-");
const fields=[["cash","cashBaseUnits"],["token_quantity","tokenAmountBaseUnits"],["inventory_cost","costBasisBaseUnits"],
 ["inventory_value","inventoryValueBaseUnits"],["creator_receivable","receivableBaseUnits"],["liabilities","liabilitiesBaseUnits"],["other_assets","otherAssetsBaseUnits"],["nav","navBaseUnits"]];
/** Compare canonical account-set audit outputs to canonical project totals.
 * Does not add wallets, derive balances, infer ownership or select positions.
 * All inputs are from one linked historical report interval. */
export function reconcileRuntimeAccountCoverage(assets,archives){
 const checks=[],issues=[],unknown=[];
 const states=archives.map(a=>a.payload.account_set);
 const status=states.some(s=>s?.status==="REVIEW_REQUIRED")?"REVIEW_REQUIRED":
  states.length&&states.every(s=>s?.status==="INTERNALLY_CONSISTENT")?"DECLARED_ACCOUNT_TOTALS_PRESENT":"INCOMPLETE";
 if(status==="REVIEW_REQUIRED")issues.push("ACCOUNT_SET_REVIEW_REQUIRED");
 const labels=states.length&&states.every(s=>s?.coverage?.status==="DECLARED_LABELS_MATCH")?"DECLARED_LABELS_MATCH":
  states.some(s=>s?.coverage?.status==="LABEL_SET_DIFFERS")?"LABEL_SET_DIFFERS":"UNKNOWN";
 if(labels!=="DECLARED_LABELS_MATCH")unknown.push("REGISTERED_LABEL_COVERAGE_INCOMPLETE");
 for(const [field,key] of fields){
  const projectValue=assets[field],valid=field==="nav"?signed:unsigned;
  const values=states.map(s=>s?.status==="INTERNALLY_CONSISTENT"?s.totals?.[key]:null);
  const known=values.filter(v=>v!=null);
  const invalid=known.some(v=>!valid(v))||(projectValue!=null&&!valid(projectValue));
  const conflict=invalid||new Set(known).size>1||(projectValue!=null&&known.some(v=>v!==projectValue));
  const result=conflict?"REVIEW_REQUIRED":projectValue!=null&&states.length&&known.length===states.length?"DECLARED_MATCH":"UNKNOWN";
  if(conflict)issues.push("ACCOUNT_PROJECT_TOTAL_CONFLICT:"+field);
  else if(result==="UNKNOWN")unknown.push("ACCOUNT_PROJECT_TOTAL_INCOMPLETE:"+field);
  checks.push({field,status:result,project_value:result==="DECLARED_MATCH"?projectValue:null,
    account_total:result==="DECLARED_MATCH"?known[0]:null});
 }
 return {status:issues.length?"REVIEW_REQUIRED":checks.every(c=>c.status==="DECLARED_MATCH")&&labels==="DECLARED_LABELS_MATCH"?"DECLARED_MATCH":"INCOMPLETE",
  canonical_account_status:status,registered_label_coverage:labels,checks,issues,unknown,ownership_attestation:"UNKNOWN",
  live_wallet_balance:null,project_wide_wallet_coverage_attested:false,execution_enabled:false};
}
