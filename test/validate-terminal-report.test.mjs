import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const script=fileURLToPath(new URL("../scripts/validate-terminal-report.mjs",import.meta.url));
const fixture=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
test("report validator distinguishes review, invalid and non-settleable historical inputs",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-validator-")),path=join(dir,"report.json");
 try{
  const run=async (i,expected)=>{
   await writeFile(path,typeof i==="string"?i:JSON.stringify(i));
   const p=spawnSync(process.execPath,[script,path],{encoding:"utf8"});
   assert.equal(p.status,expected,p.stderr);
   if(expected!==1)assert.equal(JSON.parse(p.stdout).execution_enabled,false);
  };
  await run(fixture(),0);
  const h=fixture();h.sourceMode="ARCHIVED_HISTORICAL";await run(h,2);
  const bad=fixture();bad.market.historyComplete=false;await run(bad,3);
  const candle=fixture();candle.market.candleEvidence={};await run(candle,3);
  await run("{",1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
