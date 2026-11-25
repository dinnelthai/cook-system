import test from "node:test";
import assert from "node:assert/strict";
import {createProjectAggregate} from "../src/inner-market/project-aggregate.mjs";
import {buildProjectBusinessReview} from "../src/inner-market/project-business-review.mjs";
const pin="11111111111111111111111111111111",mint="11111111111111111111111111111112",digest="a".repeat(64);
const p=createProjectAggregate({project_id:"model",profile:{name:"Model",symbol:"MODEL"},network:{cluster:"localnet",genesis_hash:pin},token:{mint,issuance_signature:"1".repeat(64)}},{now:()=>100});
const a=(id,kind,body)=>({archive_id:id,kind,project_id:p.project_id,project_revision:1,stale:false,payload:{project_id:p.project_id,project_revision:1,source_attestation:"UNKNOWN",execution_enabled:false,...body}});
const link=()=>a("link","HISTORICAL_REPORT_LINK",{status:"DECLARED_MATCH",report_digest:digest,scope:{projectId:p.project_id,tokenMint:mint,genesisHash:pin,network:"local_sim",quoteAsset:"SOL_LAMPORTS",openingCutoff:"start",closingCutoff:"end"}});
const treasury=(inventory,math)=>a("t","TREASURY_REVIEW",{status:"PARTIAL",report_link_archive_id:"link",report_digest:digest,inventory,mathematical_audit:math});
const market=coverage=>a("m","MARKET_EVIDENCE_REVIEW",{status:"PARTIAL",report_link_archive_id:"link",report_digest:digest,participant_coverage:coverage});
test("historical inventory preserves exact values but not a live balance",()=>{
 const records=[link(),treasury({closing_quantity_base_units:"900719925474099300",remaining_cost_base_units:"0",supplied_historical_value_base_units:null})];
 const before=structuredClone(records),v=buildProjectBusinessReview(p,records).model_evidence;
 assert.equal(v.intervals[0].evidence[0].inventory.closing_quantity_base_units,"900719925474099300");
 assert.equal(v.intervals[0].evidence[0].inventory.remaining_cost_base_units,"0");
 assert.equal(v.live_inventory,null);assert.equal(v.real_market_validated,false);assert.deepEqual(records,before);
});
test("malformed amounts withhold numeric output and propagate review status",()=>{
 const v=buildProjectBusinessReview(p,[link(),treasury({closing_quantity_base_units:"0",remaining_cost_base_units:"-1"})]);
 assert.equal(v.status,"REVIEW_REQUIRED");assert.equal(v.model_evidence.intervals[0].evidence[0].inventory.closing_quantity_base_units,null);
 assert.ok(v.findings.some(x=>x.code==="INVENTORY_FIELD_INVALID:remaining_cost_base_units"));
});
test("mathematical audit count contradiction is not accepted",()=>{
 const v=buildProjectBusinessReview(p,[link(),treasury({}, {status:"ARITHMETIC_MATCH",counts:{pass:1,unknown:0,review_required:0},checks:[]})]);
 assert.ok(v.findings.some(x=>x.code==="FINANCIAL_IDENTITY_COUNT_CONFLICT"));assert.equal(v.status,"REVIEW_REQUIRED");
});
test("empty records and uncalibrated simulation are not independent demand",()=>{
 const v=buildProjectBusinessReview(p,[link(),market({status:"NO_RECORDS",record_count:0,reconciled_record_count:0,declared_address_record_count:0,missing_address_record_count:0,independent_participant_count:null})]).model_evidence;
 assert.equal(v.intervals[0].evidence[0].status,"PARTIAL");assert.equal(v.independent_demand,null);assert.equal(v.participant_model.historical_calibration_status,"NOT_PERFORMED");
});
test("inconsistent participant counts and foreign records cannot upgrade coverage",()=>{
 const foreign=market({status:"DECLARED_COMPLETE",record_count:1,reconciled_record_count:1,declared_address_record_count:1,missing_address_record_count:0});foreign.project_id="foreign";
 const v=buildProjectBusinessReview(p,[link(),foreign,market({status:"DECLARED_COMPLETE",record_count:1,reconciled_record_count:1,declared_address_record_count:2,missing_address_record_count:0})]);
 assert.equal(v.status,"REVIEW_REQUIRED");assert.equal(v.model_evidence.intervals[0].evidence.length,1);
 assert.ok(v.findings.some(x=>x.code==="PARTICIPANT_COVERAGE_COUNT_CONFLICT"));
});
