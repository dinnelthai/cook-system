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
