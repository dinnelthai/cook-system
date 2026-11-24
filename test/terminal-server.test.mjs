import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {once} from "node:events";
import {fileURLToPath} from "node:url";
import {mkdtemp,writeFile,symlink,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";

test("localhost server serves terminal shell, modules and explicit report bridge",{timeout:15000},async t=>{
 const probe=createServer();probe.listen(0,"127.0.0.1");await once(probe,"listening");
 const port=probe.address().port;probe.close();await once(probe,"close");
 const report=fileURLToPath(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url));
 const script=fileURLToPath(new URL("../scripts/serve-offline-mvp.mjs",import.meta.url));
 const child=spawn(process.execPath,[script],{env:{...process.env,PORT:String(port),COOK_TERMINAL_REPORT:report,COOK_LOCAL_RPC_URL:"",COOK_LOCAL_FAUCET:"0",COOK_PUMP_LAB_URL:""},stdio:["ignore","pipe","pipe"]});
 t.after(()=>{if(child.exitCode===null)child.kill();});
 await new Promise((resolve,reject)=>{
  let output="";
  child.stdout.on("data",buf=>{output+=buf.toString();if(output.includes("Offline MVP:"))resolve();});
  child.once("error",reject);child.once("exit",code=>reject(Error("server exited "+code)));
 });
 const base="http://127.0.0.1:"+port;
 assert.equal((await fetch(base+"/web/app.mjs",{headers:{origin:"https://example.invalid"}})).status,403);
 assert.equal((await fetch(base+"/api/terminal/report",{headers:{origin:"https://example.invalid"}})).status,403);
 assert.equal((await fetch(base+"/.env.example")).status,404);
 if(process.platform!=="win32"){
  const outside=await mkdtemp(join(tmpdir(),"cook-static-"));
  const inside=await mkdtemp(fileURLToPath(new URL("../web/.test-static-",import.meta.url)));
  t.after(async()=>{await rm(inside,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});});
  await writeFile(join(outside,"private.json"),'{"fixture":true}');
  await symlink(join(outside,"private.json"),join(inside,"link.json"));
  const name=inside.split("/").pop();
  assert.equal((await fetch(base+"/web/"+name+"/link.json")).status,404);
 }
 const html=await fetch(base);assert.equal(html.status,200);assert.match(await html.text(),/src="\/web\/app\.mjs"/);
 assert.equal((await fetch(base+"/web/app.mjs")).status,200);
 assert.equal((await fetch(base+"/src/inner-market/terminal-state.mjs")).status,200);
 assert.equal((await fetch(base+"/src/inner-market/terminal-candles.mjs")).status,200);
 assert.equal((await fetch(base+"/src/inner-market/historical-risk.mjs")).status,200);
 assert.equal((await fetch(base+"/src/inner-market/unified-historical-report.mjs")).status,200);
 const response=await fetch(base+"/api/terminal/report");assert.equal(response.status,200);assert.equal((await response.json()).sourceMode,"SYNTHETIC");
 const health=await fetch(base+"/api/terminal/health");assert.equal(health.status,200);assert.deepEqual(await health.json(),{report_bridge:"CONFIGURED",rpc:{status:"NOT_CONFIGURED",network_verified:false},execution_enabled:false});
 const trade=await fetch(base+"/api/local-wallet/trade",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({side:"buy",amount:"1",addresses:[]})});assert.equal(trade.status,400);assert.equal((await trade.json()).code,"TRADE_DISABLED");
 const cross=await fetch(base+"/api/local-wallet/trade",{method:"POST",headers:{"content-type":"application/json","sec-fetch-site":"cross-site"},body:"{}"});assert.equal(cross.status,403);
 assert.equal((await fetch(base+"/api/terminal/report",{method:"POST"})).status,405);
 assert.equal((await fetch(base+"/api/terminal/report",{headers:{"sec-fetch-site":"cross-site"}})).status,403);
});
