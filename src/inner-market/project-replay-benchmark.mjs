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
 const runs=[];
 for(let i=0;i<repeats;i++){
  const start=performance.now(),result=replayProjectEvents(events);
  runs.push({elapsed_ms:Math.round((performance.now()-start)*1000)/1000,matched:canonicalJson(result.aggregate)===canonicalJson(p)});
 }
 return {schema_version:"cook-project-replay-benchmark.1",status:runs.every(r=>r.matched)?"PASS":"REVIEW_REQUIRED",revisions,repeats,runs,
  fixture_bytes:Buffer.byteLength(canonicalJson(events)),sqlite_io_measured:false,production_capacity_validated:false,execution_enabled:false};
}
