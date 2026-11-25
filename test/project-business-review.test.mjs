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

test("legacy missing receipt digest is unknown, not a fabricated link conflict",()=>{
 const a=archive("receipt","ORDER_RECEIPT_REVIEW",{archive_id:"link",status:"UNKNOWN"});
 const v=buildProjectBusinessReview(p,[link(),a]);
 assert.equal(v.status,"EVIDENCE_INCOMPLETE");
 assert.ok(v.unknown.some(x=>x.code==="LEGACY_RECEIPT_REPORT_DIGEST_UNAVAILABLE"));
 assert.ok(!v.findings.some(x=>x.code==="REVIEW_REPORT_LINK_CONFLICT"));
 a.payload.report_digest="b".repeat(64);
 const bad=buildProjectBusinessReview(p,[link(),a]);assert.equal(bad.risk.status,"REVIEW_REQUIRED");
});

test("receipt review preserves report digest on incomplete evidence",async()=>{
 const {reviewOrderReceipt}=await import("../src/inner-market/order-receipt-review.mjs");
 const {createHash}=await import("node:crypto");
 const {canonicalJson}=await import("../src/core/canonical-json.mjs");
 const input={sourceMode:"SYNTHETIC"},o={project_id:p.project_id,project_revision:p.revision,stale:false,order_id:"receipt",revision:1,signature:"1".repeat(64),source_mode:"SYNTHETIC"};
 const result=reviewOrderReceipt(p,o,input);
 assert.equal(result.status,"REVIEW_REQUIRED");
 assert.equal(result.report_digest,createHash("sha256").update(canonicalJson(input),"utf8").digest("hex"));
});

test("global risk includes runtime account contradictions and counts distinct codes",()=>{
 const a=treasury();a.payload.cash_flow={observed_closing_cash_base_units:"10"};
 a.payload.account_set={status:"INTERNALLY_CONSISTENT",totals:{cashBaseUnits:"9"},coverage:{status:"DECLARED_LABELS_MATCH"}};
 const r=buildProjectBusinessReview(p,[link(),a]);
 assert.equal(r.global_risk.status,"REVIEW_REQUIRED");assert.equal(r.runtime.risk.status,r.global_risk.status);
 assert.equal(r.risk.critical,r.global_risk.counts.critical);
 assert.ok(r.global_risk.findings.some(f=>f.code==="ACCOUNT_PROJECT_TOTAL_CONFLICT:cash"&&f.severity==="CRITICAL"));
 assert.equal(new Set(r.global_risk.findings.map(f=>f.code)).size,r.global_risk.findings.length);
 assert.equal(Object.values(r.global_risk.counts).reduce((n,x)=>n+x,0),r.global_risk.findings.length);
});
test("missing portfolio inputs do not imply zero risk or trading permission",()=>{
 const r=buildProjectBusinessReview(p).global_risk;
 assert.equal(r.portfolio.status,"NOT_ASSESSED_INPUTS_UNAVAILABLE");assert.equal(r.portfolio.current_exposure,null);assert.equal(r.portfolio.drawdown_bps,null);
 assert.ok(r.findings.some(f=>f.code==="PORTFOLIO_DAILY_LOSS_INPUT_UNAVAILABLE"&&f.severity==="UNKNOWN"));
 assert.equal(r.execution_enabled,false);assert.equal(r.live_risk_assessed,false);
});

test("a blocked interval propagates to financial summary, workflow and derived continuity, without contaminating a separate interval",()=>{
 const a=treasury();
 a.payload.cash_flow={observed_closing_cash_base_units:"10",creator_fee_cash_receipts_base_units:"2"};
 a.payload.creator_receivables={cash_received_base_units:"2",closing_receivable_base_units:"3"};
 a.payload.creator_fee_audit={summary:{verified_cash_income_base_units:"2",verified_closing_receivable_base_units:"3"}};
 a.payload.realized_pnl={creator_cash_income_base_units:"2"};
 a.payload.account_set={status:"INTERNALLY_CONSISTENT",totals:{cashBaseUnits:"9"},coverage:{status:"DECLARED_LABELS_MATCH"}};
 const second=link();second.archive_id="second";second.payload.report_digest="b".repeat(64);second.payload.scope.openingCutoff="later";second.payload.scope.closingCutoff="last";
 const b=treasury();b.archive_id="second-treasury";b.payload.report_link_archive_id="second";b.payload.report_digest=second.payload.report_digest;b.payload.cash_flow={observed_closing_cash_base_units:"123"};
 const r=buildProjectBusinessReview(p,[link(),a,second,b]);
 assert.equal(r.treasury.status,"REVIEW_REQUIRED");
 assert.equal(r.market.status,"MISSING");assert.equal(r.close.status,"MISSING");
 assert.equal(r.data_integration.gates.find(g=>g.id==="treasury_review").status,"REVIEW_REQUIRED");
 const interval=id=>r.runtime.asset_intervals.find(x=>x.report_link_archive_id===id);
 assert.equal(interval("link").assets.cash,null);assert.equal(interval("second").assets.cash,"123");
 const workflow=id=>r.offline_workflow.intervals.find(x=>x.report_link_archive_id===id);
 assert.equal(workflow("link").status,"REVIEW_REQUIRED");
 assert.equal(workflow("link").evidence.find(x=>x.kind==="MARKET_EVIDENCE_REVIEW").status,"MISSING");
 assert.equal(workflow("second").evidence.find(x=>x.kind==="TREASURY_REVIEW").status,"DECLARED_PRESENT");
 assert.equal(r.continuity.status,"REVIEW_REQUIRED");
 const checks=r.continuity.intervals.find(x=>x.report_link_archive_id==="link").checks;
 assert.ok(checks.length);assert.ok(checks.every(x=>x.declared_value===null&&x.status!=="DECLARED_MATCH"));
 assert.equal(r.operating_components.status,"REVIEW_REQUIRED");assert.equal(r.model_evidence.status,"REVIEW_REQUIRED");
 assert.equal(r.execution_enabled,false);
});
test("unrecognized treasury producer status does not expose historical operating amounts",()=>{
 const a=treasury();a.payload.status="UNKNOWN_PRODUCER_STATUS";a.payload.realized_pnl={creator_cash_income_base_units:"123",project_cash_basis_realized_pnl_base_units:"456"};
 const r=buildProjectBusinessReview(p,[link(),a]);
 assert.ok(Object.values(r.operating_components.rows[0].components).every(x=>x===null));
 assert.equal(r.runtime.asset_intervals[0].assets.realized_pnl,null);
 assert.equal(r.execution_enabled,false);
});
