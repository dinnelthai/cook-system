import test from "node:test";
import assert from "node:assert/strict";
import {createProjectAggregate} from "../src/inner-market/project-aggregate.mjs";
import {reviewProjectConfiguration,describeOfflineWorkflow} from "../src/inner-market/project-offline-workflow.mjs";
import {buildProjectBusinessReview} from "../src/inner-market/project-business-review.mjs";
const creator="11111111111111111111111111111111";
const make=(limits={},allocation=null)=>createProjectAggregate({project_id:"workflow",profile:{name:"Workflow",symbol:"FLOW"},
 network:{cluster:"localnet",genesis_hash:creator},token:{creator_wallet_address:creator,supply_base_units:"1000",decimals:0},limits,
 wallet_group:{group_id:"dev-wallets",name:"Dev",purpose:"DEV",members:[{wallet_address:creator,role:"DEV",enabled:true,allocation_limit_base_units:allocation}]}},{now:()=>100});
test("configuration distinguishes missing declarations from zero and checks exact caps",()=>{
 const p=make({max_project_budget_base_units:"900719925474099300",max_wallet_exposure_base_units:"900719925474099301",max_order_size_base_units:"0",max_drawdown_bps:0},"900719925474099302");
 const before=structuredClone(p),v=reviewProjectConfiguration(p);
 assert.equal(v.status,"REVIEW_REQUIRED");
 assert.ok(v.issues.includes("WALLET_CAP_ABOVE_PROJECT_CAP"));
 assert.ok(v.issues.includes("MEMBER_CAP_ABOVE_WALLET_CAP"));
 assert.equal(v.budget.sum_of_known_declared_member_caps_base_units,"900719925474099302");
 assert.equal(v.budget.available_balance,null);assert.equal(v.execution_enabled,false);assert.deepEqual(p,before);
});
test("complete static configuration never grants execution",()=>{
 const p=make({max_project_budget_base_units:"100",max_wallet_exposure_base_units:"50",max_order_size_base_units:"10",max_drawdown_bps:0},"25");
 const v=reviewProjectConfiguration(p);assert.equal(v.status,"DECLARATIONS_PRESENT");
 assert.equal(v.issuance.observed,false);assert.equal(v.wallets.ownership_attestation,"UNKNOWN");
 const b=buildProjectBusinessReview(p);
 assert.equal(b.configuration.status,"DECLARATIONS_PRESENT");assert.equal(b.offline_workflow.status,"EVIDENCE_INCOMPLETE");
 assert.equal(b.offline_workflow.settlement_allowed,false);
});
test("missing configuration is explicit",()=>{
 const v=reviewProjectConfiguration(make());assert.equal(v.status,"CONFIGURATION_INCOMPLETE");
 assert.ok(v.missing.includes("ACTIVE_MEMBER_CAPS_INCOMPLETE"));assert.equal(v.budget.members_missing_cap,1);
});
test("separate intervals cannot jointly satisfy single-interval coverage",()=>{
 const mk=(id,kind)=>({archive_id:id,report_digest:id,opening_cutoff:id+"a",closing_cutoff:id+"b",reviews:[{kind,archive_id:id,status:"PARTIAL"}]});
 const v=describeOfflineWorkflow({configuration:{issues:[],status:"DECLARATIONS_PRESENT"},lifecycle:{recorded_stage:"DRAFT",blockers:[]},intervals:[mk("a","TREASURY_REVIEW"),mk("b","MARKET_EVIDENCE_REVIEW")],receipts:[{status:"UNRESOLVED"}],risk:{status:"EVIDENCE_INCOMPLETE"},findings:[]});
 assert.ok(v.intervals.every(i=>i.status==="INCOMPLETE"));assert.equal(v.cross_interval_totals,null);assert.equal(v.unresolved_order_count,1);
 assert.equal(v.lifecycle_mutated,false);
});
test("integrated review surfaces configuration conflicts without mutation",()=>{
 const p=make({max_project_budget_base_units:"1",max_order_size_base_units:"2"});
 const v=buildProjectBusinessReview(p);
 assert.equal(v.status,"REVIEW_REQUIRED");assert.equal(v.offline_workflow.status,"REVIEW_REQUIRED");
 assert.equal(v.execution_enabled,false);assert.equal(v.settlement_allowed,false);
});
