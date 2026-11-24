import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createWalletStore} from "../src/inner-market/local-wallet-store.mjs";
import {publicKey} from "../src/inner-market/local-faucet.mjs";
test("wallet persists and HTTP-facing metadata contains only address and timestamp",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"cook-wallet-"));t.after(()=>rm(directory,{recursive:true,force:true}));
 const s=createWalletStore({directory});assert.deepEqual(await s.list(),[]);
 const w=await s.create();assert.deepEqual(Object.keys(w),["address"]);publicKey(w.address);
 const f=join(directory,w.address+".json"),data=JSON.parse(await readFile(f,"utf8"));assert.equal(data.length,64);
 if(process.platform!=="win32")assert.equal((await stat(f)).mode&0o777,0o600);
 const rows=await createWalletStore({directory}).list();assert.equal(rows.length,1);assert.equal(rows[0].address,w.address);assert.deepEqual(Object.keys(rows[0]),["address","created_at"]);
});
