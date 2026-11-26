import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {walletReviewSummary} from "../web/wallet-action-review.mjs";
test("review totals preserve unknown balances and integer precision",()=>{assert.deepEqual(walletReviewSummary([{sol:"9007199254740993",status:"Ready"},{sol:"1",status:"Ready"}]),{count:2,sol:"9007199254740994",unverified:0});assert.deepEqual(walletReviewSummary([{sol:null,status:"RPC Error"}]),{count:1,sol:null,unverified:1});assert.equal(walletReviewSummary([]).sol,null)});
test("four review dialogs have no operational actions",async()=>{const s=await readFile(new URL("../web/wallet-action-review.mjs",import.meta.url),"utf8");for(const title of ["Drain SOL","Migrate to New","Migrate to Imported","Split"])assert.ok(s.includes(title));assert.ok(s.includes("Select exactly one source wallet"));assert.ok(s.includes("disabled class"));assert.ok(s.includes("war-wallet-picker"));assert.ok(!s.includes("Delete Wallets"));assert.ok(!s.includes("fetch("));assert.ok(!s.includes("adapter."));});
