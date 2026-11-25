import test from "node:test";
import assert from "node:assert/strict";
import {createProjectAggregate} from "../src/inner-market/project-aggregate.mjs";
import {buildProjectBusinessReview} from "../src/inner-market/project-business-review.mjs";
const pin="11111111111111111111111111111111",mint="11111111111111111111111111111112";
const p=createProjectAggregate({project_id:"business",profile:{name:"Business",symbol:"BIZ"},network:{cluster:"localnet",genesis_hash:pin},token:{mint,issuance_signature:"1".repeat(64)}},{now:()=>100});
const digest="a".repeat(64);
const archive=(id,kind,payload)=>({archive_id:id,kind,project_id:p.project_id,project_revision:1,stale:false,payload:{project_id:p.project_id,project_revision:1,execution_enabled:false,source_attestation:"UNKNOWN",...payload}});
const link=()=>archive("link","HISTORICAL_REPORT_LINK",{status:"DECLARED_MATCH",report_digest:digest,scope:{projectId:p.project_id,tokenMint:mint,genesisHash:pin,network:"local_sim",quoteAsset:"SOL_LAMPORTS",openingCutoff:"start",closingCutoff:"end"}});
const treasury=()=>archive("treasury","TREASURY_REVIEW",{status:"PARTIAL",report_link_archive_id:"link",report_digest:digest});
const market=()=>archive("market","MARKET_EVIDENCE_REVIEW",{status:"PARTIAL",report_link_archive_id:"link",report_digest:digest});
test("unified review associates evidence but never sums intervals or authenticates source",()=>{
 const input=[link(),treasury(),market()],copy=structuredClone(input),v=buildProjectBusinessReview(p,input);
 assert.equal(v.status,"EVIDENCE_INCOMPLETE");assert.equal(v.intervals.length,1);
 assert.equal(v.treasury.review_count,1);assert.equal(v.market.review_count,1);
 assert.equal(v.treasury.project_wide_total,null);assert.equal(v.data_integration.real_data_connected,false);
 assert.equal(v.data_integration.gates.find(g=>g.id==="independent_financial_parity").status,"NOT_RUN");
 assert.equal(v.execution_enabled,false);assert.deepEqual(input,copy);
});
test("link identity and digest conflicts cannot disappear behind partial review status",()=>{
 const bad=treasury();bad.payload.report_digest="b".repeat(64);
 const v=buildProjectBusinessReview(p,[link(),bad,market()]);
 assert.equal(v.status,"REVIEW_REQUIRED");assert.equal(v.treasury.review_count,0);
 assert.ok(v.findings.some(x=>x.code==="REVIEW_REPORT_LINK_CONFLICT"));
 const duplicate=link();duplicate.archive_id="link2";duplicate.payload.report_digest="c".repeat(64);
 assert.ok(buildProjectBusinessReview(p,[link(),duplicate]).findings.some(x=>x.code==="MULTIPLE_REPORT_DIGESTS_FOR_INTERVAL"));
});
test("stale conflicting orders still surface and foreign records cannot contribute",()=>{
 const o={project_id:p.project_id,project_revision:0,stale:true,order_id:"old",revision:2,status:"REVIEW_REQUIRED"};
 const v=buildProjectBusinessReview(p,[],[o,{...o,project_id:"foreign"}]);
 assert.equal(v.status,"REVIEW_REQUIRED");assert.equal(v.orders.record_count,1);
 assert.equal(v.orders.records[0].status,"REVIEW_REQUIRED");assert.ok(v.risk.critical>0);
});
