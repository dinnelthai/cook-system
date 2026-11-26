import {createHash, randomUUID} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";

const hash=value=>createHash("sha256").update(canonicalJson(value),"utf8").digest("hex");
const id=value=>typeof value==="string"&&value.trim()===value&&value.length>0&&value.length<=128;
const clone=value=>structuredClone(value);

/** Durable project-trade intent and result journal. It never holds a DB
 * transaction across RPC/signing awaits; callers persist each boundary. */
export function createProjectTradeExecutionJournal(db,{now=()=>Date.now(),idFactory=randomUUID}={}){
 db.exec(
  "CREATE TABLE IF NOT EXISTS project_trade_preview (preview_id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES project_snapshot(project_id),project_revision INTEGER NOT NULL,preview_json TEXT NOT NULL,preview_hash TEXT NOT NULL,created_at_ms INTEGER NOT NULL,expires_at_ms INTEGER NOT NULL,status TEXT NOT NULL);"+
  "CREATE INDEX IF NOT EXISTS project_trade_preview_project ON project_trade_preview(project_id,created_at_ms);"+
  "CREATE TABLE IF NOT EXISTS project_trade_execution (execution_id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES project_snapshot(project_id),preview_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,request_hash TEXT NOT NULL,execution_json TEXT NOT NULL,created_at_ms INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL,UNIQUE(project_id,idempotency_key),UNIQUE(preview_id));"+
  "CREATE TABLE IF NOT EXISTS project_trade_wallet (execution_id TEXT NOT NULL REFERENCES project_trade_execution(execution_id),ordinal INTEGER NOT NULL,wallet TEXT NOT NULL,amount_base_units TEXT NOT NULL,status TEXT NOT NULL,signature TEXT,reason TEXT,updated_at_ms INTEGER NOT NULL,PRIMARY KEY(execution_id,ordinal));"+
  "CREATE TABLE IF NOT EXISTS project_trade_lock (project_id TEXT PRIMARY KEY REFERENCES project_snapshot(project_id),execution_id TEXT NOT NULL UNIQUE);"+
  "CREATE INDEX IF NOT EXISTS project_trade_wallet_execution ON project_trade_wallet(execution_id,ordinal);"+
  "CREATE TRIGGER IF NOT EXISTS project_trade_preview_no_update BEFORE UPDATE ON project_trade_preview BEGIN SELECT RAISE(ABORT,'PROJECT_TRADE_PREVIEW_IMMUTABLE'); END;"+
  "CREATE TRIGGER IF NOT EXISTS project_trade_preview_no_delete BEFORE DELETE ON project_trade_preview BEGIN SELECT RAISE(ABORT,'PROJECT_TRADE_PREVIEW_IMMUTABLE'); END;"
 );
 const previewGet=db.prepare("SELECT * FROM project_trade_preview WHERE preview_id=?");
 const previewInsert=db.prepare("INSERT INTO project_trade_preview VALUES(?,?,?,?,?,?,?,?)");
 const executionGet=db.prepare("SELECT * FROM project_trade_execution WHERE execution_id=?");
 const executionByKey=db.prepare("SELECT * FROM project_trade_execution WHERE project_id=? AND idempotency_key=?");
 const executionByPreview=db.prepare("SELECT * FROM project_trade_execution WHERE preview_id=?");
 const executionInsert=db.prepare("INSERT INTO project_trade_execution VALUES(?,?,?,?,?,?,?,?)");
 const executionUpdate=db.prepare("UPDATE project_trade_execution SET execution_json=?,updated_at_ms=? WHERE execution_id=?");
 const walletInsert=db.prepare("INSERT INTO project_trade_wallet VALUES(?,?,?,?,?,?,?,?)");
 const walletGet=db.prepare("SELECT * FROM project_trade_wallet WHERE execution_id=? ORDER BY ordinal");
 const walletUpdate=db.prepare("UPDATE project_trade_wallet SET status=?,signature=?,reason=?,updated_at_ms=? WHERE execution_id=? AND ordinal=?");
 const lockGet=db.prepare("SELECT * FROM project_trade_lock WHERE project_id=?"),lockInsert=db.prepare("INSERT INTO project_trade_lock VALUES(?,?)"),lockDelete=db.prepare("DELETE FROM project_trade_lock WHERE project_id=? AND execution_id=?");
 function decodePreview(row){
  if(!row||hash(JSON.parse(row.preview_json))!==row.preview_hash)throw Error("PROJECT_TRADE_PREVIEW_INTEGRITY_FAILURE");
  return {...JSON.parse(row.preview_json),preview_id:row.preview_id,created_at_ms:row.created_at_ms,expires_at_ms:row.expires_at_ms,status:row.status,preview_hash:row.preview_hash};
 }
 function decodeExecution(row){
  if(!row)return null;
  const execution=JSON.parse(row.execution_json),wallets=walletGet.all(row.execution_id).map(w=>({ordinal:w.ordinal,wallet:w.wallet,amount_base_units:w.amount_base_units,status:w.status,signature:w.signature,reason:w.reason,updated_at_ms:w.updated_at_ms}));
  return {...execution,execution_id:row.execution_id,preview_id:row.preview_id,idempotency_key:row.idempotency_key,created_at_ms:row.created_at_ms,updated_at_ms:row.updated_at_ms,wallets};
 }
 function createPreview(preview,{ttlMs=60000}={}){
  if(!preview||!id(preview.project_id)||!Number.isSafeInteger(preview.project_revision)||preview.project_revision<1||!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>3600000)throw Error("INVALID_PROJECT_TRADE_PREVIEW");
  const at=now();if(!Number.isSafeInteger(at)||at<0)throw Error("INVALID_PROJECT_TRADE_CLOCK");
  const previewId="preview-"+idFactory(),content={...clone(preview),preview_id:undefined};delete content.preview_id;
  const previewHash=hash(content),expires=at+ttlMs;
  db.exec("BEGIN IMMEDIATE");try{previewInsert.run(previewId,preview.project_id,preview.project_revision,canonicalJson(content),previewHash,at,expires,"READY");db.exec("COMMIT");return decodePreview(previewGet.get(previewId));}catch(error){try{db.exec("ROLLBACK")}catch{}throw error}
 }
 function getPreview(previewId){if(!id(previewId))throw Error("INVALID_PROJECT_TRADE_PREVIEW_ID");const row=previewGet.get(previewId);if(!row)throw Error("PROJECT_TRADE_PREVIEW_NOT_FOUND");return decodePreview(row)}
 function createExecution(projectId,previewId,key,request,orders){
  if(!id(projectId)||!id(previewId)||!id(key)||!request||!Array.isArray(orders)||!orders.length)throw Error("INVALID_PROJECT_TRADE_EXECUTION");
  const requestHash=hash({project_id:projectId,preview_id:previewId,idempotency_key:key,request});
  db.exec("BEGIN IMMEDIATE");try{
   const prior=executionByKey.get(projectId,key);
   if(prior){if(prior.request_hash!==requestHash)throw Error("PROJECT_TRADE_IDEMPOTENCY_CONFLICT");const result=decodeExecution(prior);db.exec("COMMIT");return {status:"ALREADY_STARTED",execution:result}}
   if(executionByPreview.get(previewId))throw Error("PROJECT_TRADE_PREVIEW_ALREADY_USED");
   const locked=lockGet.get(projectId);if(locked)throw Error("PROJECT_TRADE_EXECUTION_BUSY");
   const at=now(),executionId="execution-"+idFactory(),execution={project_id:projectId,preview_id:previewId,status:"RUNNING",request_hash:requestHash,stop_reason:null};
   lockInsert.run(projectId,executionId);executionInsert.run(executionId,projectId,previewId,key,requestHash,canonicalJson(execution),at,at);
   for(const [ordinal,order] of orders.entries())walletInsert.run(executionId,ordinal,order.wallet,order.amount_base_units,"NOT_ATTEMPTED",null,null,at);
   db.exec("COMMIT");return {status:"STARTED",execution:decodeExecution(executionGet.get(executionId))};
  }catch(error){try{db.exec("ROLLBACK")}catch{}throw error}
 }
 function getExecution(executionId){if(!id(executionId))throw Error("INVALID_PROJECT_TRADE_EXECUTION_ID");const row=executionGet.get(executionId);if(!row)throw Error("PROJECT_TRADE_EXECUTION_NOT_FOUND");return decodeExecution(row);}
 function updateWallet(executionId,ordinal,patch){
  if(!id(executionId)||!Number.isSafeInteger(ordinal)||ordinal<0||!patch||!["PREPARING","SUBMITTED","CONFIRMED","FAILED","REJECTED","UNKNOWN","NOT_ATTEMPTED"].includes(patch.status))throw Error("INVALID_PROJECT_TRADE_WALLET_STATE");
  const current=walletGet.all(executionId).find(row=>row.ordinal===ordinal);if(!current)throw Error("PROJECT_TRADE_WALLET_NOT_FOUND");
  const allowed={NOT_ATTEMPTED:new Set(["NOT_ATTEMPTED","PREPARING"]),PREPARING:new Set(["SUBMITTED","REJECTED"]),SUBMITTED:new Set(["CONFIRMED","FAILED","UNKNOWN"]),UNKNOWN:new Set(["UNKNOWN","CONFIRMED","FAILED"]),CONFIRMED:new Set(["CONFIRMED"]),FAILED:new Set(["FAILED"]),REJECTED:new Set(["REJECTED"])};
  if(!allowed[current.status]?.has(patch.status))throw Error("INVALID_PROJECT_TRADE_WALLET_TRANSITION");
  const signature=patch.signature===undefined?current.signature:patch.signature,reason=patch.reason===undefined?current.reason:patch.reason;
  if(["SUBMITTED","UNKNOWN","CONFIRMED","FAILED"].includes(patch.status)&&!signature)throw Error("PROJECT_TRADE_SIGNATURE_REQUIRED");
  const at=now();walletUpdate.run(patch.status,signature??null,reason??null,at,executionId,ordinal);return getExecution(executionId);
 }
 function finishExecution(executionId,status,stopReason=null){
  if(!id(executionId)||!["COMPLETED","FAILED","STOPPED_UNKNOWN"].includes(status))throw Error("INVALID_PROJECT_TRADE_EXECUTION_STATE");
  const row=executionGet.get(executionId);if(!row)throw Error("PROJECT_TRADE_EXECUTION_NOT_FOUND");const execution={...JSON.parse(row.execution_json),status,stop_reason:stopReason};const at=now();db.exec("BEGIN IMMEDIATE");try{executionUpdate.run(canonicalJson(execution),at,executionId);lockDelete.run(row.project_id,executionId);db.exec("COMMIT");return getExecution(executionId)}catch(error){try{db.exec("ROLLBACK")}catch{}throw error}
 }
 function verify(){
  for(const row of db.prepare("SELECT * FROM project_trade_preview").all())decodePreview(row);
  for(const row of db.prepare("SELECT * FROM project_trade_execution").all()){const execution=decodeExecution(row);if(execution.wallets.some((wallet,index)=>wallet.ordinal!==index))throw Error("PROJECT_TRADE_EXECUTION_INTEGRITY_FAILURE");}
  for(const lock of db.prepare("SELECT * FROM project_trade_lock").all()){const execution=executionGet.get(lock.execution_id);if(!execution||execution.project_id!==lock.project_id||JSON.parse(execution.execution_json).status!=="RUNNING")throw Error("PROJECT_TRADE_LOCK_INTEGRITY_FAILURE")}
  return {status:"PASS"};
 }
 return {createPreview,getPreview,createExecution,getExecution,updateWallet,finishExecution,verify};
}
