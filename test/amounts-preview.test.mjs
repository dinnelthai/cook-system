import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("set amounts reference is an isolated preview",async()=>{const s=await readFile(new URL("../web/amounts-preview.mjs",import.meta.url),"utf8");for(const label of ["Buy amount","Sell percentage","Same for all","Random range","SHARE OF EACH BALANCE","SHARE TO SELL","MIN SOL","MAX SOL"])assert.ok(s.includes(label));assert.ok(s.includes("disabled data-amount-submit"));assert.ok(!s.includes("fetch("));assert.ok(!s.includes("adapter."));});
