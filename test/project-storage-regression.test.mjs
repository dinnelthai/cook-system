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
