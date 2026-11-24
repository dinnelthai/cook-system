import {auditArchivedCashPostings} from "./archived-cash-crosscheck.mjs";
import {normalizeArchivedReceipt} from "./archived-account-audit.mjs";
import {parseBaseUnits,U128_MAX} from "../core/integer.mjs";
const amount=v=>parseBaseUnits(v,{name:"report snapshot",max:U128_MAX});
const nonempty=v=>typeof v==="string"&&v.length>0&&v.length<=256&&v.trim()===v;

/** Recompute raw archived evidence, never import a claimed audit result.
 * One Localnet account scope only. A matched report remains unauthenticated.
 */
export function auditTerminalEvidence(input){
 const e=input?.archivedEvidence;
 if(e==null)return {status:"UNAVAILABLE",account_audit:null,cash_audit:null,classification:{status:"UNAVAILABLE",issues:[],economic_classification_attestation:"UNKNOWN"},issues:[],source_attestation:"UNKNOWN"};
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
 // Test only declared trade postings against the existing scoped token receipt.
 // Do not infer income type, ownership, or capital purpose from a balance delta.
 const journal=new Map(input.inventory.ledger.position_journal.map(j=>[j.event_id,j]));
 const receipts=new Map(e.accountInterval.receipts.map(raw=>{const r=normalizeArchivedReceipt(raw,s.genesisHash);return [r.signature,r]}));
 const classificationIssues=[];
 let checked=0;
 for(const p of postings){
  if(!["TRADE_CASH_COST","TRADE_NET_RECEIPT"].includes(p.kind)||p.status!=="FINALIZED"||p.reconciliation!=="PASS")continue;
  const j=journal.get(p.tradeEventId),r=receipts.get(p.signature);
  if(!j||!r||r.outcome!=="SUCCESS"){classificationIssues.push("TRADE_RECEIPT_CLASSIFICATION_MISMATCH:"+p.id);continue;}
  const t=r.tokens.find(x=>x.address===s.tokenAccount&&x.owner===s.wallet&&x.mint===s.tokenMint);
  if(!t){classificationIssues.push("TRADE_RECEIPT_TOKEN_EVIDENCE_MISSING:"+p.id);continue;}
  const expected=amount(j.token_amount_base_units);
  const buy=p.kind==="TRADE_CASH_COST";
  if(j.side!==(buy?"BUY":"SELL")||expected===0n||t.after-t.before!==(buy?expected:-expected))classificationIssues.push("TRADE_RECEIPT_TOKEN_DELTA_MISMATCH:"+p.id);
  else checked++;
 }
 const classification={status:classificationIssues.length?"REVIEW_REQUIRED":"PARTIAL",issues:classificationIssues,trade_token_deltas_matched:checked,economic_classification_attestation:"UNKNOWN"};
 issues.push(...classificationIssues);
 if(cash.status!=="AMOUNTS_INTERNALLY_CONSISTENT")issues.push("RECEIPT_CASH_REVIEW");
 for(const [code,expected,observed] of [
  ["REPORT_OPENING_CASH_MISMATCH",input.cash.openingCashBaseUnits,account.native.opening_lamports],
  ["REPORT_CLOSING_CASH_MISMATCH",input.cash.observedClosingCashBaseUnits,account.native.observed_closing_lamports],
  ["REPORT_OPENING_TOKEN_MISMATCH",input.inventory.opening.tokens,account.token.opening_base_units],
  ["REPORT_CLOSING_TOKEN_MISMATCH",input.inventory.closing.tokens,account.token.observed_closing_base_units]
 ]){
  if(expected==null||amount(expected)!==amount(observed))issues.push(code);
 }
 return {status:issues.length?"REVIEW_REQUIRED":"INTERNALLY_CONSISTENT",account_audit:account,cash_audit:cash,classification,issues,source_attestation:"UNKNOWN"};
}
