import {spawn} from "node:child_process";
import {readFile,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {once} from "node:events";
import assert from "node:assert/strict";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function eventually(fn,timeout=12000,stage="browser-start"){
 const start=Date.now();
 while(Date.now()-start<timeout){
  const value=await fn();if(value)return value;
  await sleep(100);
 }
 throw Error("BROWSER_INTERACTION_TIMEOUT:"+stage);
}
async function connect(url){
 const ws=new WebSocket(url),pending=new Map(),listeners=new Map();
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
  if(m.method)for(const fn of listeners.get(m.method)??[])fn(m.params??{});
  if(!p)return;pending.delete(m.id);clearTimeout(p.timer);
  if(m.error)p.reject(Error("BROWSER_COMMAND_FAILED:"+p.method));else p.resolve(m.result);
 });
 return {
  call(method,params={}){
   return new Promise((resolve,reject)=>{
    const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error("BROWSER_COMMAND_TIMEOUT:"+method));},5000);
    pending.set(n,{resolve,reject,timer,method});ws.send(JSON.stringify({id:n,method,params}));
   });
  },on(method,fn){const rows=listeners.get(method)??[];rows.push(fn);listeners.set(method,rows);},close(){ws.close();}
 };
}
/** Disposable loopback browser QA; only metadata fixtures and read-only recovery. */
export async function checkBrowserRecovery({browser,dir,env,url,previewDir=null}){
 const profile=join(dir,"browser-interactions");
 const key="browser-recovery-qa";
 const seed=await fetch(url+"/api/projects",{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({create_request_id:key,profile:{name:"Browser Recovery QA",symbol:"QA"}}),signal:AbortSignal.timeout(3000)});
 assert.equal(seed.status,201);
 const project=(await seed.json()).project;
 const child=spawn(browser,["--headless","--disable-background-networking","--disable-sync","--no-first-run",
  "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1","--no-proxy-server","--remote-debugging-address=127.0.0.1",
  "--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"],{env,stdio:["ignore","ignore","pipe"]});
 let cdp,spawnError=null,stderrTail="";child.on("error",e=>{spawnError=e;});
 child.stderr.on("data",chunk=>{stderrTail=(stderrTail+String(chunk)).slice(-8192);});
 const observations=[],requests=new Map(),previews=[];
 const add=(kind,detail)=>{if(observations.length<80)observations.push({kind,...detail});};
 const pathOnly=value=>{try{const u=new URL(value);return u.origin===url?u.pathname:"OTHER_ORIGIN";}catch{return "UNKNOWN";}};
 const brief=value=>String(value??"").replace(/https?:\/\/[^\s]+/g,"[url]").slice(0,240);
 try{
  const port=await eventually(async()=>{
   if(spawnError||child.exitCode!==null||child.signalCode!==null)throw Error("BROWSER_START_FAILED");
   try{const n=Number((await readFile(join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0]);return Number.isInteger(n)&&n>0&&n<=65535?n:null;}catch{return null;}
  },12000,"debug-port-file");
  const target=await eventually(async()=>{
   if(spawnError||child.exitCode!==null||child.signalCode!==null)throw Error("BROWSER_TARGET_PROCESS_EXITED");
   try{const rows=await (await fetch("http://127.0.0.1:"+port+"/json/list",{signal:AbortSignal.timeout(1000)})).json();
    return rows.find(x=>x.type==="page");}catch{return null;}
  },12000,"debug-page-target");
  const socket=new URL(target.webSocketDebuggerUrl);
  if(socket.protocol!=="ws:"||socket.hostname!=="127.0.0.1"||Number(socket.port)!==port)throw Error("BROWSER_DEBUG_SCOPE_INVALID");
  cdp=await connect(socket.href);
  const evaluate=async expression=>{
   const r=await cdp.call("Runtime.evaluate",{expression,returnByValue:true});
   if(r.exceptionDetails)throw Error("BROWSER_EVALUATION_FAILED");
   return r.result.value;
  };
  const wait=(stage,expr)=>eventually(async()=>{
   try{return await evaluate("Boolean("+expr+")");}
   catch(error){
    if(error.message==="BROWSER_COMMAND_FAILED:Runtime.evaluate"||error.message==="BROWSER_EVALUATION_FAILED")return false;
    throw error;
   }
  },12000,stage);
  // Capture only the fixed disposable QA pages. No live user session, keys or RPC.
  async function capturePreview(page,viewport){
   if(!previewDir)return;
   assert.ok(["wallet","dashboard","projects","participants","logs","create","terminal"].includes(page));
   assert.ok(["desktop","narrow"].includes(viewport));
   const dimensions=await evaluate('({viewport_width:innerWidth,viewport_height:innerHeight,document_width:document.documentElement.scrollWidth,main_width:Math.round(document.querySelector("#main").getBoundingClientRect().width),page:document.querySelector("#main").dataset.page})');
   assert.equal(dimensions.page,page);
   const result=await cdp.call("Page.captureScreenshot",{format:"png",fromSurface:true,captureBeyondViewport:false});
   const png=Buffer.from(result.data??"","base64");
   assert.ok(png.length>8&&png.length<=8*1024*1024&&png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),"invalid preview image");
   const name=viewport+"-"+page+".png";
   await writeFile(join(previewDir,name),png,{flag:"wx"});
   previews.push({file:name,...dimensions,document_horizontal_overflow:Math.max(0,dimensions.document_width-dimensions.viewport_width)});
  }
  cdp.on("Runtime.exceptionThrown",({exceptionDetails:d})=>{
   add("exception",{text:brief(d?.exception?.description??d?.text),path:pathOnly(d?.url),line:d?.lineNumber??null});
  });
  cdp.on("Log.entryAdded",({entry:e})=>{if(e?.level==="error")add("browser_error",{text:brief(e.text),path:pathOnly(e.url)});});
  cdp.on("Network.requestWillBeSent",p=>{if(requests.size<256)requests.set(p.requestId,pathOnly(p.request?.url));});
  cdp.on("Network.responseReceived",p=>{if(p.response?.status>=400)add("http_error",{path:pathOnly(p.response.url),status:p.response.status});});
  cdp.on("Network.loadingFailed",p=>add("network_failure",{path:requests.get(p.requestId)??"UNKNOWN",reason:brief(p.errorText)}));
  await cdp.call("Runtime.enable");
  await cdp.call("Network.enable");
  await cdp.call("Log.enable");
  await cdp.call("Page.enable");
  const navigation=await cdp.call("Page.navigate",{url});
  if(navigation.errorText)throw Error("BROWSER_NAVIGATION_FAILED:"+brief(navigation.errorText));
  await wait("initial-terminal",'location.origin==='+JSON.stringify(url)+' && document.querySelector("#terminal-project-select")');
  assert.equal(await evaluate('document.querySelector("#terminal-project-context").textContent.includes("Execution: DISABLED")'),true);
  await evaluate('sessionStorage.setItem("cook.project.create.pending.v1",'+JSON.stringify(key)+');window.__cookQaBeforeReload=true');
  await cdp.call("Page.reload");
  await wait("reload-terminal",'location.origin==='+JSON.stringify(url)+' && window.__cookQaBeforeReload!==true && document.querySelector("#terminal-project-select")');
  await evaluate('document.querySelector(\'[data-page="create"]\').click()');
  await wait("recovery-panel",'document.querySelector("#project-recovery-check")');
  await evaluate('document.querySelector("#project-recovery-check").click()');
  await wait("recovery-result",'document.querySelector("#project-status")?.textContent.includes("已找到此前保存的项目")');
  assert.equal(await evaluate('sessionStorage.getItem("cook.project.create.pending.v1")'),null);
  assert.equal(await evaluate('document.querySelector(\'#project-draft-form input[name="name"]\').value'),"Browser Recovery QA");
  await evaluate('document.querySelector(\'[data-page="terminal"]\').click()');
  await wait("selected-project",'document.querySelector("#terminal-project-select")?.value==='+JSON.stringify(project.project_id));
  assert.equal(await evaluate('document.querySelector("#terminal-report-area").hidden&&document.querySelector("#terminal-report-area").inert'),true);
  await wait("operator-workspace",'document.querySelector(".operator-stage-strip")&&document.querySelector(".operator-task-grid")');
  await evaluate('window.__cookSelectionReload=true');
  await cdp.call("Page.reload");
  await wait("project-selection-reload",'window.__cookSelectionReload!==true&&document.querySelector("#terminal-project-select")?.value==='+JSON.stringify(project.project_id));
  assert.equal(await evaluate('document.querySelector("#terminal-report-area").hidden&&document.querySelector("#terminal-report-area").inert'),true);
  await wait("operator-after-reload",'document.querySelector(".operator-task-grid")');
  await evaluate('(()=>{const s=document.querySelector("#operator-view-mode");s.value="AUDIT";s.dispatchEvent(new Event("change"));})()');
  assert.equal(await evaluate('document.querySelector("#main").dataset.viewMode==="AUDIT"&&document.querySelector("details.audit-detail").open'),true);
  const pageChecks=[["wallet",'document.querySelector("#asset-interval")'],["dashboard",'document.querySelector("#scoped-review-interval")'],["projects",'document.querySelector("#workspace-export")'],["participants",'document.querySelector("#run-experiment")'],["logs",'document.querySelector("#log-download")'],["create",'document.querySelector("#project-budget-form")'],["terminal",'document.querySelector(".operator-task-grid")']];
  if(previewDir)await cdp.call("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  async function navigatePrimaryPages(viewport){
   for(const [id,condition] of pageChecks){
    await evaluate('document.querySelector('+JSON.stringify('[data-page="'+id+'"]')+').click()');
    await wait("navigation-"+viewport+"-"+id,'document.querySelector("#main").dataset.page==='+JSON.stringify(id)+'&&'+condition);
    await capturePreview(id,viewport);
   }
  }
  await navigatePrimaryPages("desktop");
  assert.equal(await evaluate('document.querySelector("#terminal-report-area").hidden&&document.querySelector("#terminal-report-area").inert'),true);
  await evaluate('document.querySelector("#project-show-risk").click()');
  await wait("risk-filter",'document.querySelector("#risk-severity")&&document.querySelector("#terminal-project-details").open');
  await evaluate('(()=>{const s=document.querySelector("#risk-severity");s.value="UNKNOWN";s.dispatchEvent(new Event("change"));})()');
  assert.equal(await evaluate('document.querySelector("#risk-evidence-rows").textContent.includes("UNKNOWN")'),true);
  assert.equal(await evaluate('document.querySelector("#open-data").disabled'),true);
  // Test actual narrow viewport with a deliberately unavailable saved selection.
  await cdp.call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await wait("narrow-viewport",'innerWidth===390&&document.querySelector(".operator-task-grid")');
  assert.equal(await evaluate('document.querySelector("#main").getBoundingClientRect().width<=innerWidth+1'),true);
  if(previewDir)await navigatePrimaryPages("narrow");
  await cdp.call("Emulation.clearDeviceMetricsOverride");
  await evaluate('sessionStorage.setItem("cook.project.selection.v1","missing-qa-project");window.__cookMissingReload=true');
  await cdp.call("Page.reload");
  await wait("missing-selection",'window.__cookMissingReload!==true&&document.querySelector("#clear-missing-project")');
  assert.equal(await evaluate('document.querySelector("#terminal-report-area").hidden&&document.querySelector("#terminal-report-area").inert&&document.querySelector("#open-data").disabled'),true);
  await evaluate('document.querySelector(\'[data-page="create"]\').click()');
  await wait("missing-selection-setup",'document.querySelector("#project-draft-form")');
  assert.equal(await evaluate('document.querySelector(\'#project-draft-form button[type="submit"]\').disabled'),true);
  await evaluate('document.querySelector(\'[data-page="terminal"]\').click()');
  await wait("missing-selection-return",'document.querySelector("#clear-missing-project")');
  await evaluate('document.querySelector("#clear-missing-project").click()');
  await wait("explicit-clear",'document.querySelector("#terminal-project-select")?.value===""&&!document.querySelector("#terminal-report-area").hidden');
  assert.equal(await evaluate('sessionStorage.getItem("cook.project.selection.v1")'),null);
  assert.equal(observations.filter(x=>x.kind==="exception").length,0);
  const events=await (await fetch(url+"/api/projects/"+encodeURIComponent(project.project_id)+"/events",{signal:AbortSignal.timeout(3000)})).json();
  assert.equal(events.events.length,1);
  const directory=await (await fetch(url+"/api/projects",{signal:AbortSignal.timeout(3000)})).json();
  assert.equal(directory.projects.length,1);
  assert.equal(directory.projects[0].execution_policy.enabled,false);
  if(previewDir){
   assert.equal(previews.length,14);
   await writeFile(join(previewDir,"manifest.json"),JSON.stringify({schema_version:"cook-browser-preview.1",scope:"DISPOSABLE_METADATA_ONLY",manual_visual_review:"NOT_RUN",execution_enabled:false,previews},null,2),{flag:"wx"});
  }
  return {status:"BROWSER_RECOVERY_PASS",scope:"DISPOSABLE_METADATA_RECOVERY_NAVIGATION_AND_MISSING_SELECTION",execution_enabled:false,full_browser_e2e_validated:false,preview_count:previews.length,manual_visual_review:"NOT_RUN"};
 }catch(error){
  let state=null;
  if(cdp)try{
   const r=await cdp.call("Runtime.evaluate",{expression:'({origin:location.origin,ready:document.readyState,page:document.querySelector("#main")?.dataset.page??null,main:document.querySelector("#main")?.innerText.slice(0,160)??null,context:document.querySelector("#terminal-project-context")?.innerText.slice(0,160)??null})',returnByValue:true});
   state=r.result?.value??null;
  }catch{}
  // All browser data is from disposable QA fixtures, never a user's session.
  // Report only fixed startup categories, not arbitrary stderr or paths.
  const startup={exit_code:child.exitCode,signal:child.signalCode,spawn_error:spawnError?.code??null,
   stderr_observed:stderrTail.length>0,
   categories:[["sandbox",/sandbox|apparmor/i],["profile_lock",/singleton|profile.*lock/i],["shared_memory",/shared.memory|\/dev\/shm/i],["debug_listener",/DevTools listening/i],["resource_limit",/resource temporarily unavailable|out of memory|too many open files/i],["display",/missing X server|no display/i]].filter(([,pattern])=>pattern.test(stderrTail)).map(([label])=>label)};
  console.error("BROWSER_QA_DIAGNOSTICS "+JSON.stringify({state,observations,startup}));
  throw error;
 }finally{
  const running=()=>child.exitCode===null&&child.signalCode===null;
  if(running()){
   const exited=once(child,"exit").catch(()=>{});
   // Give Chromium a chance to flush its disposable profile and close its
   // subprocesses before the parent deletes the temporary directory.
   if(cdp)try{await cdp.call("Browser.close");}catch{}
   await Promise.race([exited,sleep(2000)]);
   if(running()){child.kill();await Promise.race([exited,sleep(2000)]);}
   if(running()){child.kill("SIGKILL");await Promise.race([exited,sleep(2000)]);}
   if(running())throw Error("BROWSER_SHUTDOWN_TIMEOUT");
  }
  cdp?.close();
 }
}
