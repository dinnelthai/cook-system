import test from "node:test";
import assert from "node:assert/strict";
import {createProjectAggregate} from "../src/inner-market/project-aggregate.mjs";
import {describeProjectLifecycleEvidence} from "../src/inner-market/project-lifecycle-evidence.mjs";
const pin="11111111111111111111111111111111",mint="11111111111111111111111111111112",sig="1".repeat(64);
const p=createProjectAggregate({project_id:"lifecycle-review",profile:{name:"Lifecycle",symbol:"LIFE"},network:{cluster:"localnet",genesis_hash:pin},token:{mint,issuance_signature:sig}});
const row=(status,overrides={})=>({archive_id:"sample-"+status,kind:"ISSUANCE_OBSERVATION",project_id:p.project_id,project_revision:p.revision,stale:false,payload:{project_id:p.project_id,project_revision:p.revision,mint,signature:sig,status,source_attestation:"UNKNOWN",execution_enabled:false},...overrides});
test("project evidence coverage never promotes recorded lifecycle or execution",()=>{
 const before=structuredClone(p),r=describeProjectLifecycleEvidence(p,[row("OBSERVATIONS_MATCH")]);
 assert.equal(r.issuance.status,"OBSERVED_NOT_ATTESTED");assert.equal(r.recorded_stage,p.lifecycle.stage);
 assert.equal(r.execution_enabled,false);assert.equal(r.settlement_allowed,false);assert.equal(r.lifecycle_mutated,false);
 assert.ok(r.blockers.includes("INDEPENDENT_ATTESTATION_UNAVAILABLE"));assert.deepEqual(p,before);
});
test("contradictions override matching observations; stale and foreign records are excluded",()=>{
 const r=describeProjectLifecycleEvidence(p,[row("OBSERVATIONS_MATCH"),row("REVIEW_REQUIRED")]);
 assert.equal(r.issuance.status,"REVIEW_REQUIRED");
 const v=describeProjectLifecycleEvidence(p,[row("OBSERVATIONS_MATCH",{project_revision:0,stale:true}),row("OBSERVATIONS_MATCH",{project_id:"other"})]);
 assert.equal(v.issuance.status,"MISSING");assert.equal(v.stale_archive_count,1);
});
