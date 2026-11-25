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
