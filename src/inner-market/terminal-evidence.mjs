import {auditArchivedCashPostings} from "./archived-cash-crosscheck.mjs";
import {parseBaseUnits,U128_MAX} from "../core/integer.mjs";
const amount=v=>parseBaseUnits(v,{name:"report snapshot",max:U128_MAX});
const nonempty=v=>typeof v==="string"&&v.length>0&&v.length<=256&&v.trim()===v;

/** Recompute raw archived evidence, never import a claimed audit result.
 * One Localnet account scope only. A matched report remains unauthenticated.
 */
export function auditTerminalEvidence(input){
 const e=input?.archivedEvidence;
 if(e==null)return {status:"UNAVAILABLE",account_audit:null,cash_audit:null,issues:[],source_attestation:"UNKNOWN"};
 if(input.sourceMode!=="ARCHIVED_HISTORICAL"||e.schema_version!=="cook-terminal-evidence.1")throw Error("UNSUPPORTED_TERMINAL_EVIDENCE");
 if(Object.keys(e).some(k=>!["schema_version","accountInterval"].includes(k)))throw Error("UNEXPECTED_EVIDENCE_FIELD");
 const s=input.scope,a=e.accountInterval?.scope;
 if(!a||s.network!=="localnet"||s.quoteAsset!=="SOL_LAMPORTS"||!["genesisHash","wallet","tokenAccount"].every(k=>nonempty(s[k])&&s[k]===a[k])||a.mint!==s.tokenMint||s.openingCutoff!=="slot:"+a.openingSlot||s.closingCutoff!=="slot:"+a.closingSlot)throw Error("TERMINAL_EVIDENCE_SCOPE_MISMATCH");
 for(const section of [input.cash,input.inventory,input.creator,input.nav,input.market]){
  if(!["network","genesisHash","wallet","tokenAccount"].every(k=>section.scope?.[k]===s[k]))throw Error("TERMINAL_SECTION_SCOPE_MISMATCH");
 }
 // Reject contradictions in nested accounting scopes. Older NAV rows do
 // not carry all scope fields, so absent optional labels remain unauthenticated.
 const core=["projectId","quoteAsset","tokenMint","openingCutoff","closingCutoff"];
 const extended=["network","genesisHash","wallet","tokenAccount"];
 const scopedRows=[input.inventory.opening.scope,input.inventory.closing.scope,input.inventory.tradeSummary.scope,...input.inventory.adjustments.map(x=>x.scope)];
 for(const row of scopedRows){
  if(!row||!core.every(k=>row[k]===s[k])||extended.some(k=>Object.hasOwn(row,k)&&row[k]!==s[k]))throw Error("TERMINAL_NESTED_SCOPE_MISMATCH");
 }
 for(const row of [...input.cash.entries,...input.creator.entries,...input.nav.snapshots,...input.market.trades]){
  if(!row||[...core,...extended].some(k=>Object.hasOwn(row,k)&&row[k]!==s[k]))throw Error("TERMINAL_ROW_SCOPE_MISMATCH");
 }
 const postings=input.cash.entries.map(p=>{
  if(!nonempty(p.signature))throw Error("MISSING_POSTING_SIGNATURE");
  for(const [k,v] of Object.entries({genesisHash:s.genesisHash,wallet:s.wallet,openingSlot:a.openingSlot,closingSlot:a.closingSlot})){
   if(Object.hasOwn(p,k)&&p[k]!==v)throw Error("TERMINAL_POSTING_SCOPE_MISMATCH");
  }
  return {...p,genesisHash:s.genesisHash,wallet:s.wallet,openingSlot:a.openingSlot,closingSlot:a.closingSlot};
 });
 const cash=auditArchivedCashPostings({accountInterval:e.accountInterval,projectId:s.projectId,postings,cashHistoryComplete:input.cash.historyComplete});
 const account=cash.account_audit;
 const issues=[];
 if(cash.status!=="AMOUNTS_INTERNALLY_CONSISTENT")issues.push("RECEIPT_CASH_REVIEW");
 for(const [code,expected,observed] of [
  ["REPORT_OPENING_CASH_MISMATCH",input.cash.openingCashBaseUnits,account.native.opening_lamports],
  ["REPORT_CLOSING_CASH_MISMATCH",input.cash.observedClosingCashBaseUnits,account.native.observed_closing_lamports],
  ["REPORT_OPENING_TOKEN_MISMATCH",input.inventory.opening.tokens,account.token.opening_base_units],
  ["REPORT_CLOSING_TOKEN_MISMATCH",input.inventory.closing.tokens,account.token.observed_closing_base_units]
 ]){
  if(expected==null||amount(expected)!==amount(observed))issues.push(code);
 }
 return {status:issues.length?"REVIEW_REQUIRED":"INTERNALLY_CONSISTENT",account_audit:account,cash_audit:cash,issues,source_attestation:"UNKNOWN"};
}
