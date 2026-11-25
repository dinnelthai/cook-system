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
 assert.equal(v.status,"SYNTHETIC_REGRESSION_PASS");assert.equal(v.cases.length,13);assert.equal(v.production_ready,false);
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

test("market runtime retains distinct historical intervals and does not infer active venue",()=>{
 const a=link(),b=link();b.archive_id="link2";b.payload.report_digest="b".repeat(64);b.payload.scope={...b.payload.scope,openingCutoff:"end",closingCutoff:"later"};
 const m=(id,linkId,d,status,count)=>({archive_id:id,kind:"MARKET_EVIDENCE_REVIEW",project_id:p.project_id,project_revision:1,stale:false,payload:{project_id:p.project_id,project_revision:1,execution_enabled:false,source_attestation:"UNKNOWN",status:"PARTIAL",report_link_archive_id:linkId,report_digest:d,observed_trade_record_count:count,closed_market_quality:{status,event_count:count}}});
 const v=buildProjectBusinessReview(p,[a,b,m("m1","link",digest,"DESCRIPTIVE_ONLY",2),m("m2","link2","b".repeat(64),"NO_EXECUTIONS",0)]).runtime.market;
 assert.equal(v.curve_intervals.length,2);assert.equal(v.curve_intervals[0].records[0].event_count,2);assert.equal(v.curve_intervals[1].records[0].event_count,0);
 assert.equal(v.active_venue,null);assert.equal(v.common_snapshot_established,false);
});
test("conflicting quality counts withhold interval market evidence",()=>{
 const m=a("m","MARKET_EVIDENCE_REVIEW",{status:"PARTIAL",report_link_archive_id:"link",report_digest:digest,observed_trade_record_count:2,closed_market_quality:{status:"DESCRIPTIVE_ONLY",event_count:3}});
 const v=buildProjectBusinessReview(p,[link(),m]);
 assert.equal(v.status,"REVIEW_REQUIRED");assert.equal(v.runtime.market.curve_intervals[0].records[0].event_count,null);
 assert.ok(v.findings.some(x=>x.code==="RUNTIME_MARKET_QUALITY_CONFLICT"));
});

test("mathematical audit count contradiction withholds linked assets and other financial projections",()=>{
 const t=treasury("t","887");
 t.payload.inventory={closing_quantity_base_units:"50",remaining_cost_base_units:"100",supplied_historical_value_base_units:"90"};
 t.payload.mathematical_audit={status:"ARITHMETIC_MATCH",counts:{pass:2,review_required:0,unknown:0},checks:[{status:"PASS"}]};
 const v=buildProjectBusinessReview(p,[link(),t]);
 const row=v.runtime.asset_intervals[0];
 assert.equal(v.status,"REVIEW_REQUIRED");assert.equal(row.status,"REVIEW_REQUIRED");
 assert.ok(row.evidence_conflict_codes.includes("FINANCIAL_IDENTITY_COUNT_CONFLICT"));
 assert.ok(Object.values(row.assets).every(x=>x===null));
 assert.ok(Object.values(v.model_evidence.intervals[0].evidence[0].inventory).every(x=>x===null));
 assert.ok(Object.values(v.operating_components.rows[0].components).every(x=>x===null));
});
test("conflicting report versions quarantine both intervals without suppressing unrelated interval",()=>{
 const l=link(),b=link(),c=link();
 b.archive_id="link2";b.payload.report_digest="b".repeat(64);
 c.archive_id="link3";c.payload.report_digest="c".repeat(64);c.payload.scope={...c.payload.scope,openingCutoff:"end",closingCutoff:"later"};
 const t=treasury("t","1"),u=treasury("u","2"),w=treasury("w","3");
 u.payload.report_link_archive_id=b.archive_id;u.payload.report_digest=b.payload.report_digest;
 w.payload.report_link_archive_id=c.archive_id;w.payload.report_digest=c.payload.report_digest;
 const v=buildProjectBusinessReview(p,[l,b,c,t,u,w]);
 for(const row of v.runtime.asset_intervals.slice(0,2)){
  assert.equal(row.status,"REVIEW_REQUIRED");assert.ok(row.evidence_conflict_codes.includes("MULTIPLE_REPORT_DIGESTS_FOR_INTERVAL"));
  assert.ok(Object.values(row.assets).every(x=>x===null));
 }
 assert.equal(v.runtime.asset_intervals[2].assets.cash,"3");
 assert.equal(v.execution_enabled,false);
});
test("wrong review digest invalidates the referenced interval even if another review matches",()=>{
 const t=treasury("t","1"),bad=treasury("bad","1");bad.payload.report_digest="b".repeat(64);
 const v=buildProjectBusinessReview(p,[link(),t,bad]);
 assert.equal(v.runtime.asset_intervals[0].status,"REVIEW_REQUIRED");
 assert.equal(v.runtime.asset_intervals[0].assets.cash,null);
 assert.ok(v.runtime.asset_intervals[0].evidence_conflict_codes.includes("INTERVAL_REPORT_DIGEST_CONFLICT"));
});

test("historical runtime never adds pool reserve or synthetic LP fields to declared NAV",()=>{
 const t=treasury("t","100");
 t.payload.other_assets_and_liabilities={closing_other_assets_base_units:"25",closing_liabilities_base_units:"0"};
 t.payload.historical_valuation={closing_nav_base_units:"125"};
 t.payload.lp_assets={position_value_base_units:"999",fee_cash_base_units:"777",fee_receivable_base_units:"888"};
 t.payload.pool_reserves_base_units="1000000";
 const row=buildProjectBusinessReview(p,[link(),t]).runtime.asset_intervals[0];
 assert.equal(row.assets.nav,"125");assert.equal(row.assets.other_assets,"25");assert.equal(row.assets.cash,"100");
 assert.equal(row.lp_assets,null);assert.equal(row.lp_evidence.position_value_base_units,null);
 assert.equal(row.lp_evidence.fee_cash_base_units,null);assert.equal(row.lp_evidence.fee_receivable_base_units,null);
 assert.equal(row.lp_evidence.other_assets_lp_attribution,"UNKNOWN");
 assert.equal(row.lp_evidence.project_nav_inclusion,"NOT_ESTABLISHED");
 assert.equal(row.lp_evidence.pool_fee_bucket_cash_equivalence,"NOT_ESTABLISHED");
});
