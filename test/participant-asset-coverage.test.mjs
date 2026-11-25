import test from "node:test";
import assert from "node:assert/strict";
import {runParticipantAssetCoverage} from "../src/simulation/participant-asset-coverage.mjs";
test("passive synthetic account profiles reconcile all balances and classify assets",()=>{
 const r=runParticipantAssetCoverage({seed:7});
 assert.equal(r.status,"SYNTHETIC_REGRESSION_PASS");
 assert.equal(r.case_count,4);assert.equal(r.passed_count,4);
 assert.deepEqual(r,runParticipantAssetCoverage({seed:7}));
 assert.deepEqual(r.cases.find(x=>x.case_id==="EMPTY_ACCOUNTS").asset_shape_counts,{EMPTY:8,QUOTE_ONLY:0,TOKEN_ONLY:0,BOTH_ASSETS:0});
 assert.deepEqual(r.cases.find(x=>x.case_id==="MIXED_ASSET_SHAPES").asset_shape_counts,{EMPTY:2,QUOTE_ONLY:2,TOKEN_ONLY:2,BOTH_ASSETS:2});
 assert.deepEqual(r.cases.find(x=>x.case_id==="LARGE_INTEGER_BALANCES").asset_shape_counts,{EMPTY:1,QUOTE_ONLY:2,TOKEN_ONLY:2,BOTH_ASSETS:3});
 assert.equal(r.cases.find(x=>x.case_id==="MAX_ACCOUNT_COUNT").account_count,256);
 assert.equal(r.execution_enabled,false);assert.equal(r.real_market_validated,false);
});
test("invalid seed rejected",()=>assert.throws(()=>runParticipantAssetCoverage({seed:NaN}),/INVALID_ASSET_COVERAGE_SEED/));
