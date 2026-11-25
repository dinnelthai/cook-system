import test from "node:test";
import assert from "node:assert/strict";
import {createProjectAggregate} from "../src/inner-market/project-aggregate.mjs";
import {describeProjectRiskReview} from "../src/inner-market/project-risk-review.mjs";
const p=createProjectAggregate({project_id:"risk",profile:{name:"Risk",symbol:"RISK"}});
const archive=(status,overrides={})=>({project_id:p.project_id,project_revision:p.revision,stale:false,kind:"TREASURY_REVIEW",archive_id:"a-"+status,payload:{project_id:p.project_id,project_revision:p.revision,status,source_attestation:"UNKNOWN",execution_enabled:false},...overrides});
test("missing evidence never yields safe or live risk status",()=>{
 const r=describeProjectRiskReview(p);assert.ok(r.counts.unknown>0);assert.equal(r.execution_enabled,false);assert.equal(r.live_risk_assessed,false);assert.equal(r.settlement_allowed,false);
 assert.ok(r.findings.some(f=>f.code==="TREASURY_REVIEW_MISSING"));
});
test("current conflicts dominate partial reviews; stale and foreign archive evidence cannot pass current checks",()=>{
 const r=describeProjectRiskReview(p,[archive("PARTIAL"),archive("REVIEW_REQUIRED")]);
 assert.equal(r.status,"REVIEW_REQUIRED");assert.ok(r.findings.some(f=>f.code==="TREASURY_EVIDENCE_CONFLICT"&&f.severity==="CRITICAL"));
 const v=describeProjectRiskReview(p,[archive("REVIEW_REQUIRED",{project_id:"other"}),archive("REVIEW_REQUIRED",{project_revision:0,stale:true})]);
 assert.equal(v.counts.critical,0);assert.ok(v.findings.some(f=>f.code==="STALE_ARCHIVES_EXIST"));
});
test("order receipt review cannot hide contradiction or reuse a mismatched order head",()=>{
 const o={project_id:p.project_id,project_revision:p.revision,stale:false,order_id:"order",revision:2,head_hash:"head",signature:"sig",status:"REPORTED_SUCCESS"};
 const a={...archive("PARTIAL"),kind:"ORDER_RECEIPT_REVIEW",payload:{...archive("PARTIAL").payload,order_id:"order",order_revision:2,order_head_hash:"wrong",signature:"sig",status:"INTERNAL_MATCH",rpc_observation:{status:"DECLARED_SAMPLE_MATCH"}}};
 const r=describeProjectRiskReview(p,[a],[o]);assert.ok(r.findings.some(f=>f.code==="RECEIPT_EVIDENCE_INCOMPLETE"));
 a.payload.order_head_hash="head";a.payload.rpc_observation.status="REVIEW_REQUIRED";
 assert.equal(describeProjectRiskReview(p,[a],[o]).status,"REVIEW_REQUIRED");
});
