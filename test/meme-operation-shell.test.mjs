import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("Meme desk separates current meme operations from other workspaces",async()=>{
 const a=await readFile(new URL("../web/app.mjs",import.meta.url),"utf8");
 const d=await readFile(new URL("../web/historical-direction-review.mjs",import.meta.url),"utf8");
 for(const term of ["meme-create-footer","topNav.innerHTML","meme-lower-tabs","selectLowerTab","钱包 / 持仓","资金 / 损益","风险 / 市场状态","orderHost.append(orderSection)"])assert.ok(a.includes(term),term);
 assert.ok(!a.includes('<h3>项目管理</h3>'));
 assert.ok(!a.includes("meme-other-workspaces"));
 assert.ok(a.includes('nav.hidden=page!=="terminal"'));
 assert.ok(d.includes("Trades Log / 成交记录"));
 assert.ok(d.includes('type="button" disabled'));
 assert.ok(d.includes("execution_enabled:false"));
});
