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
