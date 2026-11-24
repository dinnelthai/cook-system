import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {once} from "node:events";
import {fileURLToPath} from "node:url";

test("localhost server serves terminal shell, modules and explicit report bridge",{timeout:15000},async t=>{
 const probe=createServer();probe.listen(0,"127.0.0.1");await once(probe,"listening");
 const port=probe.address().port;probe.close();await once(probe,"close");
 const report=fileURLToPath(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url));
 const script=fileURLToPath(new URL("../scripts/serve-offline-mvp.mjs",import.meta.url));
 const child=spawn(process.execPath,[script],{env:{...process.env,PORT:String(port),COOK_TERMINAL_REPORT:report,COOK_LOCAL_RPC_URL:""},stdio:["ignore","pipe","pipe"]});
 t.after(()=>{if(child.exitCode===null)child.kill();});
 await new Promise((resolve,reject)=>{
  let output="";
  child.stdout.on("data",buf=>{output+=buf.toString();if(output.includes("Offline MVP:"))resolve();});
  child.once("error",reject);child.once("exit",code=>reject(Error("server exited "+code)));
 });
 const base="http://127.0.0.1:"+port;
 const html=await fetch(base);assert.equal(html.status,200);assert.match(await html.text(),/src="\/web\/app\.mjs"/);
 assert.equal((await fetch(base+"/web/app.mjs")).status,200);
 assert.equal((await fetch(base+"/src/inner-market/terminal-state.mjs")).status,200);
 assert.equal((await fetch(base+"/src/inner-market/terminal-candles.mjs")).status,200);
 const response=await fetch(base+"/api/terminal/report");assert.equal(response.status,200);assert.equal((await response.json()).sourceMode,"SYNTHETIC");
 const health=await fetch(base+"/api/terminal/health");assert.equal(health.status,200);assert.deepEqual(await health.json(),{report_bridge:"CONFIGURED",rpc:{status:"NOT_CONFIGURED",network_verified:false},execution_enabled:false});
 assert.equal((await fetch(base+"/api/terminal/report",{method:"POST"})).status,405);
 assert.equal((await fetch(base+"/api/terminal/report",{headers:{"sec-fetch-site":"cross-site"}})).status,403);
});
