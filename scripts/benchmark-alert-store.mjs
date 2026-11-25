import {performance} from "node:perf_hooks";
import {mkdtemp,rm,stat,realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {createAlertStore} from "../src/risk/alert-store.mjs";
/** Bounded synthetic diagnostic journal benchmark; never opens an operator file. */
export async function benchmarkAlertStore({alerts=100}={}){
 if(!Number.isSafeInteger(alerts)||alerts<1||alerts>500)throw Error("ALERT_BENCHMARK_LIMIT");
 const dir=await mkdtemp(join(await realpath(tmpdir()),"cook-alert-benchmark-")),path=join(dir,"fixture.jsonl");
 const writes=[];
 const measure=async fn=>{const start=performance.now();const value=await fn();return {value,elapsed_ms:Math.round((performance.now()-start)*1000)/1000};};
 try{
  const s=createAlertStore(path);
  for(let i=0;i<alerts;i++){
   const id="qa-"+i;
   const a=await measure(()=>s.openAlert({schema_version:"1.0.0",alert_id:id,severity:"info",source_event_ids:[]},i*3));
   const b=await measure(()=>s.acknowledge(id,{actor:"fixture",atMs:i*3+1}));
   const c=await measure(()=>s.resolve(id,{reason:"fixture",atMs:i*3+2}));
   writes.push(a.elapsed_ms,b.elapsed_ms,c.elapsed_ms);
  }
  const reopened=createAlertStore(path);
  const audit=await measure(()=>reopened.audit()),size=(await stat(path)).size;
  return {schema_version:"cook-alert-benchmark.1",status:audit.value.record_count===3*alerts&&audit.value.counts.resolved===alerts?"PASS":"REVIEW_REQUIRED",alert_count:alerts,record_count:audit.value.record_count,write_elapsed_ms:writes,audit_elapsed_ms:audit.elapsed_ms,journal_bytes:size,storage_mode:"ATOMIC_FULL_REPLACEMENT",soak_test_completed:false,production_capacity_validated:false,execution_enabled:false};
 }finally{await rm(dir,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=await benchmarkAlertStore({alerts:Number(process.argv[2]??100)});console.log(JSON.stringify(result,null,2));if(result.status!=="PASS")process.exitCode=1;}
 catch(e){console.error(e.message);process.exitCode=1;}
}
