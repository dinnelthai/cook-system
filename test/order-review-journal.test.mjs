import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {openProjectStore} from "../src/inner-market/project-store.mjs";
const sig="1".repeat(64);
function setup(t){
 const dir=mkdtempSync(join(tmpdir(),"cook-order-review-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));return join(realpathSync(dir),"projects.sqlite");
}
const input={project_id:"p",profile:{name:"Review",symbol:"REV"}};
const register={event_id:"record",expected_revision:0,expected_project_revision:1,type:"REGISTER_OBSERVATION",payload:{source_mode:"SYNTHETIC",signature:sig}};
const outcome=(id,rev,value,slot)=>({event_id:id,expected_revision:rev,expected_project_revision:1,type:"OBSERVE_OUTCOME",payload:{outcome:value,slot,reference:"test-observation"}});
test("order review replays unknown and reported outcomes; contradictions require review",t=>{
 const path=setup(t);let s=openProjectStore(path,{now:()=>1000});
 try{
  s.create(input);
  const j=s.orderReview;
  assert.equal(j.append("p","o",register).order.status,"RECORDED");
  assert.equal(j.append("p","o",register).status,"ALREADY_RECORDED");
  assert.throws(()=>j.append("p","other",{...register,event_id:"duplicate"}),/ORDER_REVIEW_DUPLICATE_SIGNATURE/);
  assert.equal(j.append("p","o",outcome("unknown",1,"UNKNOWN",null)).order.status,"OUTCOME_UNKNOWN");
  assert.throws(()=>j.append("p","o",outcome("stale",1,"SUCCESS",10)),/ORDER_REVIEW_REVISION_CONFLICT/);
  assert.equal(j.append("p","o",outcome("reported",2,"SUCCESS",10)).order.status,"REPORTED_SUCCESS");
  assert.throws(()=>j.append("p","o",outcome("downgrade",3,"UNKNOWN",null)),/ORDER_OUTCOME_CANNOT_BE_DOWNGRADED/);
  assert.equal(j.append("p","o",outcome("contradiction",3,"FAILURE",10)).order.status,"REVIEW_REQUIRED");
  assert.throws(()=>j.append("p","o",outcome("clear",4,"SUCCESS",10)),/ORDER_REVIEW_REQUIRED/);
  assert.equal(s.get("p").revision,1);
 }finally{s.close();}
 s=openProjectStore(path);
 try{const [order]=s.orderReview.list("p");assert.equal(order.revision,4);assert.equal(order.source_attestation,"UNKNOWN");assert.equal(order.execution_enabled,false);assert.equal(order.settlement_allowed,false);assert.equal(s.orderReview.events("p","o").length,4);}
 finally{s.close();}
 const raw=new DatabaseSync(path);
 try{assert.throws(()=>raw.exec("UPDATE order_review_event SET event_json='{}'"),/ORDER_REVIEW_IMMUTABLE/);assert.throws(()=>raw.exec("DELETE FROM order_review_event"),/ORDER_REVIEW_IMMUTABLE/);}
 finally{raw.close();}
});
test("scope, event id conflicts and unsupported commands fail closed",t=>{
 const path=setup(t),s=openProjectStore(path,{now:()=>1000});
 try{
  s.create(input);s.create({...input,project_id:"q"});
  const j=s.orderReview;j.append("p","o",register);
  assert.throws(()=>j.append("q","o",register),/ORDER_REVIEW_IDEMPOTENCY_CONFLICT/);
  assert.throws(()=>j.append("p","o",{...outcome("bad",1,"SUCCESS",10),type:"EXECUTE"}),/UNSUPPORTED_ORDER_REVIEW_EVENT/);
  assert.throws(()=>j.append("q","o",{...register,event_id:"historical",payload:{source_mode:"ARCHIVED_HISTORICAL",signature:sig}}),/ORDER_REVIEW_PROJECT_IDENTITY_INCOMPLETE/);
  assert.equal(j.list("q").length,0);
 }finally{s.close();}
});

test("historical receipt import is atomic, scoped and idempotent",t=>{
 const path=setup(t),s=openProjectStore(path,{now:()=>1000});
 const mint="11111111111111111111111111111112",pin="11111111111111111111111111111111";
 try{
  s.create({...input,network:{cluster:"localnet",genesis_hash:pin},token:{mint,issuance_signature:sig}});
  const a="a".repeat(64),b="b".repeat(64),sample={signature:sig,slot:10,outcome:"SUCCESS"};
  const j=s.orderReview;
  assert.equal(j.importReceipts("p",1,a,[sample]).imported,1);
  assert.equal(j.importReceipts("p",1,a,[sample]).already_present,1);
  assert.throws(()=>j.importReceipts("p",1,b,[{signature:"2".repeat(64),slot:11,outcome:"SUCCESS"},{...sample,slot:12}]),/ORDER_IMPORT_EXISTING_CONFLICT/);
  assert.equal(j.list("p").length,1);
  const [o]=j.list("p");assert.equal(o.status,"REPORTED_SUCCESS");assert.equal(j.events("p",o.order_id)[1].event.payload.reference,a);assert.equal(o.execution_enabled,false);
 }finally{s.close();}
});
