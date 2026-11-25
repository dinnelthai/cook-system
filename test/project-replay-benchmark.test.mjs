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

test("bounded repeated metadata replay exposes resource observations without asserting soak capacity",()=>{
 const r=benchmarkProjectReplay({revisions:3000,repeats:5});
 assert.equal(r.status,"PASS");
 assert.equal(r.runs.length,5);
 assert.ok(r.runs.every(x=>x.matched&&Number.isSafeInteger(x.heap_used_bytes)&&x.heap_used_bytes>0&&x.rss_bytes>0));
 assert.ok(r.resources.observed_peak_rss_bytes>=r.resources.baseline_rss_bytes);
 assert.equal(r.resources.memory_leak_attested,false);
 assert.equal(r.production_capacity_validated,false);
 assert.equal(r.execution_enabled,false);
 assert.throws(()=>benchmarkProjectReplay({revisions:5000,repeats:4}),/BENCHMARK_LIMIT/);
});
