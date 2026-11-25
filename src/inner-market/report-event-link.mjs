import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {buildHistoricalEventBatch} from "../core/historical-event-store.mjs";
import {buildUnifiedHistoricalReport} from "./unified-historical-report.mjs";

const MAX_REPORT_BYTES=16*1024*1024;
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const label=v=>typeof v==="string"&&v.trim()===v&&v.length>0&&v.length<=256;
const wrappedSol="So11111111111111111111111111111111111111112";
export function deriveReportEventLink(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>MAX_REPORT_BYTES)throw Error("INVALID_REPORT_BYTES");
 const input=JSON.parse(bytes.toString("utf8"));
 const report=buildUnifiedHistoricalReport(input);
 if(report.status!=="REPORT_READY")throw Error("REPORT_REVIEW_REQUIRED");
 if(report.terminal_state.candles.status!=="CONSISTENT")throw Error("CANDLE_EVIDENCE_REQUIRED");
 const scope=input.scope,e=input.market.candleEvidence,market=e.market;
 if(![scope.projectId,scope.tokenMint,scope.openingCutoff,scope.closingCutoff].every(label))throw Error("INVALID_REPORT_SCOPE");
 if(scope.quoteAsset!=="SOL_LAMPORTS"||market.chain_id!=="solana")throw Error("UNSUPPORTED_REPORT_ASSET");
 let network,genesis,provenance;
 if(input.sourceMode==="SYNTHETIC"){
  if(market.network!=="synthetic")throw Error("SYNTHETIC_NETWORK_MISMATCH");
  network="synthetic";genesis="synthetic-only";provenance="synthetic";
 }else{
  if(scope.network!=="localnet"||!label(scope.genesisHash)||market.network!=="local_sim"||market.quote_mint!==wrappedSol)throw Error("LOCALNET_EVIDENCE_SCOPE_REQUIRED");
  const parseSlot=v=>{if(!/^slot:(0|[1-9]\d*)$/.test(v))throw Error("INVALID_SLOT_CUTOFF");const n=Number(v.slice(5));if(!Number.isSafeInteger(n))throw Error("INVALID_SLOT_CUTOFF");return n;};
  const start=parseSlot(scope.openingCutoff),end=parseSlot(scope.closingCutoff);
  if(end<=start||e.events.some(x=>!Number.isSafeInteger(x.ordering?.slot)||x.ordering.slot<=start||x.ordering.slot>end))throw Error("EVENT_OUTSIDE_REPORT_INTERVAL");
  network="local_sim";genesis=scope.genesisHash;provenance="observed_chain";
 }
 const interval_id=hash(JSON.stringify([scope.projectId,scope.openingCutoff,scope.closingCutoff,scope.wallet??null,scope.tokenAccount??null]));
 const batchInput={scope:{chain_id:"solana",network,genesis_hash:genesis,token_mint:scope.tokenMint,quote_mint:market.quote_mint,provenance,interval_id},events:e.events};
 const expected=buildHistoricalEventBatch(batchInput);
 if(expected.issues.length)throw Error("EVENT_BATCH_REVIEW_REQUIRED");
 const manifest={schema_version:"cook-report-event-link.1",report_sha256:hash(bytes),event_batch_id:expected.batch_id,event_count:expected.events.length,source_mode:input.sourceMode,source_attestation:"UNKNOWN",history_complete_attested:false,settlement_allowed:false,execution_enabled:false};
 return {batchInput,expected,manifest};
}
/** Link exact raw report bytes to the exact normalized candle event batch.
 * Integrity only; not proof of completeness, provenance or financial accuracy. */
export async function archiveReportEventLink(bytes,store){
 const {batchInput,expected,manifest}=deriveReportEventLink(bytes);
 const saved=await store.put(batchInput);
 if(saved.batch_id!==expected.batch_id)throw Error("STORE_BATCH_MISMATCH");
 return manifest;
}
export async function verifyReportEventLink(bytes,manifest,store){
 const {expected,manifest:derived}=deriveReportEventLink(bytes);
 if(!isDeepStrictEqual(manifest,derived))throw Error("REPORT_MANIFEST_MISMATCH");
 const saved=await store.get(derived.event_batch_id);
 if(!isDeepStrictEqual(saved,expected))throw Error("STORE_BATCH_MISMATCH");
 return {status:"INTEGRITY_MATCH",...derived};
}
