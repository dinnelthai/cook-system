import {performance} from "node:perf_hooks";
import {runParticipantValidationSuite} from "./participant-validation-suite.mjs";
import {verifyParticipantExperiment} from "./participant-experiment-artifact.mjs";
/** Bounded serial QA performance sample; not a production-capacity claim.
 * Timings are kept outside deterministic validation report contents. */
export function benchmarkParticipantValidation({base,repeats=3,seeds=[701,702,703,704,705],steps=240}={}){
 if(!Number.isSafeInteger(repeats)||repeats<1||repeats>5||!Array.isArray(seeds)||seeds.length*repeats>50||!Number.isSafeInteger(steps)||steps*seeds.length*repeats>50000)throw Error("PARTICIPANT_BENCHMARK_WORK_LIMIT");
 const runs=[];let digest=null;
 for(let i=0;i<repeats;i++){
  const memoryBefore=process.memoryUsage(),start=performance.now();
  const report=runParticipantValidationSuite({base,seeds,steps});
  const elapsed=performance.now()-start,memoryAfter=process.memoryUsage();
  verifyParticipantExperiment(report);if(digest===null)digest=report.digest;
  runs.push({run:i+1,elapsed_ms:Math.round(elapsed*1000)/1000,heap_before_bytes:memoryBefore.heapUsed,heap_after_bytes:memoryAfter.heapUsed,rss_after_bytes:memoryAfter.rss,
   artifact_bytes:Buffer.byteLength(JSON.stringify(report)),digest:report.digest,status:report.status});
 }
 const durations=runs.map(r=>r.elapsed_ms).sort((a,b)=>a-b);
 return {schema_version:"cook-participant-benchmark.1",status:runs.every(r=>r.status==="SYNTHETIC_REGRESSION_PASS"&&r.digest===digest)?"SYNTHETIC_REGRESSION_PASS":"REVIEW_REQUIRED",
  repeats,seeds:[...seeds],steps,runs,min_elapsed_ms:durations[0],max_elapsed_ms:durations.at(-1),
  deterministic_digest_match:runs.every(r=>r.digest===digest),peak_memory_measured:false,production_capacity_validated:false,execution_enabled:false};
}
