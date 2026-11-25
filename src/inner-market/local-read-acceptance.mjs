import {SolanaRpcClient} from "../adapters/pump/solana-rpc.mjs";
import {buildUnifiedHistoricalReport} from "./unified-historical-report.mjs";
const slot=v=>Number.isSafeInteger(v)&&v>=0;
const base58=v=>typeof v==="string"&&/^[1-9A-HJ-NP-Za-km-z]+$/.test(v);
const publicGenesis=/^(5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp|EtWTRABZaYq6iMfeYKouRu166VU2xqa1|4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z)/;
function localUrl(endpoint){
 let u;try{u=new URL(endpoint);}catch{throw Error("INVALID_LOCAL_RPC_ENDPOINT");}
 if(u.protocol!=="http:"||!["127.0.0.1","[::1]"].includes(u.hostname)||u.username||u.password||u.pathname!=="/"||u.search||u.hash)throw Error("INVALID_LOCAL_RPC_ENDPOINT");
 return u.href;
}
/** A bounded read-only preflight, not a validator identity or completeness certificate.
 * No account mutations, transaction construction, signing, or submission. */
export async function auditLocalReadAcceptance({endpoint,expectedGenesisHash,range,receiptSamples=[],reportInput=null,fetchImpl=globalThis.fetch}={}){
 const url=localUrl(endpoint);
 if(!base58(expectedGenesisHash)||expectedGenesisHash.length<32||expectedGenesisHash.length>44||publicGenesis.test(expectedGenesisHash))throw Error("INVALID_LOCAL_GENESIS_PIN");
 if(!range||!slot(range.start_slot)||!slot(range.end_slot)||range.end_slot<range.start_slot)throw Error("INVALID_ACCEPTANCE_RANGE");
 if(!Array.isArray(receiptSamples)||receiptSamples.length>20)throw Error("INVALID_RECEIPT_SAMPLE_SET");
 const seen=new Set();
 for(const r of receiptSamples){
  if(!r||!base58(r.signature)||r.signature.length<64||r.signature.length>88||!slot(r.slot)||r.slot<range.start_slot||r.slot>range.end_slot||seen.has(r.signature))throw Error("INVALID_RECEIPT_SAMPLE");
  seen.add(r.signature);
 }
 const rpc=new SolanaRpcClient({endpoint:url,commitment:"finalized",timeoutMs:3000,maxRetries:0,fetchImpl:(u,init)=>fetchImpl(u,{...init,redirect:"error"})});
 const checks=[];
 const add=(id,status,code)=>checks.push({id,status,code});
 let observed=null,retention=null,receiptSummary={requested:receiptSamples.length,matched:0,unavailable:0,contradicted:0};
 const finish=()=>({schema_version:"cook-local-read-acceptance.1",status:checks.some(c=>c.status==="REVIEW_REQUIRED")?"REVIEW_REQUIRED":checks.some(c=>c.status==="UNKNOWN"||c.status==="PARTIAL")?"PARTIAL":"READ_PREFLIGHT_PASS",
  checks,range:{start_slot:range.start_slot,end_slot:range.end_slot},observed,retention,receipts:receiptSummary,
  source_attestation:"UNKNOWN",history_complete_attested:false,financial_parity_attested:false,production_ready:false,execution_enabled:false});
 try{observed=await rpc.getGenesisHash();}catch{add("identity","UNKNOWN","GENESIS_UNAVAILABLE");return finish();}
 if(observed!==expectedGenesisHash){add("identity","REVIEW_REQUIRED","GENESIS_PIN_MISMATCH");return finish();}
 add("identity","PASS","DECLARED_GENESIS_PIN_MATCHED");
 try{
  const [health,version,head,first,minimum]=await Promise.all([rpc.request("getHealth"),rpc.request("getVersion"),rpc.getSlot(),rpc.request("getFirstAvailableBlock"),rpc.request("minimumLedgerSlot")]);
  if(health!=="ok"||typeof version?.["solana-core"]!=="string"||!slot(head)||!slot(first)||!slot(minimum)||first>head||minimum>head){add("retention","REVIEW_REQUIRED","INVALID_RPC_HEALTH_OR_RETENTION");return finish();}
  retention={finalized_slot:head,first_available_block:first,minimum_ledger_slot:minimum};
  add("health","PASS","RPC_HEALTH_REPORTED_OK");
  if(range.start_slot<Math.max(first,minimum))add("retention","PARTIAL","REQUEST_PRECEDES_RETAINED_LEDGER");
  else if(range.end_slot>head)add("retention","PARTIAL","REQUEST_BEYOND_FINALIZED_HEAD");
  else add("retention","PASS","DECLARED_RANGE_WITHIN_RETENTION_BOUNDS");
 }catch{add("health","UNKNOWN","RPC_HEALTH_OR_RETENTION_UNAVAILABLE");return finish();}
 for(const sample of receiptSamples){
  let tx;try{tx=await rpc.getTransaction(sample.signature);}catch{receiptSummary.unavailable++;continue;}
  if(tx===null){receiptSummary.unavailable++;continue;}
  if(tx?.slot!==sample.slot||tx?.transaction?.signatures?.[0]!==sample.signature||!tx.meta||typeof tx.meta!=="object"||!Object.hasOwn(tx.meta,"err")||!slot(tx.meta.fee)){receiptSummary.contradicted++;continue;}
  receiptSummary.matched++;
 }
 if(receiptSummary.contradicted)add("receipts","REVIEW_REQUIRED","RECEIPT_SAMPLE_CONTRADICTION");
 else if(!receiptSamples.length||receiptSummary.unavailable)add("receipts","PARTIAL","RECEIPT_SAMPLES_UNAVAILABLE_OR_MISSING");
 else add("receipts","PASS","DECLARED_SAMPLE_IDENTITIES_MATCHED");
 if(reportInput===null)add("report","UNKNOWN","HISTORICAL_REPORT_UNAVAILABLE");
 else {
  try{
   if(reportInput.sourceMode!=="ARCHIVED_HISTORICAL"||reportInput.scope?.network!=="local_sim"||reportInput.scope?.genesisHash!==expectedGenesisHash){
    add("report","REVIEW_REQUIRED","REPORT_SCOPE_MISMATCH");
   }else{
    const report=buildUnifiedHistoricalReport(reportInput),state=report.terminal_state;
    if(report.status!=="REPORT_READY"||state.status!==report.status||report.execution_enabled!==false||report.settlement_allowed!==false||state.execution_enabled!==false||state.settlement_allowed!==false)add("report","REVIEW_REQUIRED","REPORT_INTEGRITY_OR_BOUNDARY_FAILURE");
    else add("report","PARTIAL","REPORT_INTERNALLY_READY_INTERVAL_BINDING_UNATTESTED");
   }
  }catch{add("report","REVIEW_REQUIRED","REPORT_VALIDATION_FAILED");}
 }
 return finish();
}
