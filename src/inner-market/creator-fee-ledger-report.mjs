import {reconcileCreatorReceivables,compareCreatorReceiptIdentity} from "./creator-fee-accounting.mjs";
const CORE=["projectId","quoteAsset","tokenMint","openingCutoff","closingCutoff"];
const verified=e=>e?.status==="FINALIZED"&&e?.reconciliation==="PASS";
/** Detailed historical Creator Fee subledger. Pool fee buckets, accrued
 * entitlements and cash receipts remain separate accounting concepts. */
export function buildCreatorFeeLedgerReport({scope,creator,cash}){
 if(!scope||!creator?.scope||!cash?.scope||!CORE.every(k=>typeof scope[k]==="string"&&scope[k].trim()&&creator.scope[k]===scope[k]&&cash.scope[k]===scope[k]))throw Error("CREATOR_FEE_REPORT_SCOPE_MISMATCH");
 if(!Array.isArray(creator.entries)||!Array.isArray(cash.entries))throw new TypeError("CREATOR_FEE_REPORT_ENTRIES_REQUIRED");
 const reconciliation=reconcileCreatorReceivables({...scope,openingReceivableBaseUnits:creator.openingReceivableBaseUnits,observedClosingReceivableBaseUnits:creator.observedClosingReceivableBaseUnits,feeEntries:creator.entries,cashEntries:cash.entries,historyComplete:creator.historyComplete});
 const postings=cash.entries.filter(p=>p?.kind==="CREATOR_FEE_RECEIVED");
 const matchedIds=new Set();
 const feeRows=creator.entries.map((e,index)=>{
  const matches=postings.filter(p=>p.feeEventId===e.id);
  for(const p of matches)matchedIds.add(p.id);
  let cashLink="NOT_APPLICABLE",receiptIdentity=null;
  if(e.kind==="CREATOR_RECEIPT"){
   if(!verified(e))cashLink="FEE_EVENT_UNVERIFIED";
   else if(matches.length===0)cashLink="CASH_POSTING_MISSING";
   else if(matches.length>1)cashLink="DUPLICATE_CASH_POSTING";
   else if(!verified(matches[0]))cashLink="CASH_POSTING_UNVERIFIED";
   else {
    receiptIdentity=compareCreatorReceiptIdentity(e,matches[0]);
    cashLink=matches[0].amountBaseUnits!==e.amountBaseUnits?"AMOUNT_MISMATCH":
     receiptIdentity.status==="REVIEW_REQUIRED"?"RECEIPT_IDENTITY_CONFLICT":"MATCHED";
   }
  }
  return {sequence:index+1,event_id:e.id,kind:e.kind,reported_amount_base_units:e.amountBaseUnits??null,event_status:verified(e)?"FINALIZED_RECONCILED":"UNVERIFIED_NOT_COUNTED",cash_link_status:cashLink,receipt_identity:receiptIdentity,cash_posting_ids:matches.map(p=>p.id),signature:e.signature??null,slot:e.slot??null,source_reference:e.sourceReference??null};
 });
 const cashRows=postings.map(p=>({posting_id:p.id,fee_event_id:p.feeEventId??null,amount_base_units:p.amountBaseUnits??null,status:verified(p)?"FINALIZED_RECONCILED":"UNVERIFIED_NOT_COUNTED",signature:p.signature??null,matched_fee_event:creator.entries.some(e=>e.id===p.feeEventId&&e.kind==="CREATOR_RECEIPT")}));
 const orphan=cashRows.filter(p=>!p.matched_fee_event||!matchedIds.has(p.posting_id));
 const status=reconciliation.status;
 return {schema_version:"cook-creator-fee-ledger.1",scope:{...scope},status,
  summary:{opening_receivable_base_units:reconciliation.opening_receivable_base_units,verified_recorded_accrual_base_units:reconciliation.accrued_base_units,recorded_receipt_event_base_units:reconciliation.recorded_receipts_base_units,recorded_writeoff_base_units:reconciliation.written_off_base_units,expected_closing_receivable_base_units:reconciliation.expected_closing_receivable_base_units,verified_cash_income_base_units:reconciliation.verified_cash_income_base_units,verified_closing_receivable_base_units:reconciliation.verified_closing_receivable_base_units,fee_event_count:feeRows.length,cash_receipt_posting_count:cashRows.length,unmatched_cash_posting_count:orphan.length},
  fee_events:feeRows,cash_postings:cashRows,unmatched_cash_postings:orphan,issues:reconciliation.issues,
  source_attestation:"UNKNOWN",wallet_attribution:"UNKNOWN",pool_fee_bucket_cash_equivalence:"NOT_ESTABLISHED",execution_enabled:false,
  notes:["Accrued Creator Fee is a receivable, not cash income.","A receipt event is counted as cash only when its matching finalized cash posting reconciles.","PumpSwap pool creator-fee buckets are not wallet receipts and are not added to this ledger.","Completeness and source authenticity are not independently established."]};
}
