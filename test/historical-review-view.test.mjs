import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildUnifiedHistoricalReport} from "../src/inner-market/unified-historical-report.mjs";
import {historicalReviewRows} from "../web/historical-review-view.mjs";
const fixture=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
test("historical dashboard exposes every backend risk and check without reclassification",()=>{
 const d=buildUnifiedHistoricalReport(fixture()).terminal_state;
 const rows=historicalReviewRows(d);
 assert.deepEqual(rows.alerts,d.risk.alerts.map(a=>[a.severity,a.label,a.reason]));
 assert.equal(rows.checks.length,d.checks.length);
 assert.ok(rows.checks.some(x=>x[0]==="closing_account_set"));
 assert.ok(rows.checks.some(x=>x[0]==="trade_evidence"));
});
test("known historical risk findings remain visible on review-required reports",()=>{
 const i=fixture();i.inventory.ledger.realized_pnl_quote_base_units="123";
 const d=buildUnifiedHistoricalReport(i).terminal_state,rows=historicalReviewRows(d);
 assert.equal(d.status,"REVIEW_REQUIRED");
 assert.ok(rows.alerts.some(x=>x[0]==="CRITICAL"&&x[1]==="财务对账"));
 assert.ok(rows.checks.some(x=>x[0]==="accounting"&&x[2].includes("REALIZED_PNL_MISMATCH")));
});
test("structured check evidence is rendered as data rather than object Object",()=>{
 const r=historicalReviewRows({risk:{alerts:[]},checks:[{id:"receipt",status:"REVIEW",evidence:[{code:"MISMATCH"}]}]});
 assert.equal(r.checks[0][2],'{"code":"MISMATCH"}');
});
