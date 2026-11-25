import test from "node:test";
import assert from "node:assert/strict";
import {formatHistoricalSol,historicalSeriesRange,candleTimeLayout} from "../web/terminal-display.mjs";
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

test("historical candles retain real elapsed gaps rather than imply continuous trading",()=>{
 const v=candleTimeLayout([{interval_start_ms:0},{interval_start_ms:60000},{interval_start_ms:600000}],60000);
 assert.deepEqual(v.positions,[48,98,548]);assert.equal(v.missing_intervals,8);
 assert.deepEqual(candleTimeLayout([{interval_start_ms:60000}],60000).positions,[298]);
 assert.equal(candleTimeLayout([{interval_start_ms:0},{interval_start_ms:30000}],60000),null);
 assert.equal(candleTimeLayout([{interval_start_ms:0},{interval_start_ms:0}],60000),null);
});
