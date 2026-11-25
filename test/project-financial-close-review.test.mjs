import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildProjectFinancialCloseReview} from "../src/inner-market/project-financial-close-review.mjs";
import {financialCloseRows} from "../web/financial-close-view.mjs";
const fixture=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
function endpoints(i){
 i.nav.endpointEvidence={schema_version:"cook-nav-endpoints.1",scope:{...i.scope},
 opening:{cutoff:i.scope.openingCutoff,sequence:0,cashBaseUnits:"1000",tokenAmountBaseUnits:"0",inventoryValueBaseUnits:"0",receivableBaseUnits:"0",liabilitiesBaseUnits:"0",otherAssetsBaseUnits:"0"},
 closing:{cutoff:i.scope.closingCutoff,sequence:3,cashBaseUnits:"887",tokenAmountBaseUnits:"50",inventoryValueBaseUnits:"90",receivableBaseUnits:"3",liabilitiesBaseUnits:"0",otherAssetsBaseUnits:"0"}};
 return i;
}
test("financial close separates cash movements, realized income and creator receivable",()=>{
 const i=fixture(),before=structuredClone(i),r=buildProjectFinancialCloseReview(i);
 assert.equal(r.status,"ACCOUNTING_CONSISTENT_VALUATION_UNAVAILABLE");
 assert.equal(r.cash_flow.opening_cash_base_units,"1000");assert.equal(r.cash_flow.recorded_trade_cash_cost_base_units,"200");
 assert.equal(r.cash_flow.recorded_net_trade_receipts_base_units,"90");assert.equal(r.cash_flow.operating_net_cash_flow_base_units,"-113");
 assert.equal(r.cash_flow.observed_closing_cash_base_units,"887");assert.equal(r.cash_flow.closing_cash_difference_base_units,"0");
 assert.equal(r.realized_pnl.trade_realized_pnl_base_units,"-10");assert.equal(r.realized_pnl.project_cash_basis_realized_pnl_base_units,"-13");
 assert.equal(r.creator_receivables.accrued_base_units,"10");assert.equal(r.creator_receivables.cash_received_base_units,"7");assert.equal(r.creator_receivables.closing_receivable_base_units,"3");
 assert.equal(r.assets.remaining_inventory_cost_base_units,"100");assert.equal(r.assets.closing_inventory_supplied_value_base_units,null);
 assert.equal(r.assets.closing_nav_base_units,null);assert.equal(r.actual_settlement_allowed,false);assert.equal(r.synthetic_test_settlement_allowed,true);assert.equal(r.lifetime_funding_base_units,null);assert.equal(r.liquidation_value_base_units,null);
 assert.deepEqual(i,before);assert.ok(financialCloseRows(r).flatMap(g=>g.rows).some(x=>x[0]==="Token 数量（原始单位）"&&x[1]==="50"&&x[2]==="quantity"));
});
test("endpoint valuation reconciles inventory mark and NAV residual without equating them to cash profit",()=>{
 const r=buildProjectFinancialCloseReview(endpoints(fixture()));
 assert.equal(r.status,"SUPPLIED_ACCOUNTING_AND_ENDPOINTS_CONSISTENT");
 assert.equal(r.assets.closing_inventory_supplied_value_base_units,"90");assert.equal(r.assets.closing_inventory_unrealized_value_minus_cost_base_units,"-10");
 assert.equal(r.assets.interval_inventory_unrealized_change_base_units,"-10");assert.equal(r.assets.closing_nav_base_units,"980");assert.equal(r.assets.capital_adjusted_nav_change_base_units,"-20");
 assert.equal(r.nav_bridge.unexplained_by_cash_basis_pnl_and_inventory_unrealized_change_base_units,"3");
 assert.equal(r.valuation_attestation,"UNKNOWN");assert.equal(r.actual_settlement_allowed,false);
});
test("missing or contradictory accounting never exposes final totals as valid",()=>{
 const i=endpoints(fixture());i.cash.observedClosingCashBaseUnits="886";
 const r=buildProjectFinancialCloseReview(i);assert.equal(r.status,"REVIEW_REQUIRED");
 assert.ok(Object.values(r.cash_flow).every(v=>v===null));assert.ok(Object.values(r.realized_pnl).every(v=>v===null));assert.ok(Object.values(r.assets).every(v=>v===null));assert.equal(r.synthetic_test_settlement_allowed,false);
});
test("contradictory NAV endpoint arithmetic withholds all endpoint valuations",()=>{
 const i=endpoints(fixture());i.nav.endpointEvidence.closing.inventoryValueBaseUnits="91";
 const r=buildProjectFinancialCloseReview(i);assert.equal(r.status,"REVIEW_REQUIRED");
 assert.equal(r.assets.closing_inventory_supplied_value_base_units,null);assert.equal(r.assets.closing_inventory_unrealized_value_minus_cost_base_units,null);
 assert.equal(r.assets.interval_inventory_unrealized_change_base_units,null);assert.equal(r.assets.closing_nav_base_units,null);assert.equal(r.valuation_status,"REVIEW_REQUIRED");
});
test("archived reports remain provisional and cannot enter actual or synthetic settlement",()=>{
 const i=endpoints(fixture());i.sourceMode="ARCHIVED_HISTORICAL";const r=buildProjectFinancialCloseReview(i);
 assert.equal(r.actual_settlement_allowed,false);assert.equal(r.synthetic_test_settlement_allowed,false);assert.equal(r.source_attestation,"UNKNOWN");assert.equal(r.ownership_attestation,"UNKNOWN");
});

test("independent financial identities distinguish incomplete valuations from discrepancies",async()=>{
 const {auditFinancialIdentities}=await import("../src/inner-market/financial-identity-audit.mjs");
 const r=buildProjectFinancialCloseReview(endpoints(fixture()));
 assert.equal(r.mathematical_audit.status,"ARITHMETIC_MATCH");
 assert.equal(r.mathematical_audit.checks.length,17);
 const incomplete=buildProjectFinancialCloseReview(fixture());
 assert.equal(incomplete.mathematical_audit.status,"PARTIAL");
 assert.equal(incomplete.mathematical_audit.checks.find(c=>c.id==="closing_nav").status,"UNKNOWN");
 const bad=structuredClone(r);bad.creator_receivables.cash_received_base_units="8";
 const audit=auditFinancialIdentities(bad);
 assert.equal(audit.status,"REVIEW_REQUIRED");
 assert.equal(audit.checks.find(c=>c.id==="creator_receivable").difference_base_units,"1");
 assert.equal(audit.checks.find(c=>c.id==="creator_cash_crosscheck").difference_base_units,"1");
 assert.equal(audit.execution_enabled,false);
});

test("NAV residual decomposition preserves unknown values and is not an income forecast",()=>{
 const r=buildProjectFinancialCloseReview(endpoints(fixture()));
 assert.equal(r.nav_bridge.receivable_change_base_units,"3");
 assert.equal(r.nav_bridge.other_asset_change_base_units,"0");
 assert.equal(r.nav_bridge.liability_change_base_units,"0");
 assert.equal(r.nav_bridge.remaining_unexplained_base_units,"0");
 const partial=buildProjectFinancialCloseReview(fixture());
 assert.equal(partial.nav_bridge.remaining_unexplained_base_units,null);
});
test("financial audit rejects malformed amounts rather than silently classifying them as missing",async()=>{
 const {auditFinancialIdentities}=await import("../src/inner-market/financial-identity-audit.mjs");
 const r=buildProjectFinancialCloseReview(endpoints(fixture()));r.cash_flow.other_income_base_units="NaN";
 const a=auditFinancialIdentities(r);
 assert.equal(a.status,"REVIEW_REQUIRED");
 assert.equal(a.checks.find(c=>c.id==="operating_cash").reason,"MALFORMED_AMOUNT");
});
