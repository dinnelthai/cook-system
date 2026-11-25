import {createHash,randomUUID} from "node:crypto";
import {mkdir,open,link,unlink,readFile,stat,readdir,lstat} from "node:fs/promises";
import {join} from "node:path";
import {sortForReplay} from "./event-order.mjs";

const VERSION="cook-historical-event-batch.1";
const MAX_BYTES=32*1024*1024;
const MAX_EVENTS=10000;
const scopeKeys=["chain_id","network","genesis_hash","token_mint","quote_mint","provenance","interval_id"];
const nonempty=v=>typeof v==="string"&&v.length>0&&v.length<=256&&v.trim()===v;
const plain=v=>v!==null&&typeof v==="object"&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
function canonical(value,depth=0){
 if(depth>48)throw new Error("JSON depth exceeded");
 if(value===null||typeof value==="boolean"||typeof value==="string")return JSON.stringify(value);
 if(typeof value==="number"){if(!Number.isSafeInteger(value))throw new Error("non-canonical number; encode amounts as strings");return JSON.stringify(value);}
 if(Array.isArray(value))return "["+value.map(v=>canonical(v,depth+1)).join(",")+"]";
 if(!plain(value))throw new Error("JSON object required");
 return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k],depth+1)).join(",")+"}";
}
const digest=value=>createHash("sha256").update(canonical(value)).digest("hex");
function normalizeScope(scope){
 if(!plain(scope)||Object.keys(scope).length!==scopeKeys.length||!scopeKeys.every(k=>nonempty(scope[k])))throw Error("explicit ledger scope required");
 if(scope.chain_id!=="solana"||!["mainnet","devnet","local_sim","synthetic"].includes(scope.network)||!["observed_chain","synthetic"].includes(scope.provenance))throw Error("invalid ledger scope");
 if((scope.network==="synthetic")!==(scope.provenance==="synthetic"))throw Error("scope provenance mismatch");
 return Object.fromEntries(scopeKeys.map(k=>[k,scope[k]]));
}
/** Offline archival batches only. Hash integrity is not source authentication or finality. */
export function buildHistoricalEventBatch({scope,events}){
 const s=normalizeScope(scope);
 if(!Array.isArray(events)||events.length>MAX_EVENTS)throw Error("invalid event count");
 const scenarios=new Set();
 for(const e of events){
  if(!plain(e)||e.schema_version!=="1.0.0"||!nonempty(e.event_id)||!nonempty(e.event_kind)||!plain(e.payload)||!plain(e.source)||!nonempty(e.source.source_id)||!nonempty(e.source.source_type)||!plain(e.quality)||typeof e.quality.is_complete!=="boolean"||!["valid","warning","invalid","unknown"].includes(e.quality.validation_status))throw Error("invalid event envelope");
  if(e.provenance!==s.provenance||!plain(e.market)||!["chain_id","network","token_mint","quote_mint"].every(k=>e.market[k]===s[k]))throw Error("event scope mismatch");
  if(!Number.isSafeInteger(e.event_time_ms)||e.event_time_ms<0)throw Error("invalid event timestamp");
  if(s.provenance==="synthetic"){
   if(!nonempty(e.synthetic_metadata?.scenario_id))throw Error("missing synthetic scenario");
   scenarios.add(e.synthetic_metadata.scenario_id);
  }
  canonical(e);
 }
 if(scenarios.size>1)throw Error("mixed synthetic scenarios");
 const ordered=sortForReplay(events);
 const issues=[];
 if(!ordered.length)issues.push("EMPTY_BATCH");
 if(ordered.some(e=>!e.quality.is_complete||e.quality.validation_status!=="valid"||e.event_kind==="DATA_GAP"))issues.push("EVENT_QUALITY_REVIEW");
 const body={schema_version:VERSION,scope:s,events:ordered,issues,source_attestation:"UNKNOWN",history_complete:false,execution_enabled:false};
 const bytes=canonical(body);
 if(Buffer.byteLength(bytes)>MAX_BYTES-1024)throw Error("event batch too large");
 return {...JSON.parse(bytes),batch_id:digest(body)};
}
export function verifyHistoricalEventBatch(batch){
 if(!plain(batch)||!/^[0-9a-f]{64}$/.test(batch.batch_id??""))throw Error("invalid batch id");
 const rebuilt=buildHistoricalEventBatch({scope:batch.scope,events:batch.events});
 if(canonical(batch)!==canonical(rebuilt))throw Error("event batch integrity mismatch");
 return rebuilt;
}
/** Read-only cross-batch integrity audit. A report interval is not part of
 * event identity. Distinct chains, genesis identities, markets and synthetic
 * scenarios are separated. No source authentication or completeness inference. */
export function auditHistoricalEventBatches(batches){
 if(!Array.isArray(batches)||batches.length>256)throw Error("ARCHIVE_BATCH_LIMIT");
 const unique=new Map(),positions=new Map(),seenBatches=new Set(),issues=[];
 let occurrences=0,duplicates=0,conflicts=0;
 const addIssue=(code,batchId,eventId)=>{conflicts++;if(issues.length<100)issues.push({code,batch_id:batchId,event_id:eventId});};
 for(const raw of batches){
  const batch=verifyHistoricalEventBatch(raw);
  if(seenBatches.has(batch.batch_id))continue;
  seenBatches.add(batch.batch_id);
  const s=batch.scope;
  if(batch.issues.length&&issues.length<100)issues.push({code:"BATCH_REVIEW_REQUIRED",batch_id:batch.batch_id});
  for(const e of batch.events){
   if(++occurrences>100000)throw Error("ARCHIVE_EVENT_LIMIT");
   const namespace=[s.chain_id,s.network,s.genesis_hash,s.token_mint,s.quote_mint,s.provenance,e.synthetic_metadata?.scenario_id??null];
   const key=canonical([...namespace,e.event_id]),hash=digest(e);
   const previous=unique.get(key);
   if(previous!==undefined){
    if(previous!==hash)addIssue("CROSS_BATCH_EVENT_CONFLICT",batch.batch_id,e.event_id);
    else duplicates++;
    continue;
   }
   unique.set(key,hash);
   const o=e.ordering;
   const position=canonical([...namespace,...(s.provenance==="synthetic"?[e.event_time_ms,o.event_sequence]:[o.slot,o.transaction_index,o.instruction_index,o.inner_instruction_index??-1,o.event_sequence])]);
   const prior=positions.get(position);
   if(prior!==undefined&&prior!==e.event_id)addIssue("CROSS_BATCH_ORDER_CONFLICT",batch.batch_id,e.event_id);
   else positions.set(position,e.event_id);
  }
 }
 const review=conflicts>0||issues.length>0;
 return {schema_version:"cook-historical-archive-audit.1",status:review?"REVIEW_REQUIRED":seenBatches.size?"INTERNALLY_CONSISTENT":"EMPTY",
  batch_count:seenBatches.size,event_occurrence_count:occurrences,identical_duplicate_count:duplicates,
  unique_event_count:review?null:unique.size,conflict_count:conflicts,issues,
  source_attestation:"UNKNOWN",history_complete_attested:false,execution_enabled:false};
}

/** Private, content-addressed immutable snapshots; atomic no-overwrite publish. */
export function createHistoricalEventStore(directory){
 if(typeof directory!=="string"||!directory.trim())throw Error("store directory required");
 async function get(id){
  if(typeof id!=="string"||!/^[0-9a-f]{64}$/.test(id))throw Error("invalid batch id");
  const path=join(directory,id+".json"),info=await stat(path);
  if(!info.isFile()||info.size>MAX_BYTES)throw Error("invalid batch file");
  const bytes=await readFile(path);
  if(bytes.length>MAX_BYTES)throw Error("batch too large");
  const batch=verifyHistoricalEventBatch(JSON.parse(bytes.toString("utf8")));
  if(batch.batch_id!==id)throw Error("batch filename mismatch");
  return batch;
 }
 async function put(input){
  const batch=buildHistoricalEventBatch(input);
  await mkdir(directory,{recursive:true,mode:0o700});
  const path=join(directory,batch.batch_id+".json"),tmp=join(directory,"."+randomUUID()+".tmp");
  const f=await open(tmp,"wx",0o600);
  try{
   try{await f.writeFile(canonical(batch)+"\n","utf8");await f.sync();}finally{await f.close();}
   try{await link(tmp,path);}catch(e){if(e.code!=="EEXIST")throw e;await get(batch.batch_id);}
   return batch;
  }finally{await unlink(tmp).catch(e=>{if(e.code!=="ENOENT")throw e;});}
 }
 async function audit(){
  // Scan a bounded, explicitly chosen archive directory. Never delete or
  // rewrite a batch and never claim a transactional inventory of concurrent writes.
  const names=(await readdir(directory)).filter(n=>/^[0-9a-f]{64}\.json$/.test(n)).sort();
  if(names.length>256)throw Error("ARCHIVE_BATCH_LIMIT");
  const batches=[];
  let bytes=0;
  for(const name of names){
   const info=await lstat(join(directory,name));
   if(!info.isFile()||info.size>MAX_BYTES)throw Error("INVALID_ARCHIVE_FILE");
   bytes+=info.size;if(bytes>128*1024*1024)throw Error("ARCHIVE_SCAN_BYTE_LIMIT");
   batches.push(await get(name.slice(0,-5)));
  }
  const after=(await readdir(directory)).filter(n=>/^[0-9a-f]{64}\.json$/.test(n)).sort();
  if(canonical(names)!==canonical(after))throw Error("ARCHIVE_CHANGED_DURING_SCAN");
  return auditHistoricalEventBatches(batches);
 }
 async function rebuildIndex(){const {rebuildHistoricalEventIndex}=await import("./historical-event-index.mjs");return rebuildHistoricalEventIndex(directory);}
 async function query(filter={},limit=1000){const {queryHistoricalEventIndex}=await import("./historical-event-index.mjs");return queryHistoricalEventIndex({directory,filter,limit});}
 return {get,put,audit,rebuildIndex,query};
}
