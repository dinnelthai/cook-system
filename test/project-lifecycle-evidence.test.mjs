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

test("same-revision identity and scope contradictions are explicit even alongside matching records",()=>{
 const good=row("OBSERVATIONS_MATCH"),wrong=structuredClone(good);wrong.archive_id="wrong";wrong.payload.mint=pin;
 const invalid=structuredClone(good);invalid.archive_id="invalid";invalid.payload.project_revision=99;
 const r=describeProjectLifecycleEvidence(p,[good,wrong,invalid]);
 assert.equal(r.issuance.status,"REVIEW_REQUIRED");assert.ok(r.issuance.archive_ids.includes("wrong"));
 assert.ok(r.blockers.includes("CURRENT_ARCHIVE_SCOPE_CONFLICT"));assert.ok(r.blockers.includes("CURRENT_OBSERVATION_IDENTITY_CONFLICT"));
 assert.equal(r.evidence_conflicts.length,2);assert.equal(r.execution_enabled,false);
});
test("unresolved old-revision orders cannot disappear from lifecycle review",()=>{
 const r=describeProjectLifecycleEvidence(p,[],[
 {project_id:p.project_id,project_revision:0,stale:true,order_id:"old",status:"OUTCOME_UNKNOWN"},
 {project_id:"other",project_revision:0,stale:true,order_id:"foreign",status:"OUTCOME_UNKNOWN"}]);
 assert.equal(r.order_review_count,0);assert.equal(r.stale_order_count,1);assert.equal(r.unresolved_order_count,1);
 assert.ok(r.blockers.includes("ORDER_EVIDENCE_UNRESOLVED"));assert.ok(r.blockers.includes("STALE_ORDER_EVIDENCE"));
 assert.equal(r.historical_stage_path_inferred,false);
});
test("unknown market observations do not silently count as matched evidence",()=>{
 const a={...row("OBSERVATIONS_MATCH"),kind:"MARKET_OBSERVATION",payload:{...row("OBSERVATIONS_MATCH").payload,market_id:"unregistered"}};
 const r=describeProjectLifecycleEvidence(p,[a]);
 assert.ok(r.blockers.includes("CURRENT_OBSERVATION_IDENTITY_CONFLICT"));assert.equal(r.evidence_conflicts.length,1);
});
