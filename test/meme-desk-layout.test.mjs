import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("Meme desk embeds project setup and keeps chart controls presentation-only",async()=>{
 const a=await readFile(new URL("../web/app.mjs",import.meta.url),"utf8");
 const h=await readFile(new URL("../web/index.html",import.meta.url),"utf8");
 for(const term of ["mountProjectSetup(launchHost,","launchHost.isConnected","go(\"terminal\",launchProjectId)","meme-chart-minimized","memeChartMinimized","projects.filter(issued)","linkedReportMatches(v,digest,data.scope)"])assert.ok(a.includes(term),term);
 assert.ok(!h.includes('id="operator-view-mode"'));
 assert.ok(!a.includes("项目操作台"));
 assert.doesNotMatch(a,/mountLocalTrading|mountLocalMarket/);
});
