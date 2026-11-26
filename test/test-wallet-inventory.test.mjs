import test from "node:test";
import assert from "node:assert/strict";
import {openTestWalletInventory} from "../src/inner-market/test-wallet-inventory.mjs";
test("simulation inventory is independent of signer storage and has no 20-account aggregate cap",()=>{const s=openTestWalletInventory({path:":memory:"});try{for(let i=0;i<3;i++)s.create(100);const r=s.list();assert.equal(r.total,300);assert.equal(r.wallets.length,200);assert.equal(r.kind,"SIMULATION_ONLY");for(const w of r.wallets){assert.match(w.id,/^test-wallet-/);assert.deepEqual(Object.keys(w),["id","created_at"])}assert.equal(s.loadSigner,undefined);assert.throws(()=>s.create(101),/INVALID_BODY/);assert.equal(s.list().total,300)}finally{s.close()}});
