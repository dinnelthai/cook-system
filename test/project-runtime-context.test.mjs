import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {openProjectStore} from "../src/inner-market/project-store.mjs";
import {projectIntervalMetrics} from "../web/project-overview-view.mjs";
const pin="11111111111111111111111111111111",mint="11111111111111111111111111111112";
test("runtime context changes on evidence addition without project revision change",t=>{
 const dir=mkdtempSync(join(tmpdir(),"cook-runtime-context-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const s=openProjectStore(join(realpathSync(dir),"projects.sqlite"),{now:()=>1000});
 try{
  s.create({project_id:"p",profile:{name:"Runtime",symbol:"RUN"},network:{cluster:"localnet",genesis_hash:pin},token:{mint,issuance_signature:"1".repeat(64)}});
  const initial=s.getRuntimeContext("p");
  const a=s.recordArchive("p","HISTORICAL_REPORT_LINK",{project_id:"p",project_revision:1,status:"DECLARED_MATCH",report_digest:"a".repeat(64),scope:{projectId:"p",tokenMint:mint,genesisHash:pin,network:"local_sim",quoteAsset:"SOL_LAMPORTS",openingCutoff:"start",closingCutoff:"end"},source_attestation:"UNKNOWN",execution_enabled:false},1);
  const next=s.getRuntimeContext("p");
  assert.equal(next.project_revision,initial.project_revision);assert.notEqual(next.runtime_context_id,initial.runtime_context_id);
  const request={expected_revision:1,expected_context_id:next.runtime_context_id,report_link_archive_id:a.archive_id};
  const selected=s.getRuntimeContext("p",request);
  assert.equal(selected.selected_interval.report_link_archive_id,a.archive_id);assert.equal(selected.selected_interval.assets.cash,null);
  assert.equal(selected.execution_enabled,false);assert.equal(s.getRuntimeContext("p").selected_interval,null);
  assert.throws(()=>s.getRuntimeContext("p",{...request,expected_context_id:initial.runtime_context_id}),/PROJECT_EVIDENCE_SNAPSHOT_CONFLICT/);
  s.orderReview.append("p","o",{event_id:"o-register",expected_revision:0,expected_project_revision:1,type:"REGISTER_OBSERVATION",payload:{source_mode:"SYNTHETIC",signature:"2".repeat(64)}});
  assert.throws(()=>s.getRuntimeContext("p",request),/PROJECT_EVIDENCE_SNAPSHOT_CONFLICT/);
  assert.equal(s.get("p").revision,1);
 }finally{s.close();}
});

test("persisted conflicting interval versions are withheld from runtime selection and presentation after reopen",t=>{
 const dir=mkdtempSync(join(tmpdir(),"cook-runtime-quarantine-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(realpathSync(dir),"projects.sqlite");
 let s=openProjectStore(path,{now:()=>1000});
 try{
  s.create({project_id:"p",profile:{name:"Review QA",symbol:"QA"},network:{cluster:"localnet",genesis_hash:pin},token:{mint,issuance_signature:"1".repeat(64)}});
  const put=(kind,payload)=>s.recordArchive("p",kind,{project_id:"p",project_revision:1,source_attestation:"UNKNOWN",execution_enabled:false,...payload},1);
  const scope={projectId:"p",tokenMint:mint,genesisHash:pin,network:"local_sim",quoteAsset:"SOL_LAMPORTS",openingCutoff:"start",closingCutoff:"end"};
  const first=put("HISTORICAL_REPORT_LINK",{status:"DECLARED_MATCH",report_digest:"a".repeat(64),scope});
  put("TREASURY_REVIEW",{status:"PARTIAL",report_link_archive_id:first.archive_id,report_digest:"a".repeat(64),cash_flow:{observed_closing_cash_base_units:"887"}});
  const initial=s.getRuntimeContext("p");
  const select={expected_revision:1,expected_context_id:initial.runtime_context_id,report_link_archive_id:first.archive_id};
  const prior=s.getRuntimeContext("p",select).selected_interval;
  assert.equal(prior.assets.cash,"887");assert.equal(prior.lp_assets,null);
  assert.equal(prior.lp_evidence.position_value_base_units,null);assert.equal(prior.lp_evidence.project_nav_inclusion,"NOT_ESTABLISHED");
  put("HISTORICAL_REPORT_LINK",{status:"DECLARED_MATCH",report_digest:"b".repeat(64),scope});
  assert.throws(()=>s.getRuntimeContext("p",select),/PROJECT_EVIDENCE_SNAPSHOT_CONFLICT/);
  s.close();s=null;s=openProjectStore(path,{now:()=>1000});
  const review=s.getBusinessReview("p");
  assert.equal(review.global_risk.status,"REVIEW_REQUIRED");
  const ctx=s.getRuntimeContext("p",{...select,expected_context_id:review.runtime_context_id});
  assert.equal(ctx.selected_interval.status,"REVIEW_REQUIRED");
  assert.ok(Object.values(ctx.selected_interval.assets).every(v=>v===null));
  assert.ok(projectIntervalMetrics(ctx.selected_interval).every(v=>v.value==="—"));
  assert.equal(ctx.selected_interval.lp_evidence.status,"REVIEW_REQUIRED");
  assert.equal(ctx.execution_enabled,false);assert.equal(s.get("p").revision,1);
 }finally{s?.close();}
});

test("audit export pins full evidence context and remains identical to business review after reopen",async t=>{
 const dir=mkdtempSync(join(tmpdir(),"cook-audit-context-"));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(realpathSync(dir),"p.sqlite");let s=openProjectStore(path,{now:()=>1000});
 try{
  s.create({project_id:"p",profile:{name:"Audit QA",symbol:"QA"}});
  const before=s.getBusinessReview("p"),bundle=s.exportAuditBundle("p",1,before.runtime_context_id);
  assert.equal(bundle.runtime_context_id,before.runtime_context_id);
  assert.deepEqual(bundle.business_review,before);
  assert.equal(s.getLifecycleReview("p").runtime_context_id,before.runtime_context_id);
  s.orderReview.append("p","o",{event_id:"register",expected_revision:0,expected_project_revision:1,type:"REGISTER_OBSERVATION",payload:{source_mode:"SYNTHETIC",signature:"1".repeat(64)}});
  assert.throws(()=>s.exportAuditBundle("p",1,before.runtime_context_id),/PROJECT_EVIDENCE_SNAPSHOT_CONFLICT/);
  const after=s.getBusinessReview("p");assert.notEqual(after.runtime_context_id,before.runtime_context_id);assert.equal(after.project_revision,1);
  const latest=s.exportAuditBundle("p",1,after.runtime_context_id);assert.deepEqual(latest.business_review,after);
  s.close();s=null;s=openProjectStore(path,{now:()=>1000});assert.deepEqual(s.exportAuditBundle("p",1,after.runtime_context_id),latest);
  const {checkProjectAuditBundleDigest}=await import("../src/inner-market/project-audit-bundle.mjs");
  const {createHash}=await import("node:crypto");const {canonicalJson}=await import("../src/core/canonical-json.mjs");
  assert.equal(checkProjectAuditBundleDigest(latest).status,"DIGEST_MATCH_NOT_AUTHENTICATED");
  const changed=structuredClone(latest);changed.runtime_context_id="0".repeat(64);delete changed.content_sha256;changed.content_sha256=createHash("sha256").update(canonicalJson(changed),"utf8").digest("hex");
  assert.throws(()=>checkProjectAuditBundleDigest(changed),/PROJECT_AUDIT_BUNDLE_CONTEXT_MISMATCH/);
 }finally{s?.close();}
});
