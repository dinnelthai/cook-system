import test from "node:test";
import assert from "node:assert/strict";
import {Worker} from "node:worker_threads";
import {mkdtempSync,realpathSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {openProjectStore} from "../src/inner-market/project-store.mjs";
const storeModule=new URL("../src/inner-market/project-store.mjs",import.meta.url).href;
test("independent SQLite writers racing on one expected metadata revision commit only once",{timeout:15000},async()=>{
 const dir=mkdtempSync(join(realpathSync(tmpdir()),"cook-contention-")),path=join(dir,"fixture.sqlite");
 const workers=[];let store;
 try{
  store=openProjectStore(path,{now:()=>1000});
  const p=store.create({project_id:"contention-fixture",profile:{name:"Synthetic QA",symbol:"QA"}});
  store.close();store=null;
  const start=new SharedArrayBuffer(4),gate=new Int32Array(start);
  const source=`
   const {parentPort,workerData}=require("node:worker_threads");
   (async()=>{
    const {openProjectStore}=await import(workerData.module);
    const store=openProjectStore(workerData.path,{now:()=>1000});
    try{
     parentPort.postMessage({ready:true});
     const gate=new Int32Array(workerData.start);
     if(Atomics.wait(gate,0,0,8000)==="timed-out")throw Error("TEST_GATE_TIMEOUT");
     try{
      const result=store.append(workerData.projectId,{command_id:workerData.id,type:"UPDATE_PROFILE",payload:{profile:{description:workerData.id}}},{expected_revision:1});
      parentPort.postMessage({status:result.status});
     }catch(e){parentPort.postMessage({status:e.message});}
    }finally{store.close();}
   })().catch(e=>{parentPort.postMessage({fatal:e.message});process.exitCode=1;});
  `;
  const tasks=["writer-a","writer-b"].map(id=>{
   const w=new Worker(source,{eval:true,workerData:{module:storeModule,path,projectId:p.project_id,id,start}});workers.push(w);
   let readyResolve,readyReject,doneResolve,doneReject;
   const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;});
   const done=new Promise((r,j)=>{doneResolve=r;doneReject=j;});done.catch(()=>{});
   w.on("message",m=>{if(m.ready)readyResolve();else if(m.fatal){const e=Error(m.fatal);readyReject(e);doneReject(e);}else doneResolve(m.status);});
   w.on("error",e=>{readyReject(e);doneReject(e);});
   w.on("exit",code=>{if(code!==0){const e=Error("WORKER_EXIT_"+code);readyReject(e);doneReject(e);}});
   return {ready,done};
  });
  await Promise.all(tasks.map(t=>t.ready));
  Atomics.store(gate,0,1);Atomics.notify(gate,0,2);
  const results=await Promise.all(tasks.map(t=>t.done));
  assert.deepEqual(results.sort(),["APPLIED","PROJECT_REVISION_CONFLICT"]);
  store=openProjectStore(path);assert.equal(store.verify(p.project_id).revision,2);
  assert.equal(store.inspectDatabaseIntegrity().status,"INTERNALLY_CONSISTENT");
 }finally{await Promise.all(workers.map(w=>w.terminate()));store?.close();rmSync(dir,{recursive:true,force:true});}
});
