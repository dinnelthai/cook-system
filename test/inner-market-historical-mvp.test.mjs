import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { buildHistoricalMvpReport } from "../src/inner-market/historical-mvp-report.mjs";
const fixture=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
test("synthetic end-to-end historical accounting report",()=>{
 const r=buildHistoricalMvpReport(fixture());
 assert.equal(r.status,"REPORT_READY");
 assert.deepEqual(r.issues,[]);
 assert.equal(r.source_mode,"SYNTHETIC");
 assert.equal(r.accounting.closing_cash_base_units,"887");
 assert.equal(r.accounting.closing_token_balance_base_units,"50");
 assert.equal(r.accounting.remaining_cost_basis_base_units,"100");
 assert.equal(r.accounting.realized_project_pnl_base_units,"-13");
 assert.equal(r.accounting.creator_cash_income_base_units,"7");
 assert.equal(r.accounting.max_observed_drawdown_bps,"200");
 assert.equal(r.execution_enabled,false);
});
test("unmatched creator receipt blocks final report even if cash reconciles",()=>{
 const f=fixture();f.creator.entries.pop();
 const r=buildHistoricalMvpReport(f);
 assert.ok(r.issues.includes("CREATOR_FEE_AUDIT_FAILED"));
 assert.equal(r.accounting.realized_project_pnl_base_units,null);
});
test("unverified inventory and market records block final accounting",()=>{
 const f=fixture();f.inventory.historyComplete=false;f.market.trades[0].status="PENDING";
 const r=buildHistoricalMvpReport(f);
 assert.equal(r.status,"REVIEW_REQUIRED");
 assert.ok(r.issues.includes("UNVERIFIED_MARKET_TRADE:b"));
 assert.equal(r.accounting.closing_token_balance_base_units,null);
});
test("tampered realized PnL is blocked",()=>{
 const f=fixture();f.inventory.ledger.realized_pnl_quote_base_units="10";
 assert.ok(buildHistoricalMvpReport(f).issues.includes("REALIZED_PNL_MISMATCH"));
});
test("scope mismatch and duplicate market events rejected",()=>{
 const f=fixture();f.market.scope={...f.scope,tokenMint:"other"};
 assert.throws(()=>buildHistoricalMvpReport(f),/scope mismatch/);
 const g=fixture();g.market.trades.push({...g.market.trades[0]});
 assert.throws(()=>buildHistoricalMvpReport(g),/duplicate/);
});
test("outside curve or missing reserve fields blocks final report",()=>{
 const f=fixture();f.market.snapshot.lifecycle="graduated";delete f.market.snapshot.realQuoteReservesBaseUnits;
 const r=buildHistoricalMvpReport(f);
 assert.ok(r.issues.includes("OUTSIDE_INNER_MARKET"));
 assert.ok(r.issues.includes("REAL_RESERVE_UNKNOWN"));
});
test("CLI emits synthetic JSON report",()=>{
 const s=execFileSync(process.execPath,["scripts/report-inner-market-mvp.mjs"],{encoding:"utf8"});
 assert.equal(JSON.parse(s).status,"REPORT_READY");
});

test("NAV capital flows must agree with confirmed historical cash postings",()=>{
  const f=fixture();
  const last=f.nav.snapshots.at(-1);
  last.capitalInBaseUnits="100";
  last.navAfterFlowBaseUnits="1080";
  const r=buildHistoricalMvpReport(f);
  assert.equal(r.status,"REVIEW_REQUIRED");
  assert.ok(r.issues.includes("NAV_CASH_CAPITAL_FLOW_MISMATCH"));
  assert.equal(r.accounting.realized_project_pnl_base_units,null);
});
test("offsetting gross NAV capital flows cannot hide a mismatch",()=>{
  const f=fixture();
  const last=f.nav.snapshots.at(-1);
  last.capitalInBaseUnits="100";
  last.capitalOutBaseUnits="100";
  const r=buildHistoricalMvpReport(f);
  assert.equal(r.status,"REVIEW_REQUIRED");
  assert.ok(r.issues.includes("NAV_CASH_CAPITAL_FLOW_MISMATCH"));
});
test("matching historical gross capital totals remain internally consistent",()=>{
  const f=fixture();
  for(const [id,kind] of [["capital-in","CAPITAL_IN"],["capital-out","CAPITAL_OUT"]]){
    f.cash.entries.push({...f.scope,id,kind,amountBaseUnits:"100",status:"FINALIZED",reconciliation:"PASS"});
  }
  const last=f.nav.snapshots.at(-1);
  last.capitalInBaseUnits="100";
  last.capitalOutBaseUnits="100";
  const r=buildHistoricalMvpReport(f);
  assert.equal(r.status,"REPORT_READY");
  assert.ok(!r.issues.includes("NAV_CASH_CAPITAL_FLOW_MISMATCH"));
});

test("project journal cannot reference a missing or opposite-side market event",()=>{
 for(const [mutate,issue] of [
  [f=>f.market.trades[0].id="unrelated","PROJECT_TRADE_MARKET_EVENT_MISSING:b"],
  [f=>f.market.trades[0].side="SELL","PROJECT_TRADE_SIDE_MISMATCH:b"]
 ]){
  const f=fixture();mutate(f);const r=buildHistoricalMvpReport(f);
  assert.equal(r.status,"REVIEW_REQUIRED");assert.ok(r.issues.includes(issue));
  assert.equal(r.accounting.realized_project_pnl_base_units,null);
 }
});
test("legacy event links remain partial without quantity or signature evidence",()=>{
 const r=buildHistoricalMvpReport(fixture());
 assert.equal(r.status,"REPORT_READY");
 assert.equal(r.trade_evidence.status,"PARTIAL");
 assert.equal(r.trade_evidence.matched_trade_count,2);
 assert.equal(r.trade_evidence.source_attestation,"UNKNOWN");
});
test("project quantity must match supplied market quantity but gross notional need not equal net cash",()=>{
 const f=fixture();
 f.market.trades[0].tokenAmountBaseUnits="100";f.market.trades[0].quoteNotionalBaseUnits="190";
 assert.equal(buildHistoricalMvpReport(f).status,"REPORT_READY");
 f.market.trades[0].tokenAmountBaseUnits="99";
 const r=buildHistoricalMvpReport(f);
 assert.ok(r.issues.includes("PROJECT_TRADE_QUANTITY_MISMATCH:b"));
 assert.equal(r.status,"REVIEW_REQUIRED");
});
test("conflicting transaction identity blocks financial readiness",()=>{
 const f=fixture();
 f.cash.entries[0].signature="receipt-a";f.market.trades[0].signature="receipt-b";
 const r=buildHistoricalMvpReport(f);
 assert.ok(r.issues.includes("PROJECT_TRADE_SIGNATURE_MISMATCH:b"));
 assert.equal(r.status,"REVIEW_REQUIRED");
});
