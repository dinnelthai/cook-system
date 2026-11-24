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
