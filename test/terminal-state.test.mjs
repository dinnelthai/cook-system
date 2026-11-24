import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildTerminalState,advanceReview,makeReviewArchive,restoreReviewArchive} from "../src/inner-market/terminal-state.mjs";
const fixture=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));

test("terminal state reuses audited financial and market outputs",()=>{
 const s=buildTerminalState(fixture());
 assert.equal(s.status,"REPORT_READY");
 assert.equal(s.treasury.closing_cash_base_units,"887");
 assert.equal(s.treasury.closing_token_balance_base_units,"50");
 assert.equal(s.treasury.remaining_cost_basis_base_units,"100");
 assert.equal(s.treasury.realized_project_pnl_base_units,"-13");
 assert.equal(s.treasury.creator_cash_income_base_units,"7");
 assert.equal(s.treasury.max_observed_drawdown_bps,"200");
 assert.equal(s.performance.closing_nav_base_units,"980");
 assert.equal(s.performance.capital_adjusted_nav_change_base_units,"-20");
 assert.equal(s.market.gross_turnover_base_units,"290");
 assert.equal(s.market.buy_minus_sell_notional_base_units,"110");
 assert.equal(s.checks.find(x=>x.id==="source_attestation").status,"UNKNOWN");
 assert.equal(s.execution_enabled,false);
});
test("incomplete report blocks settlement and suppresses unsupported values",()=>{
 const i=fixture();i.market.historyComplete=false;
 const s=buildTerminalState(i);
 assert.equal(s.status,"REVIEW_REQUIRED");
 assert.equal(s.treasury.closing_cash_base_units,null);
 assert.equal(s.performance.closing_nav_base_units,null);
 assert.throws(()=>advanceReview("REVIEW","settle",s));
 assert.throws(()=>makeReviewArchive(i,null,"ARCHIVED"));
});
test("archive requires valid settlement and re-audits imported input",()=>{
 const i=fixture(),s=buildTerminalState(i);
 assert.throws(()=>advanceReview("REVIEW","archive",s));
 const settled=advanceReview("REVIEW","settle",s);
 assert.equal(settled,"SETTLED");
 assert.equal(advanceReview(settled,"archive",s),"ARCHIVED");
 const archive=makeReviewArchive(i,{name:"Test",symbol:"TEST"},"ARCHIVED");
 assert.deepEqual(restoreReviewArchive(archive),{input:i,metadata:{name:"Test",symbol:"TEST"},stage:"ARCHIVED"});
 archive.input.market.historyComplete=false;
 assert.throws(()=>restoreReviewArchive(archive));
 assert.equal(advanceReview("ARCHIVED","reset",s),"REVIEW");
});

test("unattested historical records cannot be settled even if internally consistent",()=>{
 const i=fixture();i.sourceMode="ARCHIVED_HISTORICAL";
 const s=buildTerminalState(i);
 assert.equal(s.status,"REPORT_READY");
 assert.equal(s.settlement_scope,"UNATTESTED_HISTORICAL");
 assert.equal(s.settlement_allowed,false);
 assert.throws(()=>advanceReview("REVIEW","settle",s));
 assert.throws(()=>makeReviewArchive(i,null,"ARCHIVED"));
 const synthetic=buildTerminalState(fixture());
 assert.equal(synthetic.settlement_scope,"SYNTHETIC_ONLY");
 assert.equal(synthetic.settlement_allowed,true);
});

test("terminal exposes read-only historical risk without treating missing evidence as safe",()=>{
 const i=fixture();i.sourceMode="ARCHIVED_HISTORICAL";const s=buildTerminalState(i);
 assert.equal(s.risk.status,"EVIDENCE_INCOMPLETE");assert.equal(s.risk.live_risk_assessed,false);assert.ok(s.risk.alerts.some(a=>a.code==="RECEIPT_AUDIT"));
 i.market.historyComplete=false;assert.equal(buildTerminalState(i).risk.status,"REVIEW_REQUIRED");
});

function historicalWithEndpoints(){
 const i=fixture();i.sourceMode="ARCHIVED_HISTORICAL";
 i.nav.endpointEvidence={schema_version:"cook-nav-endpoints.1",scope:{...i.scope},
  opening:{cutoff:i.scope.openingCutoff,sequence:0,cashBaseUnits:"1000",tokenAmountBaseUnits:"0",inventoryValueBaseUnits:"0",receivableBaseUnits:"0",liabilitiesBaseUnits:"0",otherAssetsBaseUnits:"0"},
  closing:{cutoff:i.scope.closingCutoff,sequence:3,cashBaseUnits:"887",tokenAmountBaseUnits:"50",inventoryValueBaseUnits:"90",receivableBaseUnits:"3",liabilitiesBaseUnits:"0",otherAssetsBaseUnits:"0"}};
 return i;
}
test("legacy historical NAV claims are not exposed as supported performance",()=>{
 const i=fixture();i.sourceMode="ARCHIVED_HISTORICAL";
 const s=buildTerminalState(i);
 assert.equal(s.status,"REPORT_READY");
 assert.equal(s.performance.closing_nav_base_units,null);
 assert.equal(s.treasury.max_observed_drawdown_bps,null);
 assert.equal(s.performance.time_weighted_return_bps,null);
 assert.deepEqual(s.performance.observations,[]);
 assert.equal(s.checks.find(x=>x.id==="valuation").status,"UNKNOWN");
});
test("matching historical endpoints expose only internally consistent endpoint arithmetic",()=>{
 const s=buildTerminalState(historicalWithEndpoints());
 assert.equal(s.status,"REPORT_READY");
 assert.equal(s.nav_evidence.status,"INTERNALLY_CONSISTENT");
 assert.equal(s.performance.closing_nav_base_units,"980");
 assert.equal(s.performance.capital_adjusted_nav_change_base_units,"-20");
 assert.equal(s.performance.valuation_attestation,"UNKNOWN");
 assert.equal(s.performance.time_weighted_return_bps,null);
 assert.deepEqual(s.performance.observations,[]);
 assert.equal(s.treasury.max_observed_drawdown_bps,null);
 assert.equal(s.settlement_allowed,false);
});
test("contradictory historical endpoints suppress all derived financial output",()=>{
 for(const [key,value,issue] of [["cashBaseUnits","888","CASH"],["tokenAmountBaseUnits","51","TOKEN"],["receivableBaseUnits","4","RECEIVABLE"],["inventoryValueBaseUnits","91","IDENTITY"]]){
  const i=historicalWithEndpoints();i.nav.endpointEvidence.closing[key]=value;
  const s=buildTerminalState(i);
  assert.equal(s.status,"REVIEW_REQUIRED");
  assert.ok(s.issues.includes("NAV_ENDPOINT_"+issue+"_MISMATCH:CLOSING"));
  assert.equal(s.performance.closing_nav_base_units,null);
  assert.equal(s.treasury.closing_cash_base_units,null);
 }
});
test("endpoint scope and position must match report interval",()=>{
 const i=historicalWithEndpoints();i.nav.endpointEvidence.scope.tokenMint="other";
 assert.throws(()=>buildTerminalState(i),/NAV_ENDPOINT_SCOPE_MISMATCH/);
 const j=historicalWithEndpoints();j.nav.endpointEvidence.closing.sequence=4;
 assert.ok(buildTerminalState(j).issues.includes("NAV_ENDPOINT_POSITION_MISMATCH:CLOSING"));
});
