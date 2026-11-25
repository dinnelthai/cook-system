const nonempty=v=>typeof v==="string"&&v.length>0&&v.length<=256&&v.trim()===v;
const MAX_PAGES=10000;
/** Read-only RPC signature capture. Provider termination is a declaration, not proof
 * of archive retention or complete chain history. Malformed pages are rejected. */
export async function collectHistoricalSignaturePages({rpc,address,maxSignatures=10000,pageSize=1000,until=null,commitment="confirmed"}={}){
 if(typeof rpc?.getSignaturesForAddress!=="function"||!nonempty(address)||!Number.isSafeInteger(maxSignatures)||maxSignatures<1||
    !Number.isSafeInteger(pageSize)||pageSize<1||pageSize>1000||!(until===null||nonempty(until))||
    !["confirmed","finalized"].includes(commitment))throw Error("INVALID_SIGNATURE_SCAN");
 const signatures=[],seen=new Set(),pages=[];
 let before=null,exhausted=false,reachedUntil=false,previousSlot=null,termination="LIMIT";
 while(signatures.length<maxSignatures){
  if(pages.length>=MAX_PAGES)throw Error("SIGNATURE_PAGE_LIMIT");
  const requested=Math.min(pageSize,maxSignatures-signatures.length);
  const page=await rpc.getSignaturesForAddress(address,{commitment,limit:requested,before:before??undefined,until:until??undefined});
  if(!Array.isArray(page)||page.length>requested)throw Error("INVALID_SIGNATURE_PAGE");
  for(let i=0;i<page.length;i++){
   const item=page[i];
   if(!item||!nonempty(item.signature)||!Number.isSafeInteger(item.slot)||item.slot<0)throw Error("INVALID_SIGNATURE_RECORD");
   if(seen.has(item.signature)||item.signature===before)throw Error("SIGNATURE_PAGE_DUPLICATE_OR_CYCLE");
   if(previousSlot!==null&&item.slot>previousSlot)throw Error("SIGNATURE_PAGE_SLOT_ORDER");
   if(until!==null&&item.signature===until&&i!==page.length-1)throw Error("SIGNATURE_BOUNDARY_OVERRUN");
   signatures.push(item);seen.add(item.signature);previousSlot=item.slot;
  }
  const next=page.at(-1)?.signature??null;
  if(until!==null&&next===until){reachedUntil=true;termination="BOUNDARY_RETURNED";}
  else if(page.length<requested){exhausted=true;termination=page.length?"SHORT_PAGE":"EMPTY_PAGE";}
  pages.push({page_index:pages.length,cursor_in:before,cursor_out:next,requested_limit:requested,returned_count:page.length,first_slot:page[0]?.slot??null,last_slot:page.at(-1)?.slot??null,signature_ids:page.map(x=>x.signature)});
  if(exhausted||reachedUntil)break;
  before=next;
 }
 return {address,signatures,count:signatures.length,exhausted,reached_until:reachedUntil,
  truncated_at_limit:!exhausted&&!reachedUntil&&signatures.length>=maxSignatures,
  newest_slot:signatures[0]?.slot??null,oldest_slot:signatures.at(-1)?.slot??null,
  pagination_evidence:{schema_version:"cook-rpc-signature-pages.1",status:exhausted||reachedUntil?"TERMINATION_DECLARED":"PARTIAL",
   commitment,requested_until:until,termination,pages,coverage_attestation:"UNKNOWN",history_complete_attested:false}};
}
/** Shared collector report metadata. An internally complete replay is never
 * silently promoted into an independently authenticated historical dataset. */
export function summarizeHistoricalReadEvidence({scans,source,missingTransactionCount,candleAudit}){
 if(!Array.isArray(scans)||!source||!Number.isSafeInteger(missingTransactionCount)||missingTransactionCount<0||!candleAudit)throw Error("INVALID_READ_EVIDENCE");
 const issues=[];
 const terminated=scans.length>0&&scans.every(s=>s?.pagination_evidence?.status==="TERMINATION_DECLARED");
 if(!terminated)issues.push("PAGINATION_INCOMPLETE");
 if(missingTransactionCount)issues.push("TRANSACTION_RECEIPTS_MISSING");
 if(source.status==="REVIEW_REQUIRED")issues.push("SOURCE_CONTRADICTION");
 else if(source.status!=="IDENTITY_MATCHED_NOT_AUTHENTICATED")issues.push("SOURCE_IDENTITY_UNVERIFIED");
 if(candleAudit.status==="REVIEW_REQUIRED")issues.push("CANDLE_EVIDENCE_CONTRADICTION");
 else if(candleAudit.status!=="CONSISTENT")issues.push("CANDLE_EVIDENCE_PARTIAL");
 return {schema_version:"cook-historical-read-evidence.1",
  status:issues.some(i=>i.endsWith("CONTRADICTION"))?"REVIEW_REQUIRED":issues.length?"PARTIAL":"INTERNALLY_CONSISTENT",
  issues,scan_count:scans.length,pagination_termination_declared:terminated,missing_transaction_count:missingTransactionCount,
  source_status:source.status,candle_status:candleAudit.status,source_attestation:"UNKNOWN",history_complete_attested:false};
}
