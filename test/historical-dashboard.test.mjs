import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildHistoricalDashboard} from "../src/inner-market/historical-dashboard.mjs";
const fixture=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
test("dashboard shows actual historical cash flows without counting opening capital as new funding",()=>{
 const d=buildHistoricalDashboard(fixture());
 assert.equal(d.status,"REPORT_READY");
 assert.equal(d.treasury.actual_trade_spend_base_units,"200");
 assert.equal(d.treasury.actual_trade_receipts_base_units,"90");
 assert.equal(d.treasury.net_trade_cash_spend_base_units,"110");
 assert.equal(d.treasury.recorded_capital_in_base_units,"0");
 assert.equal(d.treasury.closing_cash_base_units,"887");
 assert.equal(d.market.buy_address_count,null);
 assert.equal(d.market.sell_address_count,null);
});
test("deduplicate historical address counts by side",()=>{
 const f=fixture();
 f.market.trades[0].actorAddress="synthetic-A";f.market.trades[1].actorAddress="synthetic-B";
 f.market.trades.push({...f.market.trades[0],id:"another",sequence:3});
 const d=buildHistoricalDashboard(f);
 assert.equal(d.market.buy_address_count,1);
 assert.equal(d.market.buy_trade_count,2);
 assert.equal(d.market.sell_address_count,1);
});
test("incomplete history suppresses verified totals and address counts",()=>{
 const f=fixture();f.market.historyComplete=false;
 const d=buildHistoricalDashboard(f);
 assert.equal(d.status,"REVIEW_REQUIRED");
 assert.equal(d.market.verified_real_reserve_base_units,null);
 assert.equal(d.treasury.actual_trade_spend_base_units,null);
 assert.equal(d.market.buy_address_count,null);
 assert.equal(d.execution_enabled,false);
});
