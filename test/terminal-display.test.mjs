import test from "node:test";
import assert from "node:assert/strict";
import {formatHistoricalSol,historicalSeriesRange,candleTimeLayout,candleEvidenceRows,marketQualityRows} from "../web/terminal-display.mjs";
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

test("exact candle evidence uses UTC and preserves original values",()=>{
 const c={interval_start_ms:0,open_price:"0.000000000001",high_price:"0.000000000002",low_price:"0.000000000001",close_price:"0.000000000002",quote_volume_base_units:"9007199254740993"};
 assert.deepEqual(candleEvidenceRows([c])[0],["1970-01-01T00:00:00.000Z",c.open_price,c.high_price,c.low_price,c.close_price,c.quote_volume_base_units]);
});
test("closed market quality does not imply live quality or use unsupported sources",()=>{
 const q={status:"DESCRIPTIVE_ONLY",source_attestation:"UNKNOWN",live_state:false,execution_enabled:false,event_count:0,data_quality_alert_count:0,ordering_status:"PASS"};
 assert.equal(marketQualityRows(q)[1][1],0);
 assert.equal(marketQualityRows({...q,live_state:true})[1][1],"未知");
 assert.equal(marketQualityRows({...q,status:"REVIEW_REQUIRED"})[1][1],"未知");
});
