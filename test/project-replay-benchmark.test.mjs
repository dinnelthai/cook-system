import test from "node:test";
import assert from "node:assert/strict";
import {benchmarkProjectReplay} from "../src/inner-market/project-replay-benchmark.mjs";
test("metadata-only replay benchmark reconciles independent repeated runs",()=>{
 const v=benchmarkProjectReplay({revisions:200,repeats:2});
 assert.equal(v.status,"PASS");assert.equal(v.runs.length,2);
 assert.ok(v.runs.every(r=>r.matched&&r.elapsed_ms>=0));
 assert.equal(v.sqlite_io_measured,false);assert.equal(v.execution_enabled,false);
 assert.throws(()=>benchmarkProjectReplay({revisions:5001}),/BENCHMARK_LIMIT/);
});
