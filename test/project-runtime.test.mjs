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

test("runtime cross-checks canonical account totals against project cash and inventory",()=>{
 const t=treasury("t","887");
 t.payload.inventory={closing_quantity_base_units:"50",remaining_cost_base_units:"100",supplied_historical_value_base_units:"90"};
 t.payload.account_set={status:"INTERNALLY_CONSISTENT",totals:{cashBaseUnits:"887",tokenAmountBaseUnits:"50",costBasisBaseUnits:"100",inventoryValueBaseUnits:"90"},coverage:{status:"DECLARED_LABELS_MATCH"}};
 const row=buildProjectBusinessReview(p,[link(),t]).runtime.asset_intervals[0];
 assert.equal(row.assets.cash,"887");assert.equal(row.account_coverage.checks.find(c=>c.field==="cash").status,"DECLARED_MATCH");
 assert.equal(row.account_coverage.checks.find(c=>c.field==="nav").status,"UNKNOWN");
 assert.equal(row.account_coverage.ownership_attestation,"UNKNOWN");
});
test("wallet aggregate discrepancy suppresses historical interval amounts",()=>{
 const t=treasury("t","887");
 t.payload.account_set={status:"INTERNALLY_CONSISTENT",totals:{cashBaseUnits:"886"},coverage:{status:"DECLARED_LABELS_MATCH"}};
 const v=buildProjectBusinessReview(p,[link(),t]),row=v.runtime.asset_intervals[0];
 assert.equal(v.status,"REVIEW_REQUIRED");assert.equal(row.status,"REVIEW_REQUIRED");
 assert.ok(Object.values(row.assets).every(x=>x===null));
 assert.ok(v.findings.some(f=>f.code==="ACCOUNT_PROJECT_TOTAL_CONFLICT:cash"));
 assert.ok(row.account_coverage.checks.every(c=>c.project_value===null&&c.account_total===null));
});
test("unknown account coverage cannot certify ownership even with matching amounts",()=>{
 const t=treasury("t","0");
 t.payload.account_set={status:"PARTIAL",totals:{cashBaseUnits:"0"},coverage:{status:"LABEL_SET_DIFFERS"}};
 const row=buildProjectBusinessReview(p,[link(),t]).runtime.asset_intervals[0];
 assert.equal(row.assets.cash,"0");assert.equal(row.account_coverage.checks.find(c=>c.field==="cash").status,"UNKNOWN");
 assert.equal(row.account_coverage.registered_label_coverage,"LABEL_SET_DIFFERS");assert.equal(row.account_coverage.live_wallet_balance,null);
});
test("malformed or conflicting canonical account totals require review",()=>{
 const t=treasury("t","0");
 t.payload.account_set={status:"INTERNALLY_CONSISTENT",totals:{cashBaseUnits:"-1"}};
 assert.equal(buildProjectBusinessReview(p,[link(),t]).runtime.asset_intervals[0].status,"REVIEW_REQUIRED");
 const x=treasury("x","0");x.payload.account_set={status:"INTERNALLY_CONSISTENT",totals:{cashBaseUnits:"1"}};
 t.payload.account_set.totals.cashBaseUnits="0";
 assert.equal(buildProjectBusinessReview(p,[link(),t,x]).runtime.asset_intervals[0].status,"REVIEW_REQUIRED");
});
