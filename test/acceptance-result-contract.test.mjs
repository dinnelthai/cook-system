import test from "node:test";
import assert from "node:assert/strict";
import {parseAcceptanceTap,validateSqliteBenchmark} from "../src/core/acceptance-result-contract.mjs";
const summary="# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
test("acceptance requires an unambiguous nonempty TAP summary with no omitted cases",()=>{
 assert.equal(parseAcceptanceTap(summary).valid,true);
 for(const bad of [summary.replace("# tests 2","# tests 0").replace("# pass 2","# pass 0"),summary+"# pass 2\n",summary.replace("# todo 0\n",""),summary.replace("# cancelled 0","# cancelled 1"),summary.replace("# skipped 0","# skipped 1"),summary.replace("# todo 0","# todo 1"),summary.replace("# tests 2","# tests 9007199254740993")])assert.equal(parseAcceptanceTap(bad).valid,false);
 assert.equal(parseAcceptanceTap(summary.replaceAll("\n","\r\n")).valid,true);
});
test("SQLite acceptance requires measured fixture parity and never claims production capacity",()=>{
 const b={schema_version:"cook-project-store-benchmark.1",status:"PASS",revisions:2,repeats:1,write_elapsed_ms:[1,2],read_runs:[{matched:true,elapsed_ms:3}],integrity_elapsed_ms:4,database_bytes:4096,stale_revision_rejected:true,sqlite_io_measured:true,independent_connections:2,parallel_writer_contention_measured:false,production_capacity_validated:false,execution_enabled:false};
 const opts={revisions:2,repeats:1};assert.equal(validateSqliteBenchmark(b,opts),true);
 for(const change of [{read_runs:[]},{write_elapsed_ms:[1,-2]},{stale_revision_rejected:false},{database_bytes:0},{production_capacity_validated:true},{execution_enabled:true}])assert.equal(validateSqliteBenchmark({...b,...change},opts),false);
});
