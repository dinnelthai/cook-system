import {createHash} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";
import {normalizeArchivedReceipt} from "./archived-account-audit.mjs";
import {buildUnifiedHistoricalReport} from "./unified-historical-report.mjs";
import {matchProjectReport} from "./project-report-identity.mjs";
import {openHistoricalWorkspaceStore} from "./historical-workspace-store.mjs";
import {restoreHistoricalWorkspace} from "./historical-project-workspace.mjs";
import {SolanaRpcClient} from "../adapters/pump/solana-rpc.mjs";
import {auditReceiptObservation} from "./local-receipt-observation.mjs";
const sha=x=>createHash("sha256").update(canonicalJson(x),"utf8").digest("hex");
const slot=n=>Number.isSafeInteger(n)&&n>=0;
const PUBLIC_GENESIS=/^(5eykt4UsFv8P8NJdTREpY1vzqKzKvdp|5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp|EtWTRABZaYq6iMfeYKouRu166VU2xqa1|4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z)/;
function endpointUrl(endpoint){
 try{const u=new URL(endpoint);return u.protocol==="http:"&&["127.0.0.1","[::1]"].includes(u.hostname)&&!u.username&&!u.password&&u.pathname==="/"&&!u.search&&!u.hash?u.href:null;}catch{return null;}
}
/** Compare an already recorded historical order with a closed interval.
 * No economic attribution or transaction execution. */
export function reviewOrderReceipt(project,order,input){
 const base={schema_version:"cook-order-receipt-review.1",project_id:project.project_id,project_revision:project.revision,order_id:order.order_id,order_revision:order.revision,signature:order.signature,
  source_attestation:"UNKNOWN",ownership_attestation:"UNKNOWN",settlement_allowed:false,execution_enabled:false};
 const finish=(status,reason,extra={})=>({...base,status,reason,...extra});
 if(order.project_id!==project.project_id||order.project_revision!==project.revision||order.stale===true)return finish("REVIEW_REQUIRED","ORDER_PROJECT_REVISION_MISMATCH");
 if(order.source_mode!=="ARCHIVED_HISTORICAL"||matchProjectReport(project,input).status!=="DECLARED_MATCH")return finish("REVIEW_REQUIRED","REPORT_SCOPE_MISMATCH");
 if(order.status==="REVIEW_REQUIRED")return finish("REVIEW_REQUIRED","ORDER_REVIEW_REQUIRED");
 let report;try{report=buildUnifiedHistoricalReport(input);}catch{return finish("REVIEW_REQUIRED","REPORT_VALIDATION_FAILED");}
 if(report.status!=="REPORT_READY")return finish("REVIEW_REQUIRED","REPORT_REVIEW_REQUIRED");
 const interval=input.archivedEvidence?.accountInterval;
 if(!interval)return finish("UNKNOWN","ARCHIVED_RECEIPTS_UNAVAILABLE");
 const receipts=interval.receipts.filter(r=>r.signature===order.signature);
 if(!receipts.length)return finish("UNKNOWN","ORDER_RECEIPT_NOT_FOUND");
 if(receipts.length!==1)return finish("REVIEW_REQUIRED","ORDER_RECEIPT_AMBIGUOUS");
 let receipt;try{receipt=normalizeArchivedReceipt(receipts[0],project.network.genesis_hash);}catch{return finish("REVIEW_REQUIRED","ORDER_RECEIPT_INVALID");}
 if(receipt.issues.length)return finish("REVIEW_REQUIRED","RECEIPT_CONSERVATION_CONFLICT");
 const outcome=receipt.outcome==="SUCCESS"?"SUCCESS":"FAILURE";
 if(order.reported_outcome!==null&&order.reported_outcome!==outcome||order.reported_slot!==null&&order.reported_slot!==receipt.slot)return finish("REVIEW_REQUIRED","ORDER_RECEIPT_OUTCOME_CONFLICT");
 const postings=input.cash.entries.filter(p=>p.signature===order.signature);
 const journal=new Map(input.inventory.ledger.position_journal.map(j=>[j.event_id,j]));
 const references=postings.map(p=>({posting_id:p.id,recorded_status:p.status,reconciliation:p.reconciliation,inventory_event_id:journal.has(p.tradeEventId)?p.tradeEventId:null}));
 if(report.terminal_state.archived_evidence.status!=="INTERNALLY_CONSISTENT"||!postings.length||postings.some(p=>p.status!=="FINALIZED"||p.reconciliation!=="PASS"))
  return finish("PARTIAL","CASH_OR_RECEIPT_EVIDENCE_INCOMPLETE",{receipt_slot:receipt.slot,reported_receipt_outcome:outcome,posting_references:references});
 return finish("INTERNAL_MATCH","ARCHIVED_RECEIPT_AND_POSTINGS_MATCH",{receipt_slot:receipt.slot,reported_receipt_outcome:outcome,posting_references:references,
  report_digest:sha(input),financial_parity_attested:false});
}
function expectedFromArchive(raw,scope){
 const tx=raw.transaction,m=tx.meta,r=normalizeArchivedReceipt(raw,scope.genesisHash);
 const keys=[...tx.transaction.message.accountKeys,...(m.loadedAddresses?.writable??[]),...(m.loadedAddresses?.readonly??[])];
 if(r.native.length>32||r.tokens.length>32)throw Error("RECEIPT_SAMPLE_TOO_LARGE");
 const presence=(rows,address)=>rows.some(x=>keys[x.accountIndex]===address);
 return {fee_lamports:r.fee.toString(),outcome:r.outcome,accounts:r.native.map(n=>({address:n.address,pre_lamports:n.before.toString(),post_lamports:n.after.toString()})),
  ...(r.tokens.length?{token_accounts:r.tokens.map(t=>({address:t.address,mint:t.mint,owner:t.owner,decimals:t.decimals,
   pre_amount:presence(m.preTokenBalances,t.address)?t.before.toString():null,post_amount:presence(m.postTokenBalances,t.address)?t.after.toString():null}))}:{})};
}
function loadLinkedReport(project,link,path){
 if(link.kind!=="HISTORICAL_REPORT_LINK"||link.stale||link.project_id!==project.project_id||link.project_revision!==project.revision)throw Error("ORDER_REPORT_LINK_SCOPE_MISMATCH");
 const p=link.payload,store=openHistoricalWorkspaceStore(path);
 try{
  const snapshot=store.load(p.workspace_revision);
  if(snapshot.digest!==p.workspace_digest)throw Error("ORDER_REPORT_DIGEST_MISMATCH");
  const input=restoreHistoricalWorkspace(snapshot.workspace).get(p.record_key).input;
  if(sha(input)!==p.report_digest)throw Error("ORDER_REPORT_DIGEST_MISMATCH");
  return input;
 }finally{store.close();}
}
/** Derive receipt review units only from explicit, internally consistent trade postings.
 * No inference of ownership, failed-order intent or economic order count. */
export function deriveArchivedTradeReceiptSamples(project,input){
 if(matchProjectReport(project,input).status!=="DECLARED_MATCH")throw Error("PROJECT_REPORT_IDENTITY_MISMATCH");
 const report=buildUnifiedHistoricalReport(input);
 if(report.status!=="REPORT_READY"||report.terminal_state.archived_evidence.status!=="INTERNALLY_CONSISTENT")throw Error("ORDER_IMPORT_REPORT_REVIEW_REQUIRED");
 const receipts=input.archivedEvidence.accountInterval.receipts;
 const signatures=new Set(input.cash.entries.filter(p=>["TRADE_CASH_COST","TRADE_NET_RECEIPT"].includes(p.kind)&&p.status==="FINALIZED"&&p.reconciliation==="PASS").map(p=>p.signature));
 if(signatures.size>256)throw Error("ORDER_REVIEW_CAPACITY");
 const samples=[];
 for(const signature of signatures){
  const matches=receipts.filter(x=>x.signature===signature);
  if(matches.length!==1||!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature))throw Error("INVALID_ORDER_IMPORT_SAMPLE");
  const receipt=normalizeArchivedReceipt(matches[0],project.network.genesis_hash);
  if(receipt.issues.length||receipt.outcome!=="SUCCESS")throw Error("ORDER_IMPORT_RECEIPT_CONFLICT");
  samples.push({signature,slot:receipt.slot,outcome:"SUCCESS"});
 }
 return {samples,excluded_receipt_count:receipts.length-samples.length,source_attestation:"UNKNOWN",execution_enabled:false,settlement_allowed:false};
}
export function createOrderReceiptImporter({path,enabled}={}){
 return (project,link)=>{
  if(!enabled)throw Error("WORKSPACE_DISABLED");
  return deriveArchivedTradeReceiptSamples(project,loadLinkedReport(project,link,path));
 };
}
/** Compare a single archived transaction to a configured finalized private RPC.
 * Never infer absent data as failure, never change order or project state. */
export function createOrderReceiptReviewer({path,enabled,endpoint,expectedGenesis,fetchImpl=globalThis.fetch}={}){
 const url=endpointUrl(endpoint);
 const configured=Boolean(url&&typeof expectedGenesis==="string"&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(expectedGenesis)&&!PUBLIC_GENESIS.test(expectedGenesis));
 const rpc=configured?new SolanaRpcClient({endpoint:url,commitment:"finalized",timeoutMs:3000,maxRetries:0,strictEnvelope:true,fetchImpl:(u,i)=>fetchImpl(u,{...i,redirect:"error"})}):null;
 let busy=false;
 return async function review(project,order,link){
  if(!enabled)throw Error("WORKSPACE_DISABLED");
  const input=loadLinkedReport(project,link,path);
  const internal=reviewOrderReceipt(project,order,input);
  const finish=(status,reason,extra={})=>({...internal,archive_id:link.archive_id,rpc_observation:{status,reason,...extra},financial_parity_attested:false});
  if(internal.status!=="INTERNAL_MATCH")return finish("NOT_ATTEMPTED","INTERNAL_REVIEW_REQUIRED");
  if(!configured)return finish("UNKNOWN","PRIVATE_RPC_NOT_CONFIGURED");
  if(project.network.cluster!=="localnet"||project.network.genesis_hash!==expectedGenesis)return finish("REVIEW_REQUIRED","PROJECT_NETWORK_PIN_MISMATCH");
  if(busy)return finish("UNKNOWN","READER_BUSY");
  busy=true;
  try{
   const raw=input.archivedEvidence.accountInterval.receipts.find(r=>r.signature===order.signature);
   const expected=expectedFromArchive(raw,input.scope);
   if(await rpc.getGenesisHash()!==expectedGenesis)return finish("REVIEW_REQUIRED","RPC_GENESIS_MISMATCH");
   const tx=await rpc.getTransaction(order.signature);
   if(!tx)return finish("UNKNOWN","RPC_RECEIPT_UNAVAILABLE");
   if(!slot(tx.slot)||tx.slot!==internal.receipt_slot||tx.transaction?.signatures?.[0]!==order.signature)return finish("REVIEW_REQUIRED","RPC_RECEIPT_IDENTITY_CONFLICT");
   const audit=auditReceiptObservation(tx,expected);
   if(await rpc.getGenesisHash()!==expectedGenesis)return finish("REVIEW_REQUIRED","RPC_GENESIS_CHANGED");
   return finish(audit.status,"DECLARED_ARCHIVE_COMPARISON",{checks:audit.checks});
  }catch{return finish("UNKNOWN","RPC_OR_EXPECTATION_UNAVAILABLE");}
  finally{busy=false;}
 };
}
