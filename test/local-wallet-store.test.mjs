import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createWalletStore} from "../src/inner-market/local-wallet-store.mjs";
import {publicKey} from "../src/inner-market/local-faucet.mjs";
import {Keypair, SystemProgram, Transaction} from "@solana/web3.js";
test("wallet persists and HTTP-facing metadata contains only address and timestamp",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"cook-wallet-"));t.after(()=>rm(directory,{recursive:true,force:true}));
 const s=createWalletStore({directory});assert.deepEqual(await s.list(),[]);
 const w=await s.create();assert.deepEqual(Object.keys(w),["address"]);publicKey(w.address);
 const f=join(directory,w.address+".json"),data=JSON.parse(await readFile(f,"utf8"));assert.equal(data.length,64);
 if(process.platform!=="win32")assert.equal((await stat(f)).mode&0o777,0o600);
 const rows=await createWalletStore({directory}).list();assert.equal(rows.length,1);assert.equal(rows[0].address,w.address);assert.deepEqual(Object.keys(rows[0]),["address","created_at"]);
});
test('only managed wallet keyfiles can be loaded for signing',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'cook-sign-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const s=createWalletStore({directory});const w=await s.create();const signer=await s.loadSigner(w.address);
 assert.equal(signer.publicKey.toBase58(),w.address);
 const tx=new Transaction({feePayer:signer.publicKey,recentBlockhash:'11111111111111111111111111111111'}).add(SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:Keypair.generate().publicKey,lamports:1}));tx.sign(signer);assert.equal(tx.verifySignatures(),true);
 await assert.rejects(()=>s.loadSigner('11111111111111111111111111111111'));
 await assert.rejects(()=>s.loadSigner('../private'));
});

test("local batch has no wallet-count ceiling and exposes only public metadata",async t=>{const directory=await mkdtemp(join(tmpdir(),"cook-batch-"));t.after(()=>rm(directory,{recursive:true,force:true}));const s=createWalletStore({directory});const b=await s.createBatch(21);assert.equal(b.status,"CREATED");assert.equal(b.created_count,21);assert.equal(new Set(b.wallets.map(w=>w.address)).size,21);for(const w of b.wallets)assert.deepEqual(Object.keys(w),["address"]);assert.equal((await s.list()).length,21);await assert.rejects(()=>s.createBatch(0),/INVALID_BODY/);});

test("managed key export round-trips through validated import without exposing secrets in list",async t=>{const sourceDir=await mkdtemp(join(tmpdir(),"cook-export-")),targetDir=await mkdtemp(join(tmpdir(),"cook-import-"));t.after(()=>rm(sourceDir,{recursive:true,force:true}));t.after(()=>rm(targetDir,{recursive:true,force:true}));const source=createWalletStore({directory:sourceDir}),target=createWalletStore({directory:targetDir}),created=await source.create(),exported=await source.exportKeys([created.address]);assert.equal(exported.wallets.length,1);assert.equal(exported.wallets[0].address,created.address);assert.equal(exported.wallets[0].secret_key.length,64);const imported=await target.importKeys(exported.wallets);assert.equal(imported.imported.length,1);assert.equal((await target.list())[0].address,created.address);assert.deepEqual(await target.exportKeys([created.address]),exported);});

test("import rejects mismatched key metadata while allowing more than twenty wallets",async t=>{const directory=await mkdtemp(join(tmpdir(),"cook-import-limit-"));t.after(()=>rm(directory,{recursive:true,force:true}));const s=createWalletStore({directory}),created=await s.create(),exported=await s.exportKeys([created.address]);await assert.rejects(()=>s.importKeys([{...exported.wallets[0],address:"11111111111111111111111111111111"}]),/INVALID_KEYPAIR/);const many=[];for(let i=0;i<20;i++){const otherDir=await mkdtemp(join(tmpdir(),"cook-other-"));t.after(()=>rm(otherDir,{recursive:true,force:true}));const other=createWalletStore({directory:otherDir});const wallet=await other.create();many.push((await other.exportKeys([wallet.address])).wallets[0]);}const imported=await s.importKeys(many);assert.equal(imported.imported.length,20);assert.equal((await s.list()).length,21);});

test("batch key creation route does not require an RPC connection",async()=>{const {readFile}=await import("node:fs/promises");const s=await readFile(new URL("../scripts/serve-offline-mvp.mjs",import.meta.url),"utf8");const start=s.indexOf('if(req.url.endsWith("/create-batch"))'),end=s.indexOf('if(req.url.endsWith("/portfolio"))',start);assert.ok(start>=0&&end>start);const route=s.slice(start,end);assert.ok(route.includes("wallets.createBatch(data.count)"));assert.ok(!route.includes("checkLocalRpcHealth"));assert.ok(!route.includes("COOK_LOCAL_RPC_URL"));assert.ok(!route.includes("COOK_LOCAL_GENESIS_HASH"));});
