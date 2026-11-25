import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildTerminalState} from "../src/inner-market/terminal-state.mjs";
const raw=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
function fixture(){
 const i=raw(),g="local-fixture",wallet="wallet",tokenAccount="token",mint=i.scope.tokenMint;
 i.sourceMode="ARCHIVED_HISTORICAL";
 const ext={network:"localnet",genesisHash:g,wallet,tokenAccount,openingCutoff:"slot:10",closingCutoff:"slot:20"};
 for(const s of [i.scope,i.cash.scope,i.inventory.scope,i.inventory.opening.scope,i.inventory.closing.scope,i.inventory.tradeSummary.scope,i.creator.scope,i.nav.scope,i.market.scope,...i.cash.entries,...i.creator.entries])Object.assign(s,ext);
 const scope={network:"localnet",mode:"READ_ONLY",genesisHash:g,wallet,tokenAccount,mint,openingSlot:10,closingSlot:20};
 const snapshot=(slot,lamports,tokenAmount)=>({slot,genesisHash:g,wallet,tokenAccount,mint,lamports,tokenAmount});
 const row=n=>({accountIndex:1,owner:wallet,mint,uiTokenAmount:{amount:String(n),decimals:6}});
 const receipts=[];
 let cash=1000,token=0;
 const deltas=[[-200,100],[90,-50],[7,0],[-10,0]];
 for(const [index,p] of i.cash.entries.entries()){
  const [dc,dt]=deltas[index],signature="receipt-"+index;
  p.signature=signature;
  receipts.push({signature,genesisHash:g,finality:"FINALIZED",transactionIndex:0,transaction:{slot:11+index,transaction:{signatures:[signature],message:{accountKeys:[wallet,tokenAccount,"other"]}},meta:{err:null,fee:5,preBalances:[cash,10,1000],postBalances:[cash+dc,10,995-dc],preTokenBalances:[row(token)],postTokenBalances:[row(token+dt)]}}});
  cash+=dc;token+=dt;
 }
 i.archivedEvidence={schema_version:"cook-terminal-evidence.1",accountInterval:{scope,opening:snapshot(10,"1000","0"),closing:snapshot(20,"887","50"),receipts,historyComplete:true}};
 return i;
}
test("terminal recomputes historical raw receipts and compares the same report postings",()=>{
 const s=buildTerminalState(fixture());assert.equal(s.status,"REPORT_READY");
 assert.equal(s.archived_evidence.status,"INTERNALLY_CONSISTENT");
 assert.equal(s.archived_evidence.cash_audit.matched_receipt_count,4);
 assert.equal(s.risk.alerts.some(a=>a.code==="RECEIPT_AUDIT"),false);
 assert.equal(s.settlement_allowed,false);assert.equal(s.execution_enabled,false);
});
test("missing evidence stays unknown without breaking existing historical report imports",()=>{
 const i=fixture();delete i.archivedEvidence;const s=buildTerminalState(i);
 assert.equal(s.archived_evidence.status,"UNAVAILABLE");assert.ok(s.risk.alerts.some(a=>a.code==="RECEIPT_AUDIT"));
});
test("mismatched interval, account or synthetic source rejected",()=>{
 for(const f of [i=>i.archivedEvidence.accountInterval.scope.wallet="other",i=>i.archivedEvidence.accountInterval.scope.openingSlot=9,i=>i.sourceMode="SYNTHETIC",i=>i.cash.scope.genesisHash="other",i=>i.archivedEvidence.cash_audit={status:"PASS"}]){
  const i=fixture();f(i);assert.throws(()=>buildTerminalState(i));
 }
});
test("cash or token discrepancy suppresses terminal financial output",()=>{
 const i=fixture();i.archivedEvidence.accountInterval.closing.tokenAmount="49";const s=buildTerminalState(i);
 assert.equal(s.status,"REVIEW_REQUIRED");assert.equal(s.treasury.closing_cash_base_units,null);assert.equal(s.performance.closing_nav_base_units,null);
 assert.ok(s.issues.includes("REPORT_CLOSING_TOKEN_MISMATCH"));assert.equal(s.risk.status,"REVIEW_REQUIRED");
});
test("receipt signature mapping is required and inconsistent cash amounts are flagged",()=>{
 const i=fixture();delete i.cash.entries[0].signature;assert.throws(()=>buildTerminalState(i),/MISSING_POSTING_SIGNATURE/);
 const j=fixture();j.cash.entries[0].signature=j.cash.entries[1].signature;const s=buildTerminalState(j);
 assert.equal(s.archived_evidence.status,"REVIEW_REQUIRED");assert.equal(s.treasury.realized_project_pnl_base_units,null);
});

test("unified presentation suppresses all accounting metrics when raw evidence disagrees",async()=>{
 const {buildUnifiedHistoricalReport}=await import("../src/inner-market/unified-historical-report.mjs");
 const i=fixture();i.archivedEvidence.accountInterval.closing.tokenAmount="49";
 const r=buildUnifiedHistoricalReport(i);
 assert.equal(r.status,"REVIEW_REQUIRED");assert.equal(r.terminal_state.status,r.status);
 assert.ok(Object.values(r.accounting).every(v=>v===null));
 assert.ok(Object.values(r.terminal_state.treasury).every(v=>v===null));
 assert.equal(r.settlement_allowed,false);assert.equal(r.source_attestation,"UNKNOWN");
});
test("unified report preserves consistent internal metrics and synthetic provenance",async()=>{
 const {buildUnifiedHistoricalReport}=await import("../src/inner-market/unified-historical-report.mjs");
 const r=buildUnifiedHistoricalReport(fixture());assert.equal(r.accounting.closing_cash_base_units,"887");
 assert.equal(r.accounting.closing_cash_base_units,r.terminal_state.treasury.closing_cash_base_units);assert.equal(r.settlement_allowed,false);
 const sample=buildUnifiedHistoricalReport(raw());assert.equal(sample.source_mode,"SYNTHETIC");
 assert.equal(sample.accounting.closing_cash_base_units,"887");
});
test("unified report suppresses unverified reserve snapshots",async()=>{
 const {buildUnifiedHistoricalReport}=await import("../src/inner-market/unified-historical-report.mjs");
 const i=raw();i.market.historyComplete=false;const r=buildUnifiedHistoricalReport(i);
 assert.equal(r.market_history.real_quote_reserves_base_units,null);
 assert.equal(r.market_history.virtual_token_reserves_base_units,null);
});

test("nested inventory and row scope contradictions are rejected",()=>{
 for(const mutate of [
  i=>i.inventory.opening.scope.wallet="other",
  i=>i.inventory.tradeSummary.scope.genesisHash="other",
  i=>i.cash.entries[0].tokenMint="other",
  i=>i.creator.entries[0].wallet="other",
  i=>i.nav.snapshots[0].network="mainnet",
  i=>i.market.trades[0].openingCutoff="slot:0"
 ]){
  const i=fixture();mutate(i);assert.throws(()=>buildTerminalState(i),/SCOPE_MISMATCH/);
 }
});

test("trade receipt token deltas agree with the scoped historical journal",()=>{
 const s=buildTerminalState(fixture());
 assert.equal(s.archived_evidence.classification.status,"PARTIAL");
 assert.equal(s.archived_evidence.classification.trade_token_deltas_matched,2);
 assert.equal(s.checks.find(x=>x.id==="economic_classification").status,"UNKNOWN");
 assert.equal(s.archived_evidence.classification.economic_classification_attestation,"UNKNOWN");
});
test("matching aggregate token and cash balances do not hide per-receipt trade quantity contradictions",()=>{
 const i=fixture(),[buy,sell]=i.archivedEvidence.accountInterval.receipts;
 buy.transaction.meta.postTokenBalances[0].uiTokenAmount.amount="110";
 sell.transaction.meta.preTokenBalances[0].uiTokenAmount.amount="110";
 const s=buildTerminalState(i);
 assert.equal(s.archived_evidence.account_audit.status,"INTERNALLY_CONSISTENT");
 assert.equal(s.archived_evidence.cash_audit.status,"AMOUNTS_INTERNALLY_CONSISTENT");
 assert.equal(s.archived_evidence.classification.status,"REVIEW_REQUIRED");
 assert.ok(s.issues.includes("TRADE_RECEIPT_TOKEN_DELTA_MISMATCH:buy-cash"));
 assert.ok(s.issues.includes("TRADE_RECEIPT_TOKEN_DELTA_MISMATCH:sell-cash"));
 assert.equal(s.treasury.realized_project_pnl_base_units,null);
 assert.equal(s.settlement_allowed,false);
});

test("historical order review matches archived receipt and cash posting without settlement",async()=>{
 const {reviewOrderReceipt}=await import("../src/inner-market/order-receipt-review.mjs");
 const i=fixture(),p={project_id:i.scope.projectId,revision:1,token:{mint:i.scope.tokenMint},network:{cluster:"localnet",genesis_hash:i.scope.genesisHash}};
 const o={order_id:"o",project_id:p.project_id,project_revision:1,revision:2,source_mode:"ARCHIVED_HISTORICAL",signature:i.cash.entries[0].signature,reported_outcome:"SUCCESS",reported_slot:11,status:"REPORTED_SUCCESS"};
 const r=reviewOrderReceipt(p,o,i);assert.equal(r.status,"INTERNAL_MATCH");assert.equal(r.posting_references[0].posting_id,i.cash.entries[0].id);assert.equal(r.source_attestation,"UNKNOWN");assert.equal(r.settlement_allowed,false);
 assert.equal(reviewOrderReceipt(p,{...o,reported_slot:12},i).status,"REVIEW_REQUIRED");
 assert.equal(reviewOrderReceipt(p,{...o,signature:"missing"},i).status,"UNKNOWN");
 assert.equal(reviewOrderReceipt(p,{...o,project_revision:2},i).status,"REVIEW_REQUIRED");
 assert.equal(reviewOrderReceipt(p,{...o,status:"REVIEW_REQUIRED"},i).status,"REVIEW_REQUIRED");
 delete i.archivedEvidence;assert.equal(reviewOrderReceipt(p,o,i).status,"UNKNOWN");
});

test("historical import derives only explicitly linked trade receipts",async()=>{
 const {deriveArchivedTradeReceiptSamples}=await import("../src/inner-market/order-receipt-review.mjs");
 const i=fixture();
 for(let n=0;n<i.cash.entries.length;n++){
  const sig=String(n+1).repeat(64);i.cash.entries[n].signature=sig;i.archivedEvidence.accountInterval.receipts[n].signature=sig;i.archivedEvidence.accountInterval.receipts[n].transaction.transaction.signatures=[sig];
 }
 const p={project_id:i.scope.projectId,revision:1,token:{mint:i.scope.tokenMint},network:{cluster:"localnet",genesis_hash:i.scope.genesisHash}};
 const result=deriveArchivedTradeReceiptSamples(p,i);
 assert.equal(result.samples.length,2);assert.equal(result.excluded_receipt_count,2);
 assert.equal(result.execution_enabled,false);assert.equal(result.settlement_allowed,false);
 i.archivedEvidence.accountInterval.closing.tokenAmount="49";
 assert.throws(()=>deriveArchivedTradeReceiptSamples(p,i),/ORDER_IMPORT_REPORT_REVIEW_REQUIRED/);
});

test("close evidence discloses residual assets and never authorizes settlement",async()=>{
 const {reviewProjectCloseEvidence}=await import("../src/inner-market/project-close-evidence.mjs");
 const {createProjectAggregate}=await import("../src/inner-market/project-aggregate.mjs");
 const i=fixture(),pin="11111111111111111111111111111111",mint="11111111111111111111111111111112";
 // Relabel every exact scope/receipt identity consistently for a valid aggregate.
 function relabel(x){if(Array.isArray(x)){x.forEach(relabel);return;}if(!x||typeof x!=="object")return;for(const k of Object.keys(x)){if(x[k]==="local-fixture")x[k]=pin;else if(x[k]==="synthetic-mint")x[k]=mint;else relabel(x[k]);}}
 relabel(i);
 const p=createProjectAggregate({project_id:i.scope.projectId,profile:{name:"Close",symbol:"CLOSE"},network:{cluster:"localnet",genesis_hash:pin},token:{mint,issuance_signature:"1".repeat(64)}});
 const r=reviewProjectCloseEvidence(p,i);
 assert.equal(r.status,"REVIEW_REQUIRED");assert.ok(r.blockers.includes("TOKEN_INVENTORY_OUTSTANDING"));assert.ok(r.unknown.includes("PROJECT_WIDE_ACCOUNT_COVERAGE_UNATTESTED"));assert.equal(r.settlement_allowed,false);assert.equal(r.lifecycle_mutated,false);
});

test("Project treasury retains one interval, suppresses contradictory values and never claims live balances",async()=>{
 const {buildProjectTreasuryReview}=await import("../src/inner-market/project-treasury-review.mjs");
 const {createProjectAggregate}=await import("../src/inner-market/project-aggregate.mjs");
 const i=fixture(),pin="11111111111111111111111111111111",mint="11111111111111111111111111111112";
 function relabel(x){if(Array.isArray(x)){x.forEach(relabel);return;}if(!x||typeof x!=="object")return;for(const k of Object.keys(x)){if(x[k]==="local-fixture")x[k]=pin;else if(x[k]==="synthetic-mint")x[k]=mint;else relabel(x[k]);}}
 relabel(i);
 const p=createProjectAggregate({project_id:i.scope.projectId,profile:{name:"Treasury",symbol:"TRSY"},network:{cluster:"localnet",genesis_hash:pin},token:{mint,issuance_signature:"1".repeat(64)}});
 const r=buildProjectTreasuryReview(p,i);
 assert.equal(r.status,"PARTIAL");assert.equal(r.cash_flow.observed_closing_cash_base_units,"887");assert.equal(r.inventory.closing_quantity_base_units,"50");
 assert.equal(r.project_wide_total,null);assert.equal(r.live_balance,null);assert.equal(r.available_to_trade,null);assert.equal(r.execution_enabled,false);
 assert.equal(r.creator_fee_audit.summary.verified_cash_income_base_units,"7");
 assert.equal(r.creator_fee_audit.pool_fee_bucket_cash_equivalence,"NOT_ESTABLISHED");
 assert.equal(r.historical_valuation.closing_nav_base_units,null);
 assert.equal(r.budget_review.status,"NOT_CONFIGURED");
 const configured={...p,limits:{...p.limits,max_project_budget_base_units:"1"}};
 const budget=buildProjectTreasuryReview(configured,i).budget_review;
 assert.equal(budget.remaining_budget_base_units,null);assert.equal(budget.current_exposure_base_units,null);
 i.archivedEvidence.accountInterval.closing.tokenAmount="49";
 const bad=buildProjectTreasuryReview(p,i);assert.equal(bad.status,"REVIEW_REQUIRED");assert.equal(bad.inventory,null);assert.equal(bad.cash_flow,null);
});
