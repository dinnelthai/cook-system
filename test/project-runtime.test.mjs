import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createProjectAggregate} from "../src/inner-market/project-aggregate.mjs";
import {buildProjectBusinessReview} from "../src/inner-market/project-business-review.mjs";
import {runBusinessScenarioAcceptance} from "../src/simulation/business-scenario-acceptance.mjs";
import {reconcileLpStatement} from "../src/inner-market/lp-statement-reconciliation.mjs";
const pin="11111111111111111111111111111111",mint="11111111111111111111111111111112",digest="a".repeat(64);
const p=createProjectAggregate({project_id:"runtime",profile:{name:"Runtime",symbol:"RUN"},network:{cluster:"localnet",genesis_hash:pin},token:{mint,issuance_signature:"1".repeat(64)}},{now:()=>100});
const a=(id,kind,body)=>({archive_id:id,kind,project_id:p.project_id,project_revision:1,stale:false,payload:{project_id:p.project_id,project_revision:1,execution_enabled:false,source_attestation:"UNKNOWN",...body}});
const link=()=>a("link","HISTORICAL_REPORT_LINK",{status:"DECLARED_MATCH",report_digest:digest,scope:{projectId:p.project_id,tokenMint:mint,genesisHash:pin,network:"local_sim",quoteAsset:"SOL_LAMPORTS",openingCutoff:"start",closingCutoff:"end"}});
const treasury=(id,value)=>a(id,"TREASURY_REVIEW",{status:"PARTIAL",report_link_archive_id:"link",report_digest:digest,cash_flow:{observed_closing_cash_base_units:value}});
test("runtime uses single linked interval and never substitutes current capital",()=>{
 const v=buildProjectBusinessReview(p,[link(),treasury("t","9007199254740993")]).runtime;
 assert.equal(v.asset_intervals[0].assets.cash,"9007199254740993");assert.equal(v.asset_intervals[0].assets.nav,null);
 assert.equal(v.live_assets,null);assert.equal(v.selected_interval,null);assert.equal(v.execution_enabled,false);
});
test("conflicting cash declarations withhold interval and raise overall review",()=>{
 const v=buildProjectBusinessReview(p,[link(),treasury("t","0"),treasury("t2","1")]);
 assert.equal(v.runtime.asset_intervals[0].assets.cash,null);assert.equal(v.status,"REVIEW_REQUIRED");
 assert.ok(v.findings.some(x=>x.code==="RUNTIME_ASSET_CONFLICT:cash"));
});
test("foreign and missing archive values do not become zero",()=>{
 const t=treasury("t","0");t.project_id="foreign";
 const v=buildProjectBusinessReview(p,[link(),t]).runtime;
 assert.equal(v.asset_intervals[0].assets.cash,null);
});
test("fixed business scenarios reuse canonical portfolio risk and report workflow",()=>{
 const base=JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
 const v=runBusinessScenarioAcceptance(base);
 assert.equal(v.status,"SYNTHETIC_REGRESSION_PASS");assert.equal(v.cases.length,11);assert.equal(v.production_ready,false);
});
test("LP statement is synthetic-only and cannot establish ownership or valuation",()=>{
 assert.throws(()=>reconcileLpStatement({source_mode:"ARCHIVED_HISTORICAL"}),/INVALID_SYNTHETIC_LP_SCOPE/);
 const v=reconcileLpStatement({source_mode:"SYNTHETIC",position_id:"p",opening_cutoff:"0",closing_cutoff:"1"});
 assert.equal(v.status,"INCOMPLETE");assert.equal(v.position_value,null);
});
