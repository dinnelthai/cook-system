import {createHash} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";
import {auditHistoricalEventBatches} from "../core/historical-event-store.mjs";
import {restoreHistoricalWorkspace,listHistoricalProjects} from "./historical-project-workspace.mjs";
import {deriveReportEventLink} from "./report-event-link.mjs";

const sha=text=>createHash("sha256").update(text,"utf8").digest("hex");
const linkError=message=>["LOCALNET_EVIDENCE_SCOPE_REQUIRED","UNSUPPORTED_REPORT_ASSET"].includes(message)?"UNSUPPORTED_SCOPE":"REVIEW_REQUIRED";
/** Rebuild an offline index from the original report objects in a workspace.
 * Links describe supplied records only; no independent receipt or ownership verification.
 * Canonical object digests are not hashes of the originally imported file bytes. */
export function reviewHistoricalWorkspaceEvidence(bundle){
 const catalogue=restoreHistoricalWorkspace(bundle),projects=listHistoricalProjects(catalogue),batches=[];
 const recordProjects=new Map(projects.flatMap(p=>p.record_keys.map(k=>[k,p.key])));
 const records=catalogue.list().map(row=>{
  const {input,report}=catalogue.get(row.key),text=canonicalJson(input);
  const base={record_key:row.key,project_key:recordProjects.get(row.key),report_content_sha256:sha(text),report_digest_basis:"CANONICAL_JSON_OBJECT",source_mode:input.sourceMode,source_attestation:"UNKNOWN",ownership_attestation:"UNKNOWN",receipt_attestation:"UNKNOWN",audit_status:report.status,candle_evidence_status:report.terminal_state.candles.status,trade_evidence_status:report.trade_evidence.status,receipt_evidence_status:report.terminal_state.archived_evidence.status};
  if(report.status!=="REPORT_READY")return {...base,status:"REVIEW_REQUIRED",reason:"REPORT_REVIEW_REQUIRED",event_batch_id:null,event_count:null,events:[]};
  if(base.candle_evidence_status!=="CONSISTENT")return {...base,status:"UNAVAILABLE",reason:"CANDLE_EVIDENCE_REQUIRED",event_batch_id:null,event_count:null,events:[]};
  let derived;
  try{derived=deriveReportEventLink(Buffer.from(text,"utf8"));}
  catch(e){return {...base,status:linkError(e.message),reason:["LOCALNET_EVIDENCE_SCOPE_REQUIRED","UNSUPPORTED_REPORT_ASSET","EVENT_OUTSIDE_REPORT_INTERVAL","INVALID_SLOT_CUTOFF","INVALID_REPORT_BYTES","EVENT_BATCH_REVIEW_REQUIRED"].includes(e.message)?e.message:"EVENT_LINK_VALIDATION_FAILED",event_batch_id:null,event_count:null,events:[]};}
  const batch=derived.expected;batches.push(batch);
  const journal=new Map(input.inventory.ledger.position_journal.map(j=>[j.event_id,j]));
  const cashByEvent=new Map();
  for(const posting of input.cash.entries){
   if(!["TRADE_CASH_COST","TRADE_NET_RECEIPT"].includes(posting.kind)||typeof posting.tradeEventId!=="string")continue;
   if(!cashByEvent.has(posting.tradeEventId))cashByEvent.set(posting.tradeEventId,[]);
   cashByEvent.get(posting.tradeEventId).push({posting_id:posting.id,kind:posting.kind,recorded_status:posting.status,reconciliation:posting.reconciliation});
  }
  const events=batch.events.map(e=>({event_id:e.event_id,event_kind:e.event_kind,provenance:e.provenance,source_id:e.source.source_id,recorded_signature:e.payload.signature??null,event_time_ms:e.event_time_ms,ordering:e.ordering,inventory_journal_reference:journal.has(e.event_id)?e.event_id:null,cash_posting_references:cashByEvent.get(e.event_id)??[]}));
  return {...base,status:"LINKED_INTERNAL_ONLY",reason:null,event_batch_id:batch.batch_id,event_count:events.length,events};
 });
 const archive=auditHistoricalEventBatches(batches);
 const counts={linked:0,unavailable:0,unsupported:0,review_required:0};
 for(const r of records){if(r.status==="LINKED_INTERNAL_ONLY")counts.linked++;else if(r.status==="UNAVAILABLE")counts.unavailable++;else if(r.status==="UNSUPPORTED_SCOPE")counts.unsupported++;else counts.review_required++;}
 const status=counts.review_required||archive.status==="REVIEW_REQUIRED"?"REVIEW_REQUIRED":!records.length?"EMPTY":counts.unavailable||counts.unsupported?"EVIDENCE_INCOMPLETE":"INTERNALLY_CONSISTENT";
 return {schema_version:"cook-historical-workspace-evidence.1",status,counts,projects,records,archive_audit:archive,source_attestation:"UNKNOWN",history_complete_attested:false,settlement_allowed:false,execution_enabled:false,limitation:"Index of supplied candle events and declared journal/posting references only. No independent receipt matching, economic ownership, full historical coverage or cross-interval financial aggregation. Event batch identifiers are derived, not proof of external archive persistence."};
}
