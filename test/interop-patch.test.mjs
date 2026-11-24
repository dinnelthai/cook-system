import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
const script=fileURLToPath(new URL("../scripts/patch-pump-sdk-node-interop.mjs",import.meta.url));
test("interop patch is idempotent with other Anchor imports present",()=>{
 const cwd=mkdtempSync(join(tmpdir(),"cook-interop-"));
 try {
 const dir=join(cwd,"node_modules/@pump-fun/agent-payments-sdk/dist");mkdirSync(dir,{recursive:true});
 const file=join(dir,"index.js");writeFileSync(file,'import{AnchorProvider as L,Program as Y}from"@coral-xyz/anchor";import{BN as J}from"@coral-xyz/anchor";');
 const run=()=>spawnSync(process.execPath,[script],{cwd,encoding:"utf8"});
 const first=run();assert.equal(first.status,0,first.stderr);const patched=readFileSync(file,"utf8");assert.match(patched,/const \{ BN: J \}/);
 const second=run();assert.equal(second.status,0,second.stderr);assert.equal(readFileSync(file,"utf8"),patched);
 writeFileSync(file,'import{BN,Program}from"@coral-xyz/anchor";');assert.notEqual(run().status,0);
 } finally {rmSync(cwd,{recursive:true,force:true});}
});
