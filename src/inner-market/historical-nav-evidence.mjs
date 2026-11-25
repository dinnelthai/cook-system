import {parseBaseUnits,U128_MAX} from "../core/integer.mjs";
const amount=(v,n)=>parseBaseUnits(v,{name:n,max:U128_MAX});
const core=["projectId","quoteAsset","tokenMint","openingCutoff","closingCutoff"];
const extended=["network","genesisHash","wallet","tokenAccount"];
const fields=["cutoff","sequence","cashBaseUnits","tokenAmountBaseUnits","inventoryValueBaseUnits","receivableBaseUnits","liabilitiesBaseUnits","otherAssetsBaseUnits"];
const result=(status,issues)=>({status,issues,source_attestation:"UNKNOWN",valuation_attestation:"UNKNOWN",intermediate_valuations_verified:false});

/** Offline endpoint balance-sheet arithmetic only. Supplied values are not
 * independently authenticated, and no valuation or forward quote is generated. */
export function auditHistoricalNavEndpoints({scope,nav,cash,inventory,creator}){
 const evidence=nav.endpointEvidence;
 if(evidence==null)return result("UNAVAILABLE",["NAV_ENDPOINT_EVIDENCE_MISSING"]);
 if(evidence.schema_version!=="cook-nav-endpoints.1"||!evidence.scope||
    !core.every(k=>evidence.scope[k]===scope[k])||
    extended.some(k=>Object.hasOwn(scope,k)&&evidence.scope[k]!==scope[k]))
   throw Error("NAV_ENDPOINT_SCOPE_MISMATCH");
 const issues=[];
 const snapshots=nav.snapshots;
 if(snapshots.length<2)return result("REVIEW_REQUIRED",["NAV_ENDPOINT_INTERVAL_MISSING"]);
 const checks=[
  ["OPENING",evidence.opening,snapshots[0],scope.openingCutoff,cash.openingCashBaseUnits??"0",inventory.opening.tokens,creator.openingReceivableBaseUnits],
  ["CLOSING",evidence.closing,snapshots.at(-1),scope.closingCutoff,cash.observedClosingCashBaseUnits,inventory.closing.tokens,creator.observedClosingReceivableBaseUnits]
 ];
 for(const [label,row,snapshot,cutoff,cashAmount,tokens,receivables] of checks){
  if(!row||typeof row!=="object"||Array.isArray(row)){issues.push("NAV_ENDPOINT_FIELDS_MISSING:"+label);continue;}
  if(!fields.every(k=>Object.hasOwn(row,k)&&row[k]!=null))issues.push("NAV_ENDPOINT_FIELDS_MISSING:"+label);
  if(row.cutoff!==cutoff||row.sequence!==snapshot.sequence){issues.push("NAV_ENDPOINT_POSITION_MISMATCH:"+label);continue;}
  if([cashAmount,tokens,receivables].some(v=>v==null))issues.push("NAV_ENDPOINT_LEDGER_MISSING:"+label);
  function known(value,field){
   if(value==null)return null;
   try{return amount(value,field);}catch{issues.push("NAV_ENDPOINT_AMOUNT_INVALID:"+label+":"+field);return null;}
  }
  const c=known(row.cashBaseUnits,"cash"),q=known(row.tokenAmountBaseUnits,"tokens"),
   v=known(row.inventoryValueBaseUnits,"inventory_value"),r=known(row.receivableBaseUnits,"receivables"),
   l=known(row.liabilitiesBaseUnits,"liabilities"),o=known(row.otherAssetsBaseUnits,"other_assets");
  const ledgerCash=known(cashAmount,"ledger_cash"),ledgerTokens=known(tokens,"ledger_tokens"),ledgerReceivable=known(receivables,"ledger_receivables");
  if(c!==null&&ledgerCash!==null&&c!==ledgerCash)issues.push("NAV_ENDPOINT_CASH_MISMATCH:"+label);
  if(q!==null&&ledgerTokens!==null&&q!==ledgerTokens)issues.push("NAV_ENDPOINT_TOKEN_MISMATCH:"+label);
  if(r!==null&&ledgerReceivable!==null&&r!==ledgerReceivable)issues.push("NAV_ENDPOINT_RECEIVABLE_MISMATCH:"+label);
  if(q===0n&&v!==null&&v!==0n)issues.push("NAV_ENDPOINT_VALUE_WITHOUT_INVENTORY:"+label);
  const reported=known(snapshot.navAfterFlowBaseUnits,"reported_nav");
  if([c,v,r,o,l,reported].every(x=>x!==null)&&c+v+r+o-l!==reported)issues.push("NAV_ENDPOINT_IDENTITY_MISMATCH:"+label);
 }
 return result(issues.length?"REVIEW_REQUIRED":"INTERNALLY_CONSISTENT",issues);
}
