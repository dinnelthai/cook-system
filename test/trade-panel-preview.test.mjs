import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("reference panel is an empty-state presentation only",async()=>{const s=await readFile(new URL("../web/trade-panel-preview.mjs",import.meta.url),"utf8");for(const label of ["Bundle Buy / Sell","TX count","TX Delay (Blocks)","Dump It","Trades Log","Current Mint Only"])assert.ok(s.includes(label));assert.ok(s.includes('data-preview-action disabled'));assert.ok(s.includes('reference-dump" disabled'));assert.ok(!s.includes("fetch("));assert.ok(!s.includes("setWallets"));});
