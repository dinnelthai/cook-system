import { parseBaseUnits, U128_MAX } from "../core/integer.mjs";
const amount = (v,n) => parseBaseUnits(v,{name:n,max:U128_MAX});
const verified = e => e.status==="FINALIZED" && e.reconciliation==="PASS";
const kinds = new Set(["CREATOR_ACCRUAL","CREATOR_RECEIPT","CREATOR_WRITEOFF"]);

/** Historical accounting only. Creator entitlement and cash receipts must be
 * independently verified by the caller. No fee projection or trading advice. */
export function reconcileCreatorReceivables({
  projectId, quoteAsset, tokenMint, openingCutoff, closingCutoff,
  openingReceivableBaseUnits, observedClosingReceivableBaseUnits=null,
  feeEntries, cashEntries, historyComplete=false,
}) {
  const scope={projectId,quoteAsset,tokenMint,openingCutoff,closingCutoff};
  if(!Object.values(scope).every(v=>typeof v==="string"&&v.trim())) throw new TypeError("explicit reporting scope required");
  if(!Array.isArray(feeEntries)||!Array.isArray(cashEntries)) throw new TypeError("entry arrays required");
  if(typeof historyComplete!=="boolean") throw new TypeError("historyComplete must be boolean");
  const opening=amount(openingReceivableBaseUnits,"opening receivable");
  const issues=[], seen=new Set(), receipts=new Map();
  let accrued=0n, received=0n, writtenOff=0n;
  for(const e of feeEntries) {
    if(!e||typeof e.id!=="string"||!e.id.trim()||seen.has(e.id)) throw new Error("missing or duplicate fee event id");
    seen.add(e.id);
    if(!Object.keys(scope).every(k=>e[k]===scope[k])) throw new Error("fee event scope mismatch");
    if(!kinds.has(e.kind)) throw new Error("unsupported creator fee event");
    if(!verified(e)) {issues.push({code:"UNVERIFIED_FEE_EVENT",id:e.id});continue;}
    const v=amount(e.amountBaseUnits,"fee amount");
    if(v===0n) throw new RangeError("fee amount must be positive");
    if(e.kind==="CREATOR_ACCRUAL") accrued+=v;
    if(e.kind==="CREATOR_WRITEOFF") writtenOff+=v;
    if(e.kind==="CREATOR_RECEIPT") {received+=v; receipts.set(e.id,{amount:v,matched:false});}
  }
  const cashIds=new Set();
  for(const p of cashEntries) {
    if(p.kind!=="CREATOR_FEE_RECEIVED") continue;
    if(typeof p.id!=="string"||!p.id.trim()||cashIds.has(p.id)) throw new Error("missing or duplicate cash receipt id");
    cashIds.add(p.id);
    if(!Object.keys(scope).every(k=>p[k]===scope[k])) throw new Error("cash receipt scope mismatch");
    if(!verified(p)) {issues.push({code:"UNVERIFIED_CASH_RECEIPT",id:p.id});continue;}
    const r=receipts.get(p.feeEventId);
    if(!r) {issues.push({code:"UNMATCHED_CASH_RECEIPT",id:p.id});continue;}
    if(r.matched) {issues.push({code:"DUPLICATE_RECEIPT_REFERENCE",id:p.id});continue;}
    r.matched=true;
    if(r.amount!==amount(p.amountBaseUnits,"receipt amount")) issues.push({code:"RECEIPT_AMOUNT_MISMATCH",id:p.id});
  }
  for(const [id,r] of receipts) if(!r.matched) issues.push({code:"MISSING_CASH_RECEIPT",id});
  const closing=opening+accrued-received-writtenOff;
  const observed=observedClosingReceivableBaseUnits===null?null:amount(observedClosingReceivableBaseUnits,"observed receivable");
  if(!historyComplete) issues.push({code:"HISTORY_INCOMPLETE"});
  if(closing<0n) issues.push({code:"NEGATIVE_RECEIVABLE"});
  if(observed===null) issues.push({code:"RECEIVABLE_SNAPSHOT_MISSING"});
  else if(observed!==closing) issues.push({code:"RECEIVABLE_MISMATCH"});
  const ready=issues.length===0;
  return {scope,status:ready?"RECONCILED":"REVIEW_REQUIRED",issues,
    opening_receivable_base_units:opening.toString(),accrued_base_units:accrued.toString(),
    recorded_receipts_base_units:received.toString(),written_off_base_units:writtenOff.toString(),
    expected_closing_receivable_base_units:closing.toString(),
    verified_cash_income_base_units:ready?received.toString():null,
    verified_closing_receivable_base_units:ready?closing.toString():null,
    note:"Receipts use gross entitlement amounts credited to cash; separately verified network expenses belong in the expense ledger. Accruals are not cash income."};
}
