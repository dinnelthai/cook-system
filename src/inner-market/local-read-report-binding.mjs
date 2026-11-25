import {auditReceiptObservation} from "./local-receipt-observation.mjs";
const slot=v=>Number.isSafeInteger(v)&&v>=0;
/** Cross-check a ready historical report's retained receipts against separately
 * declared sample expectations. Never infer interval completeness, ownership,
 * economic classification, or financial parity from a sample. */
export function bindLocalReadReportSamples({reportInput,range,receiptSamples,expectedGenesisHash}){
 const counts={requested:receiptSamples.length,linked:0,matched:0,incomplete:0,conflicted:0};
 const finish=(status,code)=>({status,code,counts,financial_parity_attested:false,history_complete_attested:false});
 const s=reportInput?.scope;
 if(reportInput?.sourceMode!=="ARCHIVED_HISTORICAL"||!s||!["localnet","local_sim"].includes(s.network)||s.genesisHash!==expectedGenesisHash)
  return finish("REVIEW_REQUIRED","REPORT_SCOPE_MISMATCH");
 // Legacy aliases may be imported but cannot establish canonical interval binding.
 if(s.network!=="localnet")return finish("PARTIAL","LEGACY_REPORT_NETWORK_ALIAS");
 if(!slot(range.start_slot)||!slot(range.end_slot)||range.end_slot<=range.start_slot||
   s.openingCutoff!=="slot:"+range.start_slot||s.closingCutoff!=="slot:"+range.end_slot)
  return finish("REVIEW_REQUIRED","REPORT_INTERVAL_MISMATCH");
 const a=reportInput.archivedEvidence?.accountInterval;
 if(!a||!Array.isArray(a.receipts))return finish("PARTIAL","REPORT_RETAINED_RECEIPTS_UNAVAILABLE");
 if(a.scope?.genesisHash!==expectedGenesisHash||a.scope?.openingSlot!==range.start_slot||a.scope?.closingSlot!==range.end_slot)
  return finish("REVIEW_REQUIRED","REPORT_RETAINED_INTERVAL_MISMATCH");
 const bySig=new Map();
 for(const row of a.receipts){
  if(typeof row.signature!=="string"||bySig.has(row.signature))return finish("REVIEW_REQUIRED","REPORT_RETAINED_RECEIPT_IDENTITY_CONFLICT");
  bySig.set(row.signature,row);
 }
 for(const sample of receiptSamples){
  const row=bySig.get(sample.signature);
  if(!row){counts.incomplete++;continue;}
  counts.linked++;
  const tx=row.transaction;
  if(row.genesisHash!==expectedGenesisHash||row.finality!=="FINALIZED"||!slot(sample.slot)||
   sample.slot<=range.start_slot||sample.slot>range.end_slot||tx?.slot!==sample.slot||tx?.transaction?.signatures?.[0]!==sample.signature){
   counts.conflicted++;continue;
  }
  const verdict=auditReceiptObservation(tx,sample.expected);
  if(verdict.status==="REVIEW_REQUIRED")counts.conflicted++;
  else if(verdict.status==="DECLARED_SAMPLE_MATCH")counts.matched++;
  else counts.incomplete++;
 }
 if(counts.conflicted)return finish("REVIEW_REQUIRED","REPORT_RETAINED_SAMPLE_CONTRADICTION");
 if(!counts.requested||counts.incomplete)return finish("PARTIAL","REPORT_RETAINED_SAMPLE_COVERAGE_INCOMPLETE");
 return finish("PARTIAL","REPORT_RETAINED_SAMPLE_MATCH_INTERVAL_COMPLETENESS_UNATTESTED");
}
