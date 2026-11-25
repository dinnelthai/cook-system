import {spawn,execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createServer} from "node:net";
import {once} from "node:events";
import {fileURLToPath} from "node:url";
import {checkBrowserRecovery} from "./browser-recovery-check.mjs";
const root=fileURLToPath(new URL("../",import.meta.url));
const run=promisify(execFile);
const browser=process.env.COOK_BROWSER_BINARY;
if(!browser)throw Error("COOK_BROWSER_BINARY_REQUIRED");
if(process.getuid?.()===0)throw Error("BROWSER_SMOKE_REQUIRES_NON_ROOT_SANDBOX");
const dir=await mkdtemp(join(tmpdir(),"cook-browser-qa-"));
let child;
try{
 const socket=createServer();socket.listen(0,"127.0.0.1");await once(socket,"listening");
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const url="http://127.0.0.1:"+port;
 // Do not inherit any COOK flags, RPC configuration, or wallet storage paths.
 const env={PATH:process.env.PATH,HOME:dir,USERPROFILE:dir,TMPDIR:dir,PORT:String(port),COOK_PROJECT_DB:join(dir,"projects.sqlite")};
 child=spawn(process.execPath,["scripts/serve-offline-mvp.mjs"],{cwd:root,env,stdio:["ignore","ignore","ignore"]});
 let spawnError=null;child.on("error",error=>{spawnError=error;});
 let ready=false;
 for(let i=0;i<50;i++){
  if(spawnError||child.exitCode!==null)throw Error("BROWSER_SMOKE_SERVER_FAILED");
  try{const r=await fetch(url+"/api/terminal/health",{signal:AbortSignal.timeout(500)});const v=await r.json();
   if(r.ok&&v.execution_enabled===false&&v.rpc?.status==="NOT_CONFIGURED"){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!ready)throw Error("BROWSER_SMOKE_SERVER_NOT_READY");
 if(process.argv.includes("--interactions")){
  console.log(JSON.stringify(await checkBrowserRecovery({browser,dir,env,url})));
 }else{
 const {stdout}=await run(browser,["--headless","--disable-background-networking","--disable-sync","--no-first-run","--user-data-dir="+join(dir,"browser"),"--virtual-time-budget=5000","--dump-dom",url],{env,timeout:30000,maxBuffer:8*1024*1024});
 // These are rendered DOM markers, not static source-code regular expressions.
 if(!/id="terminal-project-select"/.test(stdout)||!stdout.includes("Execution: DISABLED")||!stdout.includes('data-page="terminal"'))
  throw Error("BROWSER_SMOKE_RENDER_MISMATCH");
 console.log(JSON.stringify({status:"BROWSER_SMOKE_PASS",scope:"EMPTY_OFFLINE_TERMINAL",execution_enabled:false,full_browser_e2e_validated:false}));
 }
}finally{
 if(child&&child.exitCode===null){const closed=once(child,"exit").catch(()=>{});child.kill();await Promise.race([closed,new Promise(resolve=>setTimeout(resolve,2000))]);if(child.exitCode===null)child.kill("SIGKILL");}
 await rm(dir,{recursive:true,force:true});
}
