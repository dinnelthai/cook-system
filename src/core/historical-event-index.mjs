import {createHash,randomUUID} from "node:crypto";
import {mkdir,readdir,lstat,readFile,open,rename,unlink} from "node:fs/promises";
import {join} from "node:path";
import {auditHistoricalEventBatches,verifyHistoricalEventBatch} from "./historical-event-store.mjs";
const INDEX_FILE="index.json",MAX_BATCHES=256,MAX_BYTES=128*1024*1024,MAX_BATCH_BYTES=32*1024*1024;
const hashPattern=/^[0-9a-f]{64}$/;
const stable=v=>v===null||typeof v!=="object"?JSON.stringify(v):Array.isArray(v)?"["+v.map(stable).join(",")+"]":"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stable(v[k])).join(",")+"}";
const digest=v=>createHash("sha256").update(stable(v)).digest("hex");
const namesIn=async directory=>(await readdir(directory)).filter(n=>/^[0-9a-f]{64}\.json$/.test(n)).sort();
function eventKey(s,e){return stable([s.chain_id,s.network,s.genesis_hash,s.token_mint,s.quote_mint,s.provenance,e.synthetic_metadata?.scenario_id??null,e.event_id]);}
function compareEntries(a,b){
 const namespace=e=>stable([e.chain_id,e.network,e.genesis_hash,e.token_mint,e.quote_mint,e.provenance,e.scenario_id]);
 const n=namespace(a).localeCompare(namespace(b),"en");if(n)return n;
 const coords=e=>e.provenance==="synthetic"?[e.event_time_ms,e.event_sequence]:[e.slot,e.transaction_index,e.instruction_index,e.inner_instruction_index??-1,e.event_sequence];
 const x=coords(a),y=coords(b);for(let i=0;i<x.length;i++){if(x[i]<y[i])return -1;if(x[i]>y[i])return 1;}
 return a.event_id.localeCompare(b.event_id,"en");
}
async function readBoundedFile(path,maxBytes){
 const info=await lstat(path);
 if(!info.isFile()||info.size>maxBytes)throw Error("INVALID_ARCHIVE_FILE");
 const bytes=await readFile(path);if(bytes.length>maxBytes)throw Error("INVALID_ARCHIVE_FILE");
 return bytes;
}
function validateFilter(filter){
 if(!filter||typeof filter!=="object"||Array.isArray(filter))throw Error("INVALID_INDEX_FILTER");
 const strings=["chain_id","network","genesis_hash","token_mint","quote_mint","provenance","scenario_id","event_id"];
 const numbers=["from_slot","to_slot","from_time_ms","to_time_ms"];
 for(const [k,v] of Object.entries(filter)){
  if(strings.includes(k)){if(typeof v!=="string"||!v.trim())throw Error("INVALID_INDEX_FILTER:"+k);}
  else if(numbers.includes(k)){if(!Number.isSafeInteger(v)||v<0)throw Error("INVALID_INDEX_FILTER:"+k);}
  else throw Error("UNKNOWN_INDEX_FILTER:"+k);
 }
 for(const [from,to] of [["from_slot","to_slot"],["from_time_ms","to_time_ms"]])if(filter[from]!==undefined&&filter[to]!==undefined&&filter[from]>filter[to])throw Error("INVALID_INDEX_FILTER_RANGE");
}

export async function rebuildHistoricalEventIndex(directory){
 if(typeof directory!=="string"||!directory.trim())throw Error("INDEX_DIRECTORY_REQUIRED");
 await mkdir(directory,{recursive:true,mode:0o700});
 const before=await namesIn(directory);if(before.length>MAX_BATCHES)throw Error("HISTORICAL_INDEX_BATCH_LIMIT");
 const batches=[],batchManifest=[];let totalBytes=0;
 for(const name of before){
  const info=await lstat(join(directory,name));if(!info.isFile()||info.size>32*1024*1024)throw Error("INVALID_ARCHIVE_FILE");
  totalBytes+=info.size;if(totalBytes>MAX_BYTES)throw Error("HISTORICAL_INDEX_BYTE_LIMIT");
  const bytes=await readBoundedFile(join(directory,name),MAX_BATCH_BYTES);
  const batch=verifyHistoricalEventBatch(JSON.parse(bytes.toString("utf8")));
  if(batch.batch_id!==name.slice(0,-5))throw Error("HISTORICAL_INDEX_FILENAME_MISMATCH");
  batchManifest.push({batch_id:batch.batch_id,sha256:createHash("sha256").update(bytes).digest("hex"),size_bytes:bytes.length});
  batches.push(batch);
 }
 const audit=auditHistoricalEventBatches(batches);
 if(audit.status==="REVIEW_REQUIRED")throw Error("HISTORICAL_INDEX_REVIEW_REQUIRED:"+audit.issues.map(x=>x.code).join(","));
 const unique=new Map();
 for(const batch of batches)for(let i=0;i<batch.events.length;i++){
  const event=batch.events[i],key=eventKey(batch.scope,event);
  if(!unique.has(key))unique.set(key,{event_key:digest(key),event_id:event.event_id,batch_id:batch.batch_id,event_index:i,
   chain_id:batch.scope.chain_id,network:batch.scope.network,genesis_hash:batch.scope.genesis_hash,token_mint:batch.scope.token_mint,
   quote_mint:batch.scope.quote_mint,provenance:batch.scope.provenance,scenario_id:event.synthetic_metadata?.scenario_id??null,
   event_time_ms:event.event_time_ms,slot:event.ordering.slot??null,transaction_index:event.ordering.transaction_index??null,
   instruction_index:event.ordering.instruction_index??null,inner_instruction_index:event.ordering.inner_instruction_index??null,event_sequence:event.ordering.event_sequence});
 }
 const after=await namesIn(directory);if(stable(before)!==stable(after))throw Error("HISTORICAL_INDEX_ARCHIVE_CHANGED_DURING_SCAN");
 const entries=[...unique.values()].sort(compareEntries);
 const body={schema_version:"cook-historical-event-index.1",batch_ids:before.map(n=>n.slice(0,-5)),batch_manifest:batchManifest,batch_count:batches.length,
  event_occurrence_count:audit.event_occurrence_count,duplicate_count:audit.identical_duplicate_count,unique_event_count:entries.length,
  entries,source_attestation:"UNKNOWN",history_complete_attested:false};
 const index={...body,index_sha256:digest(body)},temp=join(directory,"."+randomUUID()+".index.tmp"),path=join(directory,INDEX_FILE),handle=await open(temp,"wx",0o600);
 try{await handle.writeFile(stable(index)+"\n","utf8");await handle.sync();}finally{await handle.close();}
 try{await rename(temp,path);}finally{await unlink(temp).catch(e=>{if(e.code!=="ENOENT")throw e;});}
 return index;
}
export async function loadHistoricalEventIndex(directory){
 const index=JSON.parse((await readBoundedFile(join(directory,INDEX_FILE),MAX_BYTES)).toString("utf8")),{index_sha256,...body}=index;
 if(index.schema_version!=="cook-historical-event-index.1"||digest(body)!==index_sha256)throw Error("HISTORICAL_INDEX_CHECKSUM_MISMATCH");
 const current=(await namesIn(directory)).map(n=>n.slice(0,-5));if(stable(current)!==stable(index.batch_ids))throw Error("HISTORICAL_INDEX_STALE");
 if(!Array.isArray(index.batch_manifest)||!Array.isArray(index.entries)||index.batch_manifest.length!==current.length||index.batch_count!==current.length||
  index.unique_event_count!==index.entries.length||index.source_attestation!=="UNKNOWN"||index.history_complete_attested!==false)throw Error("HISTORICAL_INDEX_MANIFEST_INVALID");
 let totalBytes=0;
 for(let i=0;i<current.length;i++){
  const item=index.batch_manifest[i];
  if(!item||item.batch_id!==current[i]||!hashPattern.test(item.sha256??"")||!Number.isSafeInteger(item.size_bytes)||item.size_bytes<0||item.size_bytes>MAX_BATCH_BYTES)throw Error("HISTORICAL_INDEX_MANIFEST_INVALID");
  totalBytes+=item.size_bytes;if(totalBytes>MAX_BYTES)throw Error("HISTORICAL_INDEX_BYTE_LIMIT");
  const bytes=await readBoundedFile(join(directory,item.batch_id+".json"),MAX_BATCH_BYTES);
  if(bytes.length!==item.size_bytes||createHash("sha256").update(bytes).digest("hex")!==item.sha256)throw Error("HISTORICAL_INDEX_BATCH_CHECKSUM_MISMATCH");
 }
 const allowed=new Set(current);
 for(const e of index.entries)if(!e||!allowed.has(e.batch_id)||!hashPattern.test(e.event_key??"")||!Number.isSafeInteger(e.event_index)||e.event_index<0||!Number.isSafeInteger(e.event_sequence)||e.event_sequence<0)throw Error("HISTORICAL_INDEX_REFERENCE_INVALID");
 if(stable((await namesIn(directory)).map(n=>n.slice(0,-5)))!==stable(current))throw Error("HISTORICAL_INDEX_STALE");
 return index;
}
export async function queryHistoricalEventIndex({directory,filter={},limit=1000}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>10000)throw Error("INVALID_INDEX_QUERY_LIMIT");
 validateFilter(filter);
 const index=await loadHistoricalEventIndex(directory);
 const candidates=index.entries.filter(e=>["chain_id","network","genesis_hash","token_mint","quote_mint","provenance","scenario_id","event_id"].every(k=>filter[k]===undefined||e[k]===filter[k])&&
  (filter.from_slot===undefined||e.slot!==null&&e.slot>=filter.from_slot)&&(filter.to_slot===undefined||e.slot!==null&&e.slot<=filter.to_slot)&&
  (filter.from_time_ms===undefined||e.event_time_ms>=filter.from_time_ms)&&(filter.to_time_ms===undefined||e.event_time_ms<=filter.to_time_ms));
 const matches=candidates.slice(0,limit);
 const batches=new Map(),results=[];
 for(const ref of matches){
  if(!batches.has(ref.batch_id)){const batch=verifyHistoricalEventBatch(JSON.parse((await readBoundedFile(join(directory,ref.batch_id+".json"),MAX_BATCH_BYTES)).toString("utf8")));if(batch.batch_id!==ref.batch_id)throw Error("HISTORICAL_INDEX_EVENT_REFERENCE_MISMATCH");batches.set(ref.batch_id,batch);}
  const batch=batches.get(ref.batch_id),event=batch.events[ref.event_index];if(!event||event.event_id!==ref.event_id||digest(eventKey(batch.scope,event))!==ref.event_key)throw Error("HISTORICAL_INDEX_EVENT_REFERENCE_MISMATCH");
  results.push({event_key:ref.event_key,batch_id:ref.batch_id,event});
 }
 return {schema_version:"cook-historical-event-query.1",index_sha256:index.index_sha256,result_count:results.length,matched_count:candidates.length,truncated:candidates.length>limit,results,source_attestation:"UNKNOWN"};
}
