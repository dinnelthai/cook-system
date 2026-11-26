import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("set amounts reference is an isolated preview",async()=>{const s=await readFile(new URL("../web/amounts-preview.mjs",import.meta.url),"utf8");for(const label of ["买入金额","卖出比例","统一金额","随机区间","余额比例","卖出比例","最小 SOL","最大 SOL"])assert.ok(s.includes(label));assert.ok(s.includes("disabled data-amount-submit"));assert.ok(!s.includes("fetch("));assert.ok(!s.includes("adapter."));});
