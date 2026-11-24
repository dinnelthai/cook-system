import {createHash,randomUUID} from "node:crypto";
import {mkdir,open,link,unlink,readFile,stat} from "node:fs/promises";
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
 return {get,put};
}
