import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("global top navigation is shared by all pages and Meme list stays on the terminal",async()=>{
 const a=await readFile(new URL("../web/app.mjs",import.meta.url),"utf8");
 const h=await readFile(new URL("../web/index.html",import.meta.url),"utf8");
 assert.ok(h.includes('id="top-nav" role="navigation" aria-label="主导航"'));
 assert.ok(a.includes('topNav.querySelectorAll("button")'));
 assert.ok(a.includes('nav.hidden=page!=="terminal"'));
 assert.ok(a.includes('aria-current="page"'));
 assert.ok(a.includes('current?.focus({preventScroll:true})'));
 assert.ok(!a.includes('其他工作区'));
 for(const label of ["操作台","资产与钱包","Meme 档案","复盘分析","市场风险实验","系统设置"])assert.ok(a.includes(label));
});
