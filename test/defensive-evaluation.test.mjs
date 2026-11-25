import test from "node:test";
import assert from "node:assert/strict";
import {runHeldOutDefensiveEvaluation} from "../src/simulation/defensive-evaluation.mjs";
test("held-out synthetic defensive cases are deterministic and meet expected alert contracts",()=>{
 const a=runHeldOutDefensiveEvaluation({seeds:[701,702,703]}),b=runHeldOutDefensiveEvaluation({seeds:[701,702,703]});
 assert.deepEqual(a,b);assert.equal(a.status,"SYNTHETIC_REGRESSION_ONLY");assert.equal(a.case_count,12);
 for(const type of ["LOW_BREADTH_PRICE_SHOCK","CURVE_STATE_OR_DATA_MISMATCH","ATTRIBUTION_UNCERTAINTY"]){
  assert.equal(a.metrics[type].false_negative,0,type);assert.equal(a.metrics[type].recall,1,type);
  assert.equal(a.metrics[type].false_positive,0,type);assert.equal(a.metrics[type].precision,1,type);
 }
 assert.equal(a.real_market_accuracy_claimed,false);assert.equal(a.execution_enabled,false);
});
