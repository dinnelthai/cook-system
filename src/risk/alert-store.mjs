import {createHash,randomUUID} from "node:crypto";
import {mkdir,readFile,open,rm} from "node:fs/promises";
import {dirname,join} from "node:path";
const stable=v=>v===null||typeof v!=="object"?JSON.stringify(v):Array.isArray(v)?"["+v.map(stable).join(",")+"]":"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stable(v[k])).join(",")+"}";
const hash=v=>createHash("sha256").update(stable(v)).digest("hex");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function replay(records){
 const state=new Map();let previous="0".repeat(64);
 for(let i=0;i<records.length;i++){
  const r=records[i],{record_hash,...body}=r;
  if(r.sequence!==i+1||r.previous_hash!==previous||hash(body)!==record_hash)throw Error("ALERT_JOURNAL_CHAIN_INVALID");
  const current=state.get(r.alert_id);
  if(r.type==="ALERT_OPENED"){if(current)throw Error("ALERT_DUPLICATE_OPEN");state.set(r.alert_id,{alert:r.payload.alert,status:"OPEN",updated_at_ms:r.at_ms});}
  else if(r.type==="ALERT_ACKNOWLEDGED"){if(!current||current.status!=="OPEN")throw Error("ALERT_INVALID_ACK_TRANSITION");current.status="ACKNOWLEDGED";current.updated_at_ms=r.at_ms;current.acknowledged_by=r.payload.actor;}
  else if(r.type==="ALERT_RESOLVED"){if(!current||!["OPEN","ACKNOWLEDGED"].includes(current.status))throw Error("ALERT_INVALID_RESOLVE_TRANSITION");current.status="RESOLVED";current.updated_at_ms=r.at_ms;current.resolution=r.payload.reason;}
  else throw Error("ALERT_UNKNOWN_JOURNAL_EVENT");
  previous=record_hash;
 }
 return {state,previous};
}
/** Append-only hash-chained local alert journal. This is not a notification service. */
export function createAlertStore(path,{maxBytes=64*1024*1024,lockAttempts=80,lockDelayMs=25}={}){
 if(typeof path!=="string"||!path.trim())throw Error("ALERT_STORE_PATH_REQUIRED");
 const lockPath=path+".lock";
 async function readRecords(){
  try{const bytes=await readFile(path);if(bytes.length>maxBytes)throw Error("ALERT_JOURNAL_SIZE_LIMIT");
   const lines=bytes.toString("utf8").split("\n").filter(Boolean);return lines.map(line=>JSON.parse(line));
  }catch(e){if(e.code==="ENOENT")return [];throw e;}
 }
 async function withLock(fn){
  await mkdir(dirname(path),{recursive:true,mode:0o700});let locked=false;
  for(let i=0;i<lockAttempts;i++){try{await mkdir(lockPath,{mode:0o700});locked=true;break;}catch(e){if(e.code!=="EEXIST")throw e;await sleep(lockDelayMs);}}
  if(!locked)throw Error("ALERT_STORE_LOCK_TIMEOUT");
  try{return await fn();}finally{await rm(lockPath,{recursive:true,force:true});}
 }
 async function append(type,alertId,payload,atMs){
  if(!Number.isSafeInteger(atMs)||atMs<0||typeof alertId!=="string"||!alertId)throw Error("INVALID_ALERT_JOURNAL_INPUT");
  return withLock(async()=>{
   const records=await readRecords(),chain=replay(records),current=chain.state.get(alertId);
   if(type==="ALERT_OPENED"&&current)throw Error("ALERT_ALREADY_EXISTS");
   if(type==="ALERT_ACKNOWLEDGED"&&(!current||current.status!=="OPEN"))throw Error("ALERT_NOT_OPEN");
   if(type==="ALERT_RESOLVED"&&(!current||!["OPEN","ACKNOWLEDGED"].includes(current.status)))throw Error("ALERT_NOT_RESOLVABLE");
   const body={sequence:records.length+1,type,alert_id:alertId,at_ms:atMs,payload,previous_hash:chain.previous};
   const record={...body,record_hash:hash(body)},line=stable(record)+"\n";
   const existing=records.reduce((n,r)=>n+Buffer.byteLength(stable(r)+"\n"),0);
   if(existing+Buffer.byteLength(line)>maxBytes)throw Error("ALERT_JOURNAL_SIZE_LIMIT");
   const file=await open(path,"a",0o600);try{await file.writeFile(line,"utf8");await file.sync();}finally{await file.close();}
   return record;
  });
 }
 return {
  async openAlert(alert,atMs){
   if(!alert||alert.schema_version!=="1.0.0"||typeof alert.alert_id!=="string"||!alert.alert_id||
      !["info","low","medium","high"].includes(alert.severity)||!Array.isArray(alert.source_event_ids))throw Error("INVALID_MARKET_ALERT");
   return append("ALERT_OPENED",alert.alert_id,{alert},atMs);
  },
  async acknowledge(alertId,{actor,atMs}={}){if(typeof actor!=="string"||!actor.trim())throw Error("ALERT_ACTOR_REQUIRED");return append("ALERT_ACKNOWLEDGED",alertId,{actor},atMs);},
  async resolve(alertId,{reason,atMs}={}){if(typeof reason!=="string"||!reason.trim())throw Error("ALERT_RESOLUTION_REQUIRED");return append("ALERT_RESOLVED",alertId,{reason},atMs);},
  async list(){const records=await readRecords(),r=replay(records);return [...r.state.entries()].map(([alert_id,value])=>({alert_id,...value}));},
  async audit(){const records=await readRecords(),r=replay(records),counts={open:0,acknowledged:0,resolved:0};for(const x of r.state.values())counts[x.status.toLowerCase()]++;
   return {schema_version:"cook-alert-journal-audit.1",status:"INTERNALLY_CONSISTENT",record_count:records.length,alert_count:r.state.size,counts,last_hash:r.previous};}
 };
}
