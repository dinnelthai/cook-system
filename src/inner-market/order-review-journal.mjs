import {createHash} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";
import {applyOrderReviewEvent} from "./order-review-model.mjs";
import {evidenceApplicability} from "./project-evidence-scope.mjs";
const hash=x=>createHash("sha256").update(canonicalJson(x),"utf8").digest("hex");
const id=x=>typeof x==="string"&&x.length>0&&x.length<=128&&x.trim()===x;
const core=r=>({event_id:r.event_id,project_id:r.project_id,order_id:r.order_id,revision:r.revision,event_json:r.event_json,recorded_at_ms:r.recorded_at_ms,previous_hash:r.previous_hash,request_hash:r.request_hash});
/** Internal retrospective journal. No HTTP ingestion or transaction execution.
 * Replays immutable events instead of trusting a mutable status snapshot. */
export function createOrderReviewJournal(db,{current,now}){
 db.exec("CREATE TABLE IF NOT EXISTS order_review_event (event_id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES project_snapshot(project_id),order_id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),event_json TEXT NOT NULL,recorded_at_ms INTEGER NOT NULL,previous_hash TEXT,request_hash TEXT NOT NULL,event_hash TEXT NOT NULL,UNIQUE(project_id,order_id,revision));"+
 "CREATE INDEX IF NOT EXISTS order_review_project ON order_review_event(project_id,order_id,revision);"+
 "CREATE TRIGGER IF NOT EXISTS order_review_no_update BEFORE UPDATE ON order_review_event BEGIN SELECT RAISE(ABORT,'ORDER_REVIEW_IMMUTABLE'); END;"+
 "CREATE TRIGGER IF NOT EXISTS order_review_no_delete BEFORE DELETE ON order_review_event BEGIN SELECT RAISE(ABORT,'ORDER_REVIEW_IMMUTABLE'); END;");
 const rows=db.prepare("SELECT * FROM order_review_event WHERE project_id=? ORDER BY order_id,revision");
 const byId=db.prepare("SELECT * FROM order_review_event WHERE event_id=?");
 const insert=db.prepare("INSERT INTO order_review_event VALUES(?,?,?,?,?,?,?,?,?)");
 function replay(projectId,project){
  const result=new Map();
  for(const row of rows.all(projectId)){
   const prior=result.get(row.order_id);
   if(row.revision!==(prior?.state.revision??0)+1||row.previous_hash!==(prior?.head_hash??null)||row.event_hash!==hash(core(row)))throw Error("ORDER_REVIEW_INTEGRITY_FAILURE");
   let event;try{event=JSON.parse(row.event_json);}catch{throw Error("ORDER_REVIEW_INTEGRITY_FAILURE");}
   const state=applyOrderReviewEvent(prior?.state??null,event);
   if(state.order_id!==row.order_id||state.project_id!==projectId||project.events[state.project_revision-1]?.event_hash!==state.project_head_hash)throw Error("ORDER_REVIEW_SCOPE_CONFLICT");
   result.set(row.order_id,{state,head_hash:row.event_hash,events:[...(prior?.events??[]),{event_id:row.event_id,revision:row.revision,recorded_at_ms:row.recorded_at_ms,event_hash:row.event_hash,event}]});
  }
  return result;
 }
 function append(projectId,orderId,request){
  if(!id(projectId)||!id(orderId)||!request||Object.keys(request).some(k=>!["event_id","expected_revision","expected_project_revision","type","payload"].includes(k))||!id(request.event_id)||
     !Number.isSafeInteger(request.expected_revision)||request.expected_revision<0||
     !Number.isSafeInteger(request.expected_project_revision)||request.expected_project_revision<1||
     !request.payload||typeof request.payload!=="object"||Array.isArray(request.payload))throw Error("INVALID_ORDER_REVIEW_REQUEST");
  const requestHash=hash({projectId,orderId,request});
  db.exec("BEGIN IMMEDIATE");
  try{
   const project=current(projectId),all=replay(projectId,project),prior=all.get(orderId);
   const existing=byId.get(request.event_id);
   if(existing){
    if(existing.project_id!==projectId||existing.order_id!==orderId||existing.request_hash!==requestHash)throw Error("ORDER_REVIEW_IDEMPOTENCY_CONFLICT");
    db.exec("COMMIT");return {status:"ALREADY_RECORDED",order:prior.state};
   }
   if(project.aggregate.revision!==request.expected_project_revision)throw Error("PROJECT_REVISION_CONFLICT");
   if((prior?.state.revision??0)!==request.expected_revision)throw Error("ORDER_REVIEW_REVISION_CONFLICT");
   if(all.size>=256&&!prior)throw Error("ORDER_REVIEW_CAPACITY");
   if((prior?.events.length??0)>=64)throw Error("ORDER_REVIEW_CAPACITY");
   let event={type:request.type,payload:request.payload};
   if(request.type==="REGISTER_OBSERVATION"){
    if(Object.keys(request.payload).some(k=>!["source_mode","signature"].includes(k)))throw Error("INVALID_ORDER_REVIEW_SCOPE");
    if([...all.values()].some(x=>x.state.signature===request.payload.signature&&x.state.source_mode===request.payload.source_mode))throw Error("ORDER_REVIEW_DUPLICATE_SIGNATURE");
    if(request.payload.source_mode==="ARCHIVED_HISTORICAL"&&(!project.aggregate.token.mint||!project.aggregate.network.genesis_hash))throw Error("ORDER_REVIEW_PROJECT_IDENTITY_INCOMPLETE");
    event={type:request.type,payload:{...request.payload,project_id:projectId,order_id:orderId,project_revision:project.aggregate.revision,project_head_hash:project.head_hash}};
   }
   const state=applyOrderReviewEvent(prior?.state??null,event);
   const at=now();if(!Number.isSafeInteger(at)||at<project.aggregate.updated_at_ms||at<(prior?.events.at(-1)?.recorded_at_ms??0))throw Error("INVALID_ORDER_REVIEW_CLOCK");
   const row={event_id:request.event_id,project_id:projectId,order_id:orderId,revision:state.revision,event_json:canonicalJson(event),recorded_at_ms:at,previous_hash:prior?.head_hash??null,request_hash:requestHash};
   insert.run(row.event_id,row.project_id,row.order_id,row.revision,row.event_json,row.recorded_at_ms,row.previous_hash,row.request_hash,hash(core(row)));
   db.exec("COMMIT");return {status:"RECORDED",order:state};
  }catch(error){try{db.exec("ROLLBACK");}catch{}throw error;}
 }
 function readVerifiedJournal(projectId,p){
  return [...replay(projectId,p).values()].map(x=>({order:{...x.state,stale:x.state.project_revision!==p.aggregate.revision,current_revision:p.aggregate.revision,evidence_applicability:evidenceApplicability(p,x.state.project_revision),head_hash:x.head_hash},events:x.events}));
 }
 function list(projectId){return readVerifiedJournal(projectId,current(projectId)).map(x=>x.order);}
 function events(projectId,orderId){
  const p=current(projectId),record=replay(projectId,p).get(orderId);
  if(!record)throw Error("ORDER_NOT_FOUND");
  return record.events;
 }
 /** Import only server-resolved retrospective trade receipts. Atomic and idempotent.
  * One signature is a receipt review unit, not an economic order or fill. */
 function importReceipts(projectId,expectedRevision,archiveId,samples){
  if(!id(projectId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1||!/^[a-f0-9]{64}$/.test(archiveId)||
     !Array.isArray(samples)||samples.length>256)throw Error("INVALID_ORDER_IMPORT");
  const seen=new Set();
  for(const s of samples){
   if(!s||Object.keys(s).some(k=>!["signature","slot","outcome"].includes(k))||typeof s.signature!=="string"||
    !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(s.signature)||!Number.isSafeInteger(s.slot)||s.slot<0||!["SUCCESS","FAILURE"].includes(s.outcome)||seen.has(s.signature))throw Error("INVALID_ORDER_IMPORT_SAMPLE");
   seen.add(s.signature);
  }
  db.exec("BEGIN IMMEDIATE");
  try{
   const project=current(projectId),all=replay(projectId,project);
   if(project.aggregate.revision!==expectedRevision)throw Error("PROJECT_REVISION_CONFLICT");
   if(!project.aggregate.token.mint||!project.aggregate.network.genesis_hash)throw Error("ORDER_REVIEW_PROJECT_IDENTITY_INCOMPLETE");
   const existing=new Map([...all.values()].filter(x=>x.state.source_mode==="ARCHIVED_HISTORICAL").map(x=>[x.state.signature,x]));
   const fresh=samples.filter(s=>!existing.has(s.signature));
   if(all.size+fresh.length>256)throw Error("ORDER_REVIEW_CAPACITY");
   let imported=0,already_present=0;
   const at=now();
   if(!Number.isSafeInteger(at)||at<project.aggregate.updated_at_ms)throw Error("INVALID_ORDER_REVIEW_CLOCK");
   for(const sample of samples){
    const old=existing.get(sample.signature);
    if(old){
     if(evidenceApplicability(project,old.state.project_revision)==="STALE"||old.state.reported_slot!==sample.slot||old.state.reported_outcome!==sample.outcome||old.state.status==="REVIEW_REQUIRED")throw Error("ORDER_IMPORT_EXISTING_CONFLICT");
     already_present++;continue;
    }
    const orderId="receipt-"+hash({projectId,signature:sample.signature});
    if(all.has(orderId))throw Error("ORDER_IMPORT_EXISTING_CONFLICT");
    const registration={type:"REGISTER_OBSERVATION",payload:{order_id:orderId,project_id:projectId,project_revision:expectedRevision,project_head_hash:project.head_hash,source_mode:"ARCHIVED_HISTORICAL",signature:sample.signature}};
    const observation={type:"OBSERVE_OUTCOME",payload:{outcome:sample.outcome,slot:sample.slot,reference:archiveId}};
    let state=null,previous=null;
    for(const event of [registration,observation]){
     state=applyOrderReviewEvent(state,event);
     const event_id="import-"+hash({projectId,orderId,revision:state.revision});
     const row={event_id,project_id:projectId,order_id:orderId,revision:state.revision,event_json:canonicalJson(event),recorded_at_ms:at,previous_hash:previous,request_hash:hash({archiveId,event})};
     previous=hash(core(row));
     insert.run(row.event_id,row.project_id,row.order_id,row.revision,row.event_json,row.recorded_at_ms,row.previous_hash,row.request_hash,previous);
    }
    imported++;
   }
   db.exec("COMMIT");return {imported,already_present,execution_enabled:false,settlement_allowed:false,source_attestation:"UNKNOWN"};
  }catch(error){try{db.exec("ROLLBACK");}catch{}throw error;}
 }
 return {append,list,events,importReceipts,readVerifiedJournal};
}
