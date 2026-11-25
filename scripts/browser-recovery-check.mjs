import {spawn} from "node:child_process";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {once} from "node:events";
import assert from "node:assert/strict";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function eventually(fn,timeout=12000){
 const start=Date.now();
 while(Date.now()-start<timeout){
  const value=await fn();if(value)return value;
  await sleep(100);
 }
 throw Error("BROWSER_INTERACTION_TIMEOUT");
}
async function connect(url){
 const ws=new WebSocket(url),pending=new Map();
 let id=0;
 const fail=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error("BROWSER_CONNECTION_CLOSED"));}pending.clear();};
 ws.addEventListener("close",fail);ws.addEventListener("error",fail);
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error("BROWSER_CONNECTION_TIMEOUT")),5000);
  ws.addEventListener("open",()=>{clearTimeout(timer);resolve();},{once:true});
  ws.addEventListener("error",()=>{clearTimeout(timer);reject(Error("BROWSER_CONNECTION_FAILED"));},{once:true});
 });
 ws.addEventListener("message",({data})=>{
  const m=JSON.parse(data),p=pending.get(m.id);
  if(!p)return;pending.delete(m.id);clearTimeout(p.timer);
  if(m.error)p.reject(Error("BROWSER_COMMAND_FAILED:"+p.method));else p.resolve(m.result);
 });
 return {
  call(method,params={}){
   return new Promise((resolve,reject)=>{
    const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error("BROWSER_COMMAND_TIMEOUT:"+method));},5000);
    pending.set(n,{resolve,reject,timer,method});ws.send(JSON.stringify({id:n,method,params}));
   });
  },close(){ws.close();}
 };
}
/** Disposable loopback browser QA; only metadata fixtures and read-only recovery. */
export async function checkBrowserRecovery({browser,dir,env,url}){
 const profile=join(dir,"browser-interactions");
 const key="browser-recovery-qa";
 const seed=await fetch(url+"/api/projects",{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({create_request_id:key,profile:{name:"Browser Recovery QA",symbol:"QA"}}),signal:AbortSignal.timeout(3000)});
 assert.equal(seed.status,201);
 const project=(await seed.json()).project;
 const child=spawn(browser,["--headless","--disable-background-networking","--disable-sync","--no-first-run",
  "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost","--remote-debugging-address=127.0.0.1",
  "--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"],{env,stdio:"ignore"});
 let cdp,spawnError=null;child.on("error",e=>{spawnError=e;});
 try{
  const port=await eventually(async()=>{
   if(spawnError||child.exitCode!==null)throw Error("BROWSER_START_FAILED");
   try{const n=Number((await readFile(join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0]);return Number.isInteger(n)&&n>0&&n<=65535?n:null;}catch{return null;}
  });
  const target=await eventually(async()=>{
   try{const rows=await (await fetch("http://127.0.0.1:"+port+"/json/list",{signal:AbortSignal.timeout(1000)})).json();
    return rows.find(x=>x.type==="page");}catch{return null;}
  });
  const socket=new URL(target.webSocketDebuggerUrl);
  if(socket.protocol!=="ws:"||socket.hostname!=="127.0.0.1"||Number(socket.port)!==port)throw Error("BROWSER_DEBUG_SCOPE_INVALID");
  cdp=await connect(socket.href);
  const evaluate=async expression=>{
   const r=await cdp.call("Runtime.evaluate",{expression,returnByValue:true});
   if(r.exceptionDetails)throw Error("BROWSER_EVALUATION_FAILED");
   return r.result.value;
  };
  const wait=expr=>eventually(async()=>{
   try{return await evaluate("Boolean("+expr+")");}
   catch(error){
    if(error.message==="BROWSER_COMMAND_FAILED:Runtime.evaluate"||error.message==="BROWSER_EVALUATION_FAILED")return false;
    throw error;
   }
  });
  await cdp.call("Page.enable");
  await cdp.call("Page.navigate",{url});
  await wait('location.origin==='+JSON.stringify(url)+' && document.querySelector("#terminal-project-select")');
  assert.equal(await evaluate('document.querySelector("#terminal-project-context").textContent.includes("Execution: DISABLED")'),true);
  await evaluate('sessionStorage.setItem("cook.project.create.pending.v1",'+JSON.stringify(key)+');window.__cookQaBeforeReload=true');
  await cdp.call("Page.reload");
  await wait('location.origin==='+JSON.stringify(url)+' && window.__cookQaBeforeReload!==true && document.querySelector("#terminal-project-select")');
  await evaluate('document.querySelector(\'[data-page="create"]\').click()');
  await wait('document.querySelector("#project-recovery-check")');
  await evaluate('document.querySelector("#project-recovery-check").click()');
  await wait('document.querySelector("#project-status")?.textContent.includes("已找到此前保存的项目")');
  assert.equal(await evaluate('sessionStorage.getItem("cook.project.create.pending.v1")'),null);
  assert.equal(await evaluate('document.querySelector(\'#project-draft-form input[name="name"]\').value'),"Browser Recovery QA");
  await evaluate('document.querySelector(\'[data-page="terminal"]\').click()');
  await wait('document.querySelector("#terminal-project-select")?.value==='+JSON.stringify(project.project_id));
  assert.equal(await evaluate('document.querySelector("#terminal-report-area").hidden&&document.querySelector("#terminal-report-area").inert'),true);
  const events=await (await fetch(url+"/api/projects/"+encodeURIComponent(project.project_id)+"/events",{signal:AbortSignal.timeout(3000)})).json();
  assert.equal(events.events.length,1);
  const directory=await (await fetch(url+"/api/projects",{signal:AbortSignal.timeout(3000)})).json();
  assert.equal(directory.projects.length,1);
  assert.equal(directory.projects[0].execution_policy.enabled,false);
  return {status:"BROWSER_RECOVERY_PASS",scope:"DISPOSABLE_METADATA_RECOVERY",execution_enabled:false,full_browser_e2e_validated:false};
 }finally{
  cdp?.close();
  if(child.exitCode===null){const closed=once(child,"exit").catch(()=>{});child.kill();await Promise.race([closed,sleep(2000)]);if(child.exitCode===null)child.kill("SIGKILL");}
 }
}
