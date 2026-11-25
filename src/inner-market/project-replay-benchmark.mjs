import {performance} from "node:perf_hooks";
import {canonicalJson} from "../core/canonical-json.mjs";
import {createProjectAggregate,applyProjectCommand} from "./project-aggregate.mjs";
import {replayProjectEvents} from "./project-event-replay.mjs";
/** Pure metadata fixture: no lifecycle evidence generation, network or trading. */
export function benchmarkProjectReplay({revisions=1000,repeats=3}={}){
 if(!Number.isSafeInteger(revisions)||revisions<1||revisions>5000||!Number.isSafeInteger(repeats)||repeats<1||repeats>5||revisions*repeats>15000)throw Error("PROJECT_REPLAY_BENCHMARK_LIMIT");
 let p=createProjectAggregate({project_id:"replay-benchmark",profile:{name:"Synthetic QA",symbol:"QA"}},{now:()=>0});
 const events=[{event_type:"PROJECT_CREATED",project_id:p.project_id,revision:1,source:"application",occurred_at_ms:0,payload:{aggregate:p}}];
 for(let i=1;i<revisions;i++){
  const r=applyProjectCommand(p,{type:"UPDATE_PROFILE",payload:{profile:{description:"metadata revision "+i}}},{now:()=>i});p=r.aggregate;
  events.push({event_type:r.event_type,project_id:p.project_id,revision:p.revision,source:"application",occurred_at_ms:i,payload:r.payload});
 }
 const runs=[];const memoryBefore=process.memoryUsage();let observedPeakRss=memoryBefore.rss;
 for(let i=0;i<repeats;i++){
  const start=performance.now(),result=replayProjectEvents(events);
  const elapsed=performance.now()-start,matched=canonicalJson(result.aggregate)===canonicalJson(p);
  const memory=process.memoryUsage();observedPeakRss=Math.max(observedPeakRss,memory.rss);
  runs.push({elapsed_ms:Math.round(elapsed*1000)/1000,matched,heap_used_bytes:memory.heapUsed,rss_bytes:memory.rss});
 }
 return {schema_version:"cook-project-replay-benchmark.1",status:runs.every(r=>r.matched)?"PASS":"REVIEW_REQUIRED",revisions,repeats,runs,
  fixture_bytes:Buffer.byteLength(canonicalJson(events)),resources:{baseline_rss_bytes:memoryBefore.rss,baseline_heap_used_bytes:memoryBefore.heapUsed,observed_peak_rss_bytes:observedPeakRss,sampling_scope:"REPLAY_BOUNDARIES_ONLY",memory_leak_attested:false},sqlite_io_measured:false,production_capacity_validated:false,execution_enabled:false};
}

/** Measure metadata-only SQLite IO in a fresh private temporary directory.
 * Never touches operator databases. No performance threshold is inferred. */
export async function benchmarkProjectStore({revisions=100,repeats=3}={}){
 if(!Number.isSafeInteger(revisions)||revisions<1||revisions>500||
    !Number.isSafeInteger(repeats)||repeats<1||repeats>10)throw Error("PROJECT_STORE_BENCHMARK_LIMIT");
 const [{mkdtempSync,rmSync,realpathSync,statSync},{tmpdir},{join},{openProjectStore}]=await Promise.all([
  import("node:fs"),import("node:os"),import("node:path"),import("./project-store.mjs")]);
 const dir=mkdtempSync(join(realpathSync(tmpdir()),"cook-store-benchmark-")),path=join(dir,"fixture.sqlite");
 let writer,reader;
 const measure=fn=>{const start=performance.now(),value=fn();return {value,elapsed_ms:Math.round((performance.now()-start)*1000)/1000};};
 try{
  writer=openProjectStore(path,{now:()=>1000});
  const created=measure(()=>writer.create({project_id:"sqlite-benchmark",profile:{name:"Synthetic QA",symbol:"QA"}}));
  let project=created.value;const writes=[created.elapsed_ms];
  for(let i=1;i<revisions;i++){
   const result=measure(()=>writer.append(project.project_id,{command_id:"fixture-revision-"+i,type:"UPDATE_PROFILE",payload:{profile:{description:"metadata revision "+i}}},{expected_revision:project.revision}));
   project=result.value.aggregate;writes.push(result.elapsed_ms);
  }
  reader=openProjectStore(path,{now:()=>1000});
  const runs=[];
  for(let i=0;i<repeats;i++){
   const result=measure(()=>reader.get(project.project_id));
   runs.push({elapsed_ms:result.elapsed_ms,matched:canonicalJson(result.value)===canonicalJson(project)});
  }
  const integrity=measure(()=>reader.inspectDatabaseIntegrity());
  let staleRevisionRejected=null;
  if(revisions>1){
   try{reader.append(project.project_id,{command_id:"fixture-stale",type:"UPDATE_PROFILE",payload:{profile:{description:"must not commit"}}},{expected_revision:project.revision-1});staleRevisionRejected=false;}
   catch(e){if(e.message!=="PROJECT_REVISION_CONFLICT")throw e;staleRevisionRejected=true;}
  }
  const verified=reader.verify(project.project_id);
  return {schema_version:"cook-project-store-benchmark.1",status:runs.every(x=>x.matched)&&integrity.value.status==="INTERNALLY_CONSISTENT"&&staleRevisionRejected!==false&&verified.revision===revisions?"PASS":"REVIEW_REQUIRED",
   revisions,repeats,write_elapsed_ms:writes,read_runs:runs,integrity_elapsed_ms:integrity.elapsed_ms,database_bytes:statSync(path).size,
   stale_revision_rejected:staleRevisionRejected,sqlite_io_measured:true,independent_connections:2,parallel_writer_contention_measured:false,
   production_capacity_validated:false,execution_enabled:false};
 }finally{try{reader?.close();}finally{try{writer?.close();}finally{rmSync(dir,{recursive:true,force:true});}}}
}
