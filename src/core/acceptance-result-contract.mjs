/** Strict validation for bounded, offline acceptance reports. */
export function parseAcceptanceTap(out){
 const keys={tests:"tests",passed:"pass",failed:"fail",skipped:"skipped",cancelled:"cancelled",todo:"todo"};
 const counts=Object.fromEntries(Object.entries(keys).map(([key,tap])=>{
  const matches=[...String(out??"").matchAll(new RegExp("^# "+tap+" (0|[1-9][0-9]*)\\r?$","gm"))];
  const value=matches.length===1?Number(matches[0][1]):null;
  return [key,Number.isSafeInteger(value)?value:null];
 }));
 return {...counts,valid:counts.tests>0&&counts.passed===counts.tests&&counts.failed===0&&counts.skipped===0&&counts.cancelled===0&&counts.todo===0};
}
export function validateSqliteBenchmark(b,{revisions,repeats}){
 const duration=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
 return b?.schema_version==="cook-project-store-benchmark.1"&&b.status==="PASS"&&b.revisions===revisions&&b.repeats===repeats&&
 Array.isArray(b.write_elapsed_ms)&&b.write_elapsed_ms.length===revisions&&b.write_elapsed_ms.every(duration)&&
 Array.isArray(b.read_runs)&&b.read_runs.length===repeats&&b.read_runs.every(r=>r?.matched===true&&duration(r.elapsed_ms))&&
 duration(b.integrity_elapsed_ms)&&Number.isSafeInteger(b.database_bytes)&&b.database_bytes>0&&
 b.stale_revision_rejected===true&&b.sqlite_io_measured===true&&b.independent_connections===2&&
 b.parallel_writer_contention_measured===false&&b.production_capacity_validated===false&&b.execution_enabled===false;
}
