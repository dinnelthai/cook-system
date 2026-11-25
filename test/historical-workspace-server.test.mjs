import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {once} from "node:events";
import {mkdtemp,realpath,rm,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {createHistoricalProjectCatalogue} from "../src/inner-market/historical-project-catalogue.mjs";
import {exportHistoricalWorkspace} from "../src/inner-market/historical-project-workspace.mjs";
test("enabled full server persists and restores scoped historical queries across restart",{timeout:30000},async t=>{
 const dir=await realpath(await mkdtemp(join(tmpdir(),"cook-m09-server-")));let child;
 async function stop(){if(child&&child.exitCode===null&&child.signalCode===null){const exited=once(child,"exit");child.kill();await exited;}}
 t.after(async()=>{await stop();await rm(dir,{recursive:true,force:true});});
 const probe=createServer();probe.listen(0,"127.0.0.1");await once(probe,"listening");const port=probe.address().port;const closed=once(probe,"close");probe.close();await closed;
 const script=fileURLToPath(new URL("../scripts/serve-offline-mvp.mjs",import.meta.url));
 async function start(){child=spawn(process.execPath,[script],{env:{...process.env,HOME:dir,PORT:String(port),COOK_HISTORICAL_WORKSPACE:"1",COOK_HISTORICAL_WORKSPACE_DB:join(dir,"workspace.sqlite"),COOK_LOCAL_FAUCET:"0",COOK_LOCAL_TRANSFER:"0",COOK_LOCAL_TRADING:"0",COOK_LOCAL_RPC_URL:"",COOK_PUMP_LAB_URL:"",COOK_TERMINAL_REPORT:""},stdio:["ignore","pipe","pipe"]});await new Promise((resolve,reject)=>{let output="";child.stdout.on("data",b=>{output+=b;if(output.includes("Offline MVP:"))resolve();});child.once("error",reject);child.once("exit",code=>reject(Error("server exited "+code)));});}
 const base="http://127.0.0.1:"+port,post=(suffix,body,headers={})=>fetch(base+"/api/historical-workspace"+suffix,{method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(body)});
 const read=async name=>JSON.parse(await readFile(new URL("../fixtures/synthetic/"+name,import.meta.url),"utf8"));
 const c=createHistoricalProjectCatalogue();c.add(await read("terminal-candle-report.json"));c.add(await read("m07/catalogue-second.json"));
 await start();const save=await post("",{workspace:exportHistoricalWorkspace(c),expectedRevision:0});assert.equal(save.status,200);assert.equal((await save.json()).revision,1);
 await stop();await start();
 const list=await post("/query",{kind:"projects",revision:1});assert.equal(list.status,200);const data=await list.json(),[a,b]=data.projects;assert.equal(data.projects.length,2);
 assert.equal((await post("/query",{kind:"record",revision:1,projectKey:a.key,recordKey:b.record_keys[0]})).status,404);
 const result=await post("/query",{kind:"events",revision:1,projectKey:a.key,recordKey:a.record_keys[0],limit:1});assert.equal(result.status,200);assert.equal((await result.json()).next_offset,1);
 assert.equal((await post("/query",{kind:"projects",revision:1},{origin:"https://example.invalid"})).status,403);
 assert.equal((await post("",{workspace:exportHistoricalWorkspace(c),expectedRevision:0})).status,409);
 assert.equal((await fetch(base+"/web/saved-project-review.mjs")).status,200);
 assert.equal((await (await fetch(base+"/api/historical-workspace")).json()).revision,1);
});
