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
