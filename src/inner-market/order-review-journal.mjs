import {createHash} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";
import {applyOrderReviewEvent} from "./order-review-model.mjs";
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
 function list(projectId){
  const p=current(projectId);
  return [...replay(projectId,p).values()].map(x=>({...x.state,stale:x.state.project_revision!==p.aggregate.revision,head_hash:x.head_hash}));
 }
 function events(projectId,orderId){
  const p=current(projectId),record=replay(projectId,p).get(orderId);
  if(!record)throw Error("ORDER_NOT_FOUND");
  return record.events;
 }
 return {append,list,events};
}
