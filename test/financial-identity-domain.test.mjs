import test from "node:test";
import assert from "node:assert/strict";
import {auditFinancialIdentities} from "../src/inner-market/financial-identity-audit.mjs";
test("arithmetically matching negative gross amounts still require review",()=>{
 const r=auditFinancialIdentities({cash_flow:{external_capital_in_base_units:"-10",external_capital_out_base_units:"0",net_external_capital_base_units:"-10"}});
 assert.equal(r.status,"REVIEW_REQUIRED");
 assert.ok(r.checks.some(c=>c.reason==="NEGATIVE_GROSS_AMOUNT"));
 assert.equal(r.checks.find(c=>c.id==="net_capital").status,"PASS");
});
test("signed net results are not treated as negative gross amounts",()=>{
 const r=auditFinancialIdentities({cash_flow:{external_capital_in_base_units:"0",external_capital_out_base_units:"10",net_external_capital_base_units:"-10"}});
 assert.equal(r.checks.find(c=>c.id==="net_capital").status,"PASS");
 assert.ok(!r.checks.some(c=>c.reason==="NEGATIVE_GROSS_AMOUNT"));
});

test("negative balance-sheet quantities and malformed standalone inventory are not valid arithmetic evidence",()=>{
 const r=auditFinancialIdentities({cash_flow:{opening_cash_base_units:"-5",observed_closing_cash_base_units:"-5",expected_closing_cash_base_units:"-5",net_external_capital_base_units:"0",operating_net_cash_flow_base_units:"0"},assets:{closing_cash_base_units:"-5",closing_token_quantity_base_units:"-1",closing_other_assets_base_units:"-2"}});
 assert.equal(r.checks.find(c=>c.id==="closing_cash").status,"PASS");
 assert.equal(r.status,"REVIEW_REQUIRED");
 for(const key of ["opening_cash_base_units","closing_token_quantity_base_units","closing_other_assets_base_units"])assert.ok(r.checks.some(c=>c.id.endsWith("/"+key)&&c.reason==="NEGATIVE_GROSS_AMOUNT"));
 const bad=auditFinancialIdentities({assets:{closing_token_quantity_base_units:"NaN"}});
 assert.equal(bad.status,"REVIEW_REQUIRED");
 assert.ok(bad.checks.some(c=>c.id==="nonnegative/assets/closing_token_quantity_base_units"&&c.reason==="MALFORMED_AMOUNT"));
});
test("unknown inventory and negative net NAV remain distinct from invalid gross values",()=>{
 const r=auditFinancialIdentities({assets:{closing_token_quantity_base_units:null,closing_nav_base_units:"-10",closing_cash_base_units:"0",closing_inventory_supplied_value_base_units:"0",closing_creator_receivable_base_units:"0",closing_other_assets_base_units:"0",closing_liabilities_base_units:"10"}});
 assert.equal(r.checks.find(c=>c.id==="closing_nav").status,"PASS");
 assert.ok(!r.checks.some(c=>c.reason==="NEGATIVE_GROSS_AMOUNT"));
});

test("new identities preserve precision, missing values and nonzero economic residuals",()=>{
 const huge="900719925474099300000000000000001";
 const r=auditFinancialIdentities({cash_flow:{opening_cash_base_units:huge,net_external_capital_base_units:"-1",operating_net_cash_flow_base_units:"2",expected_closing_cash_base_units:"900719925474099300000000000000002"},nav_bridge:{unexplained_by_cash_basis_pnl_and_inventory_unrealized_change_base_units:"10",receivable_change_base_units:"2",other_asset_change_base_units:"3",liability_change_base_units:"1",remaining_unexplained_base_units:"6"}});
 assert.equal(r.checks.find(c=>c.id==="expected_closing_cash").status,"PASS");
 assert.equal(r.checks.find(c=>c.id==="nav_bridge_remaining").status,"PASS");
 assert.equal(r.checks.find(c=>c.id==="nav_bridge_residual").status,"UNKNOWN");
 assert.equal(r.status,"PARTIAL");
 const bad=auditFinancialIdentities({nav_bridge:{remaining_unexplained_base_units:0}});
 assert.equal(bad.checks.find(c=>c.id==="nav_bridge_remaining").reason,"MALFORMED_AMOUNT");
 assert.equal(bad.status,"REVIEW_REQUIRED");
});
