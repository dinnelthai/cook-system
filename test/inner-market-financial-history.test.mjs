import test from "node:test";
import assert from "node:assert/strict";
import { reconcileCreatorReceivables } from "../src/inner-market/creator-fee-accounting.mjs";
import { summarizeHistoricalNav } from "../src/inner-market/historical-nav.mjs";
const scope={projectId:"test-project",quoteAsset:"SOL",tokenMint:"fixture-mint",openingCutoff:"1",closingCutoff:"20"};
const event=(id,kind,amountBaseUnits,extra={})=>({...scope,id,kind,amountBaseUnits,status:"FINALIZED",reconciliation:"PASS",...extra});
const feeEntries=[event("accrual","CREATOR_ACCRUAL","50"),event("receipt","CREATOR_RECEIPT","30"),event("writeoff","CREATOR_WRITEOFF","5")];
const cashEntries=[event("cash","CREATOR_FEE_RECEIVED","30",{feeEventId:"receipt"})];
const args={...scope,openingReceivableBaseUnits:"10",observedClosingReceivableBaseUnits:"25",feeEntries,cashEntries,historyComplete:true};
test("creator accrual, actual receipt and writeoff reconcile independently",()=>{
 const r=reconcileCreatorReceivables(args);
 assert.equal(r.status,"RECONCILED");
 assert.equal(r.verified_cash_income_base_units,"30");
 assert.equal(r.verified_closing_receivable_base_units,"25");
});
test("duplicate cash claim is rejected even with different posting IDs",()=>{
 const r=reconcileCreatorReceivables({...args,cashEntries:[...cashEntries,{...cashEntries[0],id:"cash2"}]});
 assert.ok(r.issues.some(x=>x.code==="DUPLICATE_RECEIPT_REFERENCE"));
 assert.equal(r.verified_cash_income_base_units,null);
});
test("missing cash receipt and inconsistent observed receivable block final income",()=>{
 const r=reconcileCreatorReceivables({...args,cashEntries:[],observedClosingReceivableBaseUnits:"26"});
 assert.ok(r.issues.some(x=>x.code==="MISSING_CASH_RECEIPT"));
 assert.ok(r.issues.some(x=>x.code==="RECEIVABLE_MISMATCH"));
 assert.equal(r.verified_cash_income_base_units,null);
});
test("unverified accrual and incomplete history are surfaced",()=>{
 const r=reconcileCreatorReceivables({...args,feeEntries:[{...feeEntries[0],reconciliation:"UNKNOWN"},...feeEntries.slice(1)],historyComplete:false});
 assert.ok(r.issues.some(x=>x.code==="UNVERIFIED_FEE_EVENT"));
 assert.ok(r.issues.some(x=>x.code==="HISTORY_INCOMPLETE"));
 assert.ok(r.issues.some(x=>x.code==="NEGATIVE_RECEIVABLE"));
});
test("fee or cash receipt scope cannot mix token mints",()=>{
 assert.throws(()=>reconcileCreatorReceivables({...args,cashEntries:[{...cashEntries[0],tokenMint:"other"}]}),/scope mismatch/);
});
test("fee receipt amount mismatch cannot be recognized as final income",()=>{
 const r=reconcileCreatorReceivables({...args,cashEntries:[{...cashEntries[0],amountBaseUnits:"31"}]});
 assert.ok(r.issues.some(x=>x.code==="RECEIPT_AMOUNT_MISMATCH"));
});
const navScope={projectId:scope.projectId,quoteAsset:scope.quoteAsset};
const snap=(sequence,before,after,capitalInBaseUnits="0",capitalOutBaseUnits="0",extra={})=>({...navScope,sequence,navBeforeFlowBaseUnits:before,navAfterFlowBaseUnits:after,capitalInBaseUnits,capitalOutBaseUnits,reconciliation:"PASS",valuationStatus:"VERIFIED",...extra});
const nav=(snapshots,extra={})=>summarizeHistoricalNav({...navScope,snapshots,historyComplete:true,...extra});
test("additional capital cannot hide prior losses",()=>{
 const r=nav([snap(1,"100","100"),snap(2,"80","130","50")]);
 assert.equal(r.status,"COMPLETE");
 assert.equal(r.time_weighted_return_bps,"-2000");
 assert.equal(r.max_observed_drawdown_bps,"2000");
 assert.equal(r.capital_adjusted_nav_change_base_units,"-20");
});
test("withdrawal alone does not count as loss",()=>{
 const r=nav([snap(1,"100","100"),snap(2,"100","60","0","40")]);
 assert.equal(r.time_weighted_return_bps,"0");
 assert.equal(r.max_observed_drawdown_bps,"0");
});
test("historical peak follows chained returns",()=>{
 const r=nav([snap(1,"100","100"),snap(2,"120","120"),snap(3,"90","90")]);
 assert.equal(r.time_weighted_return_bps,"-1000");
 assert.equal(r.max_observed_drawdown_bps,"2500");
});
test("missing verified valuation suppresses performance outputs",()=>{
 const r=nav([snap(1,"100","100"),snap(2,"80","80","0","0",{valuationStatus:"UNKNOWN"})]);
 assert.equal(r.status,"REVIEW_REQUIRED");
 assert.equal(r.time_weighted_return_bps,null);
 assert.equal(r.max_observed_drawdown_bps,null);
 assert.equal(r.observations[1].performance_index_scaled_18,undefined);
});
test("incorrect flow and missing history suppress performance",()=>{
 const r=nav([snap(1,"100","100"),snap(2,"100","140","50")],{historyComplete:false});
 assert.ok(r.issues.includes("CAPITAL_FLOW_MISMATCH:2"));
 assert.ok(r.issues.includes("HISTORY_INCOMPLETE"));
});
test("complete capital loss requires explicit rebase rather than fictitious recovery",()=>{
 const r=nav([snap(1,"100","100"),snap(2,"0","50","50")]);
 assert.ok(r.issues.includes("TOTAL_LOSS_REBASE_REQUIRED:2"));
 assert.equal(r.time_weighted_return_bps,null);
});
test("out-of-order observations rejected",()=>{
 assert.throws(()=>nav([snap(2,"100","100"),snap(1,"100","100")]),/sequence/);
});
