import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,writeFile,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createAlertStore} from "../src/risk/alert-store.mjs";
const alert={schema_version:"1.0.0",alert_id:"a1",alert_type:"ATTRIBUTION_UNCERTAINTY",severity:"low",market:{},window_start_ms:1,window_end_ms:2,
 observed_facts:[],inferred_relationships:[],evidence:[],counter_evidence:[],unknowns:[],confidence:0.5,data_completeness:"unknown",
 source_event_ids:["e1"],model_version:"test",explanation:"unknown attribution",defensive_interpretation:"not a control finding"};
test("alert journal persists open, acknowledge and resolve transitions",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-alerts-")),path=join(dir,"alerts.jsonl");
 try{const store=createAlertStore(path);await store.openAlert(alert,10);await store.acknowledge("a1",{actor:"operator",atMs:20});
  await store.resolve("a1",{reason:"reviewed",atMs:30});const list=await createAlertStore(path).list();
  assert.equal(list[0].status,"RESOLVED");assert.equal((await store.audit()).record_count,3);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("alert journal rejects invalid transitions and detects hash-chain tampering",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-alerts-tamper-")),path=join(dir,"alerts.jsonl");
 try{const store=createAlertStore(path);await store.openAlert(alert,10);
  await assert.rejects(()=>store.resolve("missing",{reason:"x",atMs:20}),/ALERT_NOT_RESOLVABLE/);
  const text=await readFile(path,"utf8");await writeFile(path,text.replace("ATTRIBUTION_UNCERTAINTY","LOW_BREADTH_PRICE_SHOCK"));
  await assert.rejects(()=>store.audit(),/ALERT_JOURNAL_CHAIN_INVALID/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test("journal rejects time regression and retains the last complete state",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-alert-time-")),path=join(dir,"alerts.jsonl");
 try{const store=createAlertStore(path);await store.openAlert(alert,10);
  await assert.rejects(()=>store.acknowledge("a1",{actor:"operator",atMs:9}),/ALERT_TIME_REGRESSION/);
  assert.equal((await store.audit()).record_count,1);
  assert.equal((await store.list())[0].status,"OPEN");
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("truncated journal is rejected without rewriting evidence",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-alert-trunc-")),path=join(dir,"alerts.jsonl");
 try{const store=createAlertStore(path);await store.openAlert(alert,10);
  const original=await readFile(path,"utf8"),broken=original.slice(0,-1);await writeFile(path,broken);
  await assert.rejects(()=>store.audit(),/ALERT_JOURNAL_TRUNCATED/);
  await assert.rejects(()=>store.resolve("a1",{reason:"review",atMs:20}),/ALERT_JOURNAL_TRUNCATED/);
  assert.equal(await readFile(path,"utf8"),broken);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("concurrent alert writers publish complete journal versions",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"cook-alert-concurrent-")),path=join(dir,"alerts.jsonl");
 try{await Promise.all([createAlertStore(path).openAlert(alert,10),createAlertStore(path).openAlert({...alert,alert_id:"a2"},11)]);
  assert.equal((await createAlertStore(path).audit()).record_count,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
