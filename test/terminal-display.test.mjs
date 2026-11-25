import test from "node:test";
import assert from "node:assert/strict";
import {formatHistoricalSol,historicalSeriesRange} from "../web/terminal-display.mjs";
test("historical SOL formatting preserves exact signed lamports and unknowns",()=>{
 assert.equal(formatHistoricalSol("9007199254740993"),"9007199.254740993");
 assert.equal(formatHistoricalSol("-10"),"-0.00000001");
 assert.equal(formatHistoricalSol("0"),"0.00");
 assert.equal(formatHistoricalSol(null),"—");
 assert.equal(formatHistoricalSol("—"),"—");
});
test("historical NAV chart accepts negative and mixed signed values without dropping observations",()=>{
 assert.deepEqual(historicalSeriesRange([{value:"-20"},{value:"-5"}],"NAV"),{min:-20,max:0,span:20,values:[-20,-5]});
 assert.deepEqual(historicalSeriesRange([{value:"-5"},{value:"10"}],"NAV"),{min:-5,max:10,span:15,values:[-5,10]});
 assert.equal(historicalSeriesRange([{value:"-1"}],"TRADE"),null);
 assert.equal(historicalSeriesRange([{value:null}],"NAV"),null);
 assert.equal(historicalSeriesRange([],"NAV"),null);
});
