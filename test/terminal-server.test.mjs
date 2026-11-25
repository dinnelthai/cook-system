import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {once} from "node:events";
import {fileURLToPath} from "node:url";
import {mkdtemp,writeFile,symlink,rm,copyFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";

test("localhost server serves terminal shell, modules and explicit report bridge",{timeout:15000},async t=>{
 const probe=createServer();probe.listen(0,"127.0.0.1");await once(probe,"listening");
 const port=probe.address().port;probe.close();await once(probe,"close");
 const fixture=fileURLToPath(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url));
 const reportDir=await mkdtemp(join(tmpdir(),"cook-bridge-")),report=join(reportDir,"report.json");
 t.after(()=>rm(reportDir,{recursive:true,force:true}));await copyFile(fixture,report);
 const home=await mkdtemp(join(tmpdir(),"cook-server-home-"));t.after(()=>rm(home,{recursive:true,force:true}));
 const script=fileURLToPath(new URL("../scripts/serve-offline-mvp.mjs",import.meta.url));
 const child=spawn(process.execPath,[script],{env:{...process.env,HOME:home,PORT:String(port),COOK_TERMINAL_REPORT:report,COOK_LOCAL_RPC_URL:"",COOK_LOCAL_FAUCET:"1",COOK_LOCAL_TRANSFER:"0",COOK_LOCAL_TRADING:"0",COOK_PUMP_LAB_URL:"",COOK_HISTORICAL_WORKSPACE:"0"},stdio:["ignore","pipe","pipe"]});
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
 const disabled=await fetch(base+"/api/historical-workspace");assert.equal(disabled.status,503);assert.equal((await disabled.json()).code,"WORKSPACE_DISABLED");
 assert.equal((await fetch(base+"/api/historical-workspace",{headers:{origin:"https://example.invalid"}})).status,403);
 const response=await fetch(base+"/api/terminal/report");assert.equal(response.status,200);assert.equal((await response.json()).sourceMode,"SYNTHETIC");
 const health=await fetch(base+"/api/terminal/health");assert.equal(health.status,200);assert.deepEqual(await health.json(),{report_bridge:"CONFIGURED",rpc:{status:"NOT_CONFIGURED",network_verified:false},execution_enabled:false});
 const trade=await fetch(base+"/api/local-wallet/market",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});assert.equal(trade.status,400);assert.equal((await trade.json()).code,"TRADE_DISABLED");
 const portfolio=await fetch(base+"/api/local-wallet/portfolio",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({limit:5})});assert.equal(portfolio.status,503);assert.equal((await portfolio.json()).code,"PORTFOLIO_UNAVAILABLE");
 const faucet=await fetch(base+"/api/local-wallet/airdrop",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({address:"11111111111111111111111111111111",amount:"1"})});assert.equal(faucet.status,400);assert.equal((await faucet.json()).code,"FAUCET_DISABLED");
 const created=await fetch(base+"/api/local-wallet/create",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});assert.equal(created.status,200);const wallet=(await created.json()).address;
 const transfer=await fetch(base+"/api/local-wallet/transfer",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({from:"11111111111111111111111111111111",to:wallet,amount:"1"})});assert.equal(transfer.status,400);assert.equal((await transfer.json()).code,"TRANSFER_DISABLED");
 const cross=await fetch(base+"/api/local-wallet/trade",{method:"POST",headers:{"content-type":"application/json","sec-fetch-site":"cross-site"},body:"{}"});assert.equal(cross.status,403);
 const unicodeOversize=await fetch(base+"/api/local-wallet/market",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({note:"界".repeat(1400)})});assert.equal(unicodeOversize.status,413);assert.equal((await unicodeOversize.json()).code,"BODY_TOO_LARGE");
 const invalidUtf8=await fetch(base+"/api/local-wallet/market",{method:"POST",headers:{"content-type":"application/json"},body:Buffer.from([0x7b,0x22,0x78,0x22,0x3a,0x22,0xff,0x22,0x7d])});assert.equal(invalidUtf8.status,400);assert.equal((await invalidUtf8.json()).code,"INVALID_BODY_ENCODING");
 const projectResponse=await fetch(base+"/api/projects",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({project_id:"server-project",profile:{name:"Server Project",symbol:"SERVER"},network:{cluster:"localnet",genesis_hash:"11111111111111111111111111111111"},token:{supply_base_units:"1000000000",decimals:6,creator_wallet_address:"11111111111111111111111111111111"}})});
 assert.equal(projectResponse.status,201);const project=(await projectResponse.json()).project;assert.equal(project.revision,1);assert.equal(project.execution_policy.enabled,false);
 const projectGroup={group_id:"dev-wallets",name:"Dev Wallets",purpose:"DEV",members:[{wallet_address:"11111111111111111111111111111111",role:"DEV",enabled:true,allocation_limit_base_units:null}]};
 const projectCommand=await fetch(base+"/api/projects/server-project/commands",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({command_id:"server-command-1",type:"UPSERT_WALLET_GROUP",payload:{group:projectGroup},expected_revision:1})});
 assert.equal(projectCommand.status,200);assert.equal((await projectCommand.json()).aggregate.revision,2);
 const projectVerify=await fetch(base+"/api/projects/server-project/verify");assert.equal(projectVerify.status,200);assert.equal((await projectVerify.json()).event_count,2);
 assert.equal((await fetch(base+"/api/projects/server-project/events")).status,200);
 assert.equal((await fetch(base+"/api/terminal/report",{method:"POST"})).status,405);
 assert.equal((await fetch(base+"/api/terminal/report",{headers:{"sec-fetch-site":"cross-site"}})).status,403);
 if(process.platform!=="win32"){
  await rm(report);await symlink(fixture,report);
  assert.equal((await fetch(base+"/api/terminal/report")).status,422);
 }
});
