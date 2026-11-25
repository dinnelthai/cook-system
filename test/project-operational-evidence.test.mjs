import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {openProjectStore} from "../src/inner-market/project-store.mjs";
import {createProjectAggregate} from "../src/inner-market/project-aggregate.mjs";
import {buildProjectBusinessReview} from "../src/inner-market/project-business-review.mjs";
const input={project_id:"ops",profile:{name:"Ops",symbol:"OPS"}};
const p=createProjectAggregate(input,{now:()=>100});
const archive=(pool_evidence)=>({archive_id:"g",kind:"GRADUATION_HISTORY_REVIEW",project_id:p.project_id,project_revision:1,stale:false,payload:{project_id:p.project_id,project_revision:1,execution_enabled:false,source_attestation:"UNKNOWN",status:"PARTIAL",milestones:[],pool_evidence}});
const pool={pool_address:"11111111111111111111111111111111",linked_to_migration:true,replay_status:"PASS",snapshot_status:"PASS",snapshot_slot:10};
test("historical pool replay evidence never implies live liquidity or ownership",()=>{
 const r=buildProjectBusinessReview(p,[archive([pool])]).operational_evidence;
 assert.equal(r.pools[0].status,"DECLARED_REPLAY_MATCH");assert.equal(r.pools[0].live_depth,null);
 assert.equal(r.lp_position_ownership,"UNKNOWN");assert.equal(r.execution_enabled,false);
});
test("pool conflict and duplicate records propagate to overall review",()=>{
 const r=buildProjectBusinessReview(p,[archive([pool,{...pool,snapshot_status:"FAIL"}])]);
 assert.equal(r.status,"REVIEW_REQUIRED");assert.ok(r.findings.some(x=>x.code==="OUTER_POOL_EVIDENCE_CONFLICT"));
});
test("legacy graduation archives cannot imply pool coverage",()=>{
 const a=archive([]);delete a.payload.pool_evidence;
 const r=buildProjectBusinessReview(p,[a]).operational_evidence;
 assert.equal(r.pools.length,0);assert.ok(r.unknown.some(x=>x.code==="POOL_EVIDENCE_NOT_RETAINED"));
});
test("unknown order remains unresolved across database reopen and export",t=>{
 const dir=mkdtempSync(join(tmpdir(),"cook-ops-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(realpathSync(dir),"projects.sqlite");let s=openProjectStore(path,{now:()=>1000});let before;
 try{
  s.create(input);
  s.orderReview.append("ops","o",{event_id:"record",expected_revision:0,expected_project_revision:1,type:"REGISTER_OBSERVATION",payload:{source_mode:"SYNTHETIC",signature:"1".repeat(64)}});
  s.orderReview.append("ops","o",{event_id:"unknown",expected_revision:1,expected_project_revision:1,type:"OBSERVE_OUTCOME",payload:{outcome:"UNKNOWN",slot:null,reference:"fixture"}});
  before=s.getBusinessReview("ops").operational_evidence;
  assert.equal(before.order_exceptions[0].retry_allowed,false);
 }finally{s.close();}
 s=openProjectStore(path);
 try{
  const after=s.getBusinessReview("ops").operational_evidence;
  assert.deepEqual(after,before);assert.equal(after.independent_recovery_verified,false);
  const bundle=s.exportAuditBundle("ops",1);
  assert.deepEqual(bundle.business_review.operational_evidence,after);assert.equal(bundle.settlement_allowed,false);
 }finally{s.close();}
});
test("foreign unresolved orders do not enter exception queue",()=>{
 const r=buildProjectBusinessReview(p,[],[{project_id:"foreign",order_id:"x",project_revision:1,status:"OUTCOME_UNKNOWN"}]);
 assert.equal(r.operational_evidence.order_exceptions.length,0);
});
