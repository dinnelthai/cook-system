import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {openProjectStore} from "../src/inner-market/project-store.mjs";
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
