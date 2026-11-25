import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("Meme-first desk retains project selection and guarded historical reports",async()=>{
 const app=await readFile(new URL("../web/app.mjs",import.meta.url),"utf8");
 for(const term of ["mountMemeDesk(", "我的 Meme","projects.filter(issued)","issuedMemeStages.has(p.lifecycle?.stage)","memeDesk.update(projects,selected)","linkedReportMatches(v,digest,data.scope)"])assert.ok(app.includes(term),term);
 assert.doesNotMatch(app,/mountLocalTrading|mountLocalMarket/);
});
