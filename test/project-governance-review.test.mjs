import test from "node:test";
import assert from "node:assert/strict";
import {createProjectAggregate} from "../src/inner-market/project-aggregate.mjs";
import {describeProjectDirectory} from "../src/inner-market/project-governance-review.mjs";
import {buildProjectBusinessReview} from "../src/inner-market/project-business-review.mjs";
const pin="11111111111111111111111111111111",mint="11111111111111111111111111111112",digest="a".repeat(64);
const make=(id,genesis=pin)=>createProjectAggregate({project_id:id,profile:{name:"Project",symbol:"TEST"},network:{cluster:"localnet",genesis_hash:genesis},
 token:{mint,issuance_signature:"1".repeat(64)}},{now:()=>100});
test("directory reports duplicate mint registrations within the same network only",()=>{
 const a=make("a"),b=make("b"),c=make("c",mint),before=structuredClone([a,b,c]);
 const v=describeProjectDirectory([a,b,c]);
 assert.deepEqual(v.findings,[{code:"DUPLICATE_MINT_REGISTRATION",project_ids:["a","b"]}]);
 assert.equal(v.portfolio_nav,null);assert.equal(v.execution_enabled,false);assert.deepEqual([a,b,c],before);
});
test("unknown network scope and duplicate project IDs are explicit",()=>{
 const a=make("a",null),b=make("b",null);
 assert.equal(describeProjectDirectory([a,b]).findings.length,0);
 assert.equal(describeProjectDirectory([a,b]).projects[0].network_scope_present,false);
 assert.throws(()=>describeProjectDirectory([a,a]),/DUPLICATE_DIRECTORY_PROJECT_ID/);
});
test("launch prerequisites are not recommendation or demand prediction",()=>{
 const v=buildProjectBusinessReview(make("a")).launch_review;
 assert.equal(v.status,"EVIDENCE_INCOMPLETE");assert.equal(v.launch_recommended,null);
 assert.equal(v.checks.find(c=>c.id==="legal_and_platform_review").status,"NOT_ASSESSED");
});
const p=make("p");
const archive=(id,kind,body)=>({archive_id:id,kind,project_id:p.project_id,project_revision:1,stale:false,payload:{project_id:p.project_id,project_revision:1,execution_enabled:false,source_attestation:"UNKNOWN",...body}});
const link=archive("link","HISTORICAL_REPORT_LINK",{status:"DECLARED_MATCH",report_digest:digest,scope:{projectId:p.project_id,tokenMint:mint,genesisHash:pin,network:"local_sim",quoteAsset:"SOL_LAMPORTS",openingCutoff:"start",closingCutoff:"end"}});
const treasury=values=>archive("t","TREASURY_REVIEW",{status:"PARTIAL",report_link_archive_id:"link",report_digest:digest,realized_pnl:values});
test("signed accounting output retained as exact string, no causal conclusion",()=>{
 const t=treasury({trade_realized_pnl_base_units:"-900719925474099300",creator_cash_income_base_units:"0"});
 const v=buildProjectBusinessReview(p,[link,t]).operating_components;
 assert.equal(v.rows[0].components.trade_realized_pnl_base_units,"-900719925474099300");
 assert.equal(v.rows[0].components.creator_cash_income_base_units,"0");
 assert.equal(v.rows[0].components.project_cash_basis_realized_pnl_base_units,null);
 assert.equal(v.causal_attribution,"NOT_ESTABLISHED");assert.equal(v.project_wide_pnl,null);
});
test("malformed component withheld and propagated as a conflict",()=>{
 const v=buildProjectBusinessReview(p,[link,treasury({creator_cash_income_base_units:"-1"})]);
 assert.equal(v.status,"REVIEW_REQUIRED");
 assert.equal(v.operating_components.rows[0].components.creator_cash_income_base_units,null);
});
