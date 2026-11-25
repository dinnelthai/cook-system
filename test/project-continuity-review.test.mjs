import test from "node:test";
import assert from "node:assert/strict";
import {createProjectAggregate} from "../src/inner-market/project-aggregate.mjs";
import {buildProjectBusinessReview} from "../src/inner-market/project-business-review.mjs";
const pin="11111111111111111111111111111111",mint="11111111111111111111111111111112",digest="a".repeat(64),sig="1".repeat(64);
const p=createProjectAggregate({project_id:"continuity",profile:{name:"Continuity",symbol:"CONT"},network:{cluster:"localnet",genesis_hash:pin},token:{mint,issuance_signature:sig}},{now:()=>100});
const a=(id,kind,body)=>({archive_id:id,kind,project_id:p.project_id,project_revision:1,stale:false,payload:{project_id:p.project_id,project_revision:1,source_attestation:"UNKNOWN",execution_enabled:false,...body}});
const link=(id="link",d=digest)=>a(id,"HISTORICAL_REPORT_LINK",{status:"DECLARED_MATCH",report_digest:d,scope:{projectId:p.project_id,tokenMint:mint,genesisHash:pin,network:"local_sim",quoteAsset:"SOL_LAMPORTS",openingCutoff:id+"start",closingCutoff:id+"end"}});
const treasury=(id="link",d=digest)=>a("t"+id,"TREASURY_REVIEW",{status:"PARTIAL",report_link_archive_id:id,report_digest:d,cash_flow:{closing_cash_difference_base_units:"0",creator_fee_cash_receipts_base_units:"2"},inventory:{closing_quantity_base_units:"0",remaining_cost_base_units:"0"},creator_receivables:{closing_receivable_base_units:"0",cash_received_base_units:"2"},other_assets_and_liabilities:{closing_other_assets_base_units:"0",closing_liabilities_base_units:"0"},creator_fee_audit:{summary:{verified_cash_income_base_units:"2",verified_closing_receivable_base_units:"0"}}});
const close=(id="link",d=digest)=>a("c"+id,"PROJECT_CLOSE_REVIEW",{status:"PARTIAL",report_link_archive_id:id,report_digest:d,cash_difference_base_units:"0",residuals:["TOKEN_INVENTORY","CREATOR_RECEIVABLE","OTHER_ASSETS","LIABILITIES"].map(kind=>({kind,value:"0"}))});
test("matching closed interval values do not grant settlement permission",()=>{
 const records=[link(),treasury(),close()],before=structuredClone(records),v=buildProjectBusinessReview(p,records).continuity;
 assert.equal(v.intervals[0].status,"DECLARED_MATCH");assert.equal(v.settlement_allowed,false);assert.equal(v.project_wide_settlement,"UNKNOWN");assert.deepEqual(records,before);
});
test("contradictory inventory is propagated to the business review",()=>{
 const c=close();c.payload.residuals[0].value="1";
 const v=buildProjectBusinessReview(p,[link(),treasury(),c]);
 assert.ok(v.findings.some(x=>x.code==="CONTINUITY_TOKEN_INVENTORY_CONFLICT"));assert.equal(v.status,"REVIEW_REQUIRED");
});
test("creator accrual is not substituted for missing cash and mismatches are visible",()=>{
 const t=treasury();t.payload.creator_fee_audit.summary.verified_cash_income_base_units="3";
 const v=buildProjectBusinessReview(p,[link(),t,close()]);
 assert.ok(v.findings.some(x=>x.code==="CONTINUITY_CREATOR_CASH_RECEIPT_CONFLICT"));
 t.payload.creator_fee_audit.summary.verified_cash_income_base_units=null;
 assert.equal(buildProjectBusinessReview(p,[link(),t,close()]).continuity.intervals[0].checks.find(x=>x.id==="creator_cash_receipt").status,"UNKNOWN");
});
test("separate reports never cross-fill closing evidence",()=>{
 const d="b".repeat(64),v=buildProjectBusinessReview(p,[link(),treasury(),link("second",d),close("second",d)]).continuity;
 assert.ok(v.intervals.every(i=>i.checks.find(c=>c.id==="token_inventory").status==="UNKNOWN"));
});
test("conflicting migration milestone declarations are not silently selected",()=>{
 const h=(id,signature)=>a(id,"GRADUATION_HISTORY_REVIEW",{status:"PARTIAL",milestones:[{stage:"PUMPSWAP_ACTIVE",status:"REPLAY_MATCH_NOT_ATTESTED",evidence:{signature,slot:100}}]});
 const v=buildProjectBusinessReview(p,[h("one",sig),h("two","2".repeat(64))]);
 assert.equal(v.continuity.milestones[2].status,"REVIEW_REQUIRED");assert.equal(v.status,"REVIEW_REQUIRED");
});
