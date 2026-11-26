import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("personal terminal simplifies status language without weakening project isolation",async()=>{
 const app=await readFile(new URL("../web/app.mjs",import.meta.url),"utf8");
 assert.ok(!app.includes("Project Market 身份绑定"));
 assert.ok(!app.includes("当前没有链上发行执行权限"));
 assert.ok(app.includes("linkedReportMatches(v,digest,data.scope)"));
 assert.ok(app.includes("hidden inert style=\"display:none\""));
 assert.ok(app.includes("当前不支持交易提交"));
});

test("current terminal routes historical analysis into a separate Analytics subpage",async()=>{const app=await readFile(new URL("../web/app.mjs",import.meta.url),"utf8");const current=await readFile(new URL("../web/current-terminal-view.mjs",import.meta.url),"utf8");assert.ok(app.includes('else if(page==="history"){renderHistoricalTerminal();'));assert.ok(app.includes('page==="history"?"dashboard"'));assert.ok(!current.includes("mountHistoricalDirectionReview"));assert.ok(!current.includes("Historical Position & PnL"));assert.ok(current.includes("mountTradeTicket"));const ticket=await readFile(new URL("../web/trade-ticket-view.mjs",import.meta.url),"utf8");assert.ok(ticket.includes("Execution: DISABLED"));assert.ok(ticket.includes("No transaction created."));});
