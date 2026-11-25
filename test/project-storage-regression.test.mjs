import {Worker} from "node:worker_threads";
import {DatabaseSync} from "node:sqlite";
import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {openProjectStore} from "../src/inner-market/project-store.mjs";
import {checkProjectAuditBundleDigest} from "../src/inner-market/project-audit-bundle.mjs";
test("bulk audit projection retains full order events, heads and scope after reopen",t=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),"cook-bulk-audit-")));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,"p.sqlite"),a=openProjectStore(path,{now:()=>1000});
 try{
  const id=a.create({project_id:"bulk",profile:{name:"Bulk",symbol:"BULK"}}).project_id;
  for(let i=0;i<12;i++)a.orderReview.append(id,"o"+i,{event_id:"reg-"+i,expected_revision:0,expected_project_revision:1,type:"REGISTER_OBSERVATION",payload:{source_mode:"SYNTHETIC",signature:"1".repeat(62)+(i<9?"1":"2")+String(i%9+1)}});
  const audit=a.exportAuditBundle(id,1);
  assert.equal(audit.orders.length,12);
  assert.deepEqual(audit.orders.map(x=>x.order),a.orderReview.list(id));
  for(const row of audit.orders)assert.deepEqual(row.events,a.orderReview.events(id,row.order.order_id));
  assert.equal(checkProjectAuditBundleDigest(audit).status,"DIGEST_MATCH_NOT_AUTHENTICATED");
  assert.equal(a.getBusinessReview(id).capacity.order_count,12);
  const b=openProjectStore(path);try{assert.deepEqual(b.exportAuditBundle(id,1),audit);}finally{b.close();}
 }finally{a.close();}
});

test("backup checks untouched schema and does not recreate missing immutability trigger",t=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),"cook-backup-schema-")));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,"p.sqlite"),backup=join(dir,"backup.sqlite"),s=openProjectStore(path,{now:()=>1000});
 try{
  s.create({project_id:"schema",profile:{name:"Schema",symbol:"SCHEMA"}});
  const raw=new DatabaseSync(path);try{raw.exec("DROP TRIGGER order_review_no_update");}finally{raw.close();}
  const health=s.inspectDatabaseIntegrity();
  assert.equal(health.status,"REVIEW_REQUIRED");
  assert.ok(health.schema_check.missing_objects.includes("trigger:order_review_no_update"));
  assert.throws(()=>s.createVerifiedBackup(backup),/PROJECT_BACKUP_SCHEMA_REVIEW_REQUIRED/);
  const copy=new DatabaseSync(backup,{readOnly:true});try{assert.equal(copy.prepare("SELECT name FROM sqlite_schema WHERE name=?").get("order_review_no_update"),undefined);}finally{copy.close();}
 }finally{s.close();}
});
test("audit export distinguishes compatible revisions from stale and preserves original conflicts",t=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),"cook-audit-compat-")));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const s=openProjectStore(join(dir,"p.sqlite"),{now:()=>1000});
 try{
  const id=s.create({project_id:"audit-compat",profile:{name:"Audit",symbol:"AUD"}}).project_id;
  const a=s.recordArchive(id,"TREASURY_REVIEW",{project_id:id,project_revision:1,status:"REVIEW_REQUIRED",source_attestation:"UNKNOWN",execution_enabled:false},1);
  s.orderReview.append(id,"order",{event_id:"reg-compat",expected_revision:0,expected_project_revision:1,type:"REGISTER_OBSERVATION",payload:{source_mode:"SYNTHETIC",signature:"1".repeat(64)}});
  s.append(id,{command_id:"meta-compat",type:"UPDATE_PROFILE",payload:{profile:{description:"Updated"}}},{expected_revision:1});
  const v=s.exportAuditBundle(id,2);
  assert.equal(v.archives[0].evidence_applicability,"PROFILE_ONLY_COMPATIBLE");
  assert.ok(v.exceptions.some(x=>x.archive_id===a.archive_id&&x.code==="EVIDENCE_CONFLICT"));
  assert.ok(!v.exceptions.some(x=>["STALE_ORDER_REVISION","STALE_ARCHIVE_REVISION"].includes(x.code)));
  assert.ok(v.exceptions.some(x=>x.code==="REVIEW_REPORT_LINK_CONFLICT"&&x.category==="CROSS_MODULE"));
  assert.equal(v.risk.status,"REVIEW_REQUIRED");
 }finally{s.close();}
});

test("concurrent SQLite writers deduplicate one metadata creation and append across connections", {timeout:20000},async t=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),"cook-concurrent-store-")));
 const path=join(dir,"p.sqlite"),initial=openProjectStore(path,{now:()=>1000});
 initial.close();
 const workers=[];
 t.after(async()=>{await Promise.all(workers.map(w=>w.terminate()));rmSync(dir,{recursive:true,force:true});});
 const source=`
 const {parentPort,workerData}=require("node:worker_threads");
 (async()=>{
  const {openProjectStore}=await import(workerData.module);
  const store=openProjectStore(workerData.path,{now:()=>1000});
  try{
   parentPort.postMessage({ready:true});
   await new Promise(resolve=>parentPort.once("message",resolve));
   const p=store.create({profile:{name:"Concurrent QA",symbol:"QA"}},{create_request_id:"shared-create"});
   const applied=store.append(p.project_id,{command_id:"shared-profile",type:"UPDATE_PROFILE",payload:{profile:{description:"Concurrent metadata"}}},{expected_revision:1});
   parentPort.postMessage({id:p.project_id,status:applied.status,revision:applied.aggregate.revision});
  }finally{store.close();}
 })().catch(e=>{parentPort.postMessage({error:e.message});process.exitCode=1;});
 `;
 const ready=[],done=[];
 for(let i=0;i<2;i++){
  const worker=new Worker(source,{eval:true,workerData:{path,module:new URL("../src/inner-market/project-store.mjs",import.meta.url).href}});
  workers.push(worker);
  let readyResolve,readyReject,doneResolve,doneReject;
  ready.push(new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;}));
  done.push(new Promise((resolve,reject)=>{doneResolve=resolve;doneReject=reject;}));
  // Attach rejection handlers immediately so a failure during setup cannot
  // become an unhandled rejection while the other connection opens.
  done.at(-1).catch(()=>{});
  const fail=e=>{readyReject(e);doneReject(e);};
  worker.on("error",fail);
  worker.on("message",m=>{if(m.error)fail(Error(m.error));else if(m.ready)readyResolve();else doneResolve(m);});
  worker.on("exit",code=>{if(code!==0)fail(Error("SQLITE_WORKER_EXIT_"+code));});
 }
 await Promise.all(ready);for(const worker of workers)worker.postMessage("start");
 const results=await Promise.all(done);
 assert.equal(results[0].id,results[1].id);
 assert.deepEqual(results.map(r=>r.status).sort(),["ALREADY_APPLIED","APPLIED"]);
 assert.ok(results.every(r=>r.revision===2));
 const s=openProjectStore(path);
 try{
  assert.equal(s.list().length,1);
  assert.equal(s.events(results[0].id).length,2);
  assert.equal(s.verify(results[0].id).status,"VERIFIED");
 }finally{s.close();}
});
test("bounded metadata replay remains stable across repeated database reopen", {timeout:20000},t=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),"cook-reopen-stress-")));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,"p.sqlite");
 for(let batch=0;batch<4;batch++){
  const s=openProjectStore(path,{now:()=>1000});
  try{
   if(batch===0)s.create({project_id:"reopen-qa",profile:{name:"Reopen QA",symbol:"QA"}});
   for(let i=0;i<25;i++){
    const n=batch*25+i;
    s.append("reopen-qa",{command_id:"meta-"+n,type:"UPDATE_PROFILE",payload:{profile:{description:"metadata "+n}}},{expected_revision:n+1});
   }
   const current=s.get("reopen-qa");
   assert.equal(current.revision,(batch+1)*25+1);
   assert.equal(s.verify("reopen-qa").status,"VERIFIED");
  }finally{s.close();}
 }
 const s=openProjectStore(path);
 try{assert.equal(s.events("reopen-qa").length,101);assert.equal(s.get("reopen-qa").profile.description,"metadata 99");}
 finally{s.close();}
});
