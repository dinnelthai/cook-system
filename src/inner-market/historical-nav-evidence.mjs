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
  if(!row||typeof row!=="object"||!fields.every(k=>Object.hasOwn(row,k))){issues.push("NAV_ENDPOINT_FIELDS_MISSING:"+label);continue;}
  if(row.cutoff!==cutoff||row.sequence!==snapshot.sequence){issues.push("NAV_ENDPOINT_POSITION_MISMATCH:"+label);continue;}
  if([cashAmount,tokens,receivables].some(v=>v==null)){issues.push("NAV_ENDPOINT_LEDGER_MISSING:"+label);continue;}
  const c=amount(row.cashBaseUnits,"endpoint cash"),q=amount(row.tokenAmountBaseUnits,"endpoint token quantity"),
   v=amount(row.inventoryValueBaseUnits,"supplied inventory value"),r=amount(row.receivableBaseUnits,"endpoint receivable"),
   l=amount(row.liabilitiesBaseUnits,"supplied liabilities"),o=amount(row.otherAssetsBaseUnits,"supplied other assets");
  if(c!==amount(cashAmount,"ledger cash"))issues.push("NAV_ENDPOINT_CASH_MISMATCH:"+label);
  if(q!==amount(tokens,"ledger tokens"))issues.push("NAV_ENDPOINT_TOKEN_MISMATCH:"+label);
  if(r!==amount(receivables,"ledger receivables"))issues.push("NAV_ENDPOINT_RECEIVABLE_MISMATCH:"+label);
  if(q===0n&&v!==0n)issues.push("NAV_ENDPOINT_VALUE_WITHOUT_INVENTORY:"+label);
  if(c+v+r+o-l!==amount(snapshot.navAfterFlowBaseUnits,"reported NAV"))issues.push("NAV_ENDPOINT_IDENTITY_MISMATCH:"+label);
 }
 return result(issues.length?"REVIEW_REQUIRED":"INTERNALLY_CONSISTENT",issues);
}
