import test from "node:test";
import assert from "node:assert/strict";
import {benchmarkAlertStore} from "../scripts/benchmark-alert-store.mjs";
test("isolated alert benchmark measures writes and audits every persisted transition",async()=>{
 const r=await benchmarkAlertStore({alerts:4});
 assert.equal(r.status,"PASS");assert.equal(r.record_count,12);assert.equal(r.write_elapsed_ms.length,12);assert.ok(r.write_elapsed_ms.every(x=>x>=0));
 assert.ok(r.journal_bytes>0);assert.equal(r.soak_test_completed,false);assert.equal(r.production_capacity_validated,false);
 await assert.rejects(()=>benchmarkAlertStore({alerts:501}),/ALERT_BENCHMARK_LIMIT/);
});
