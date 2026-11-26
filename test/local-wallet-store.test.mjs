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

test("local batch respects existing capacity and exposes only public metadata",async t=>{const directory=await mkdtemp(join(tmpdir(),"cook-batch-"));t.after(()=>rm(directory,{recursive:true,force:true}));const s=createWalletStore({directory});const b=await s.createBatch(3);assert.equal(b.status,"CREATED");assert.equal(b.created_count,3);assert.equal(new Set(b.wallets.map(w=>w.address)).size,3);for(const w of b.wallets)assert.deepEqual(Object.keys(w),["address"]);assert.equal((await s.list()).length,3);await assert.rejects(()=>s.createBatch(18),/WALLET_LIMIT/);await assert.rejects(()=>s.createBatch(0),/INVALID_BODY/);assert.equal((await s.list()).length,3);});
