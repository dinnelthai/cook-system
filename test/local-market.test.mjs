import test from 'node:test';import assert from 'node:assert/strict';import {mapLabCandles,analyzeCandleQuality} from '../web/local-market.mjs';
const row={open_time:'2026-11-24T10:00:00.000Z',open:'1.0',high:'2.0',low:'1.0',close:'2.0',quote_volume:'0.000000290000'};
test('converts indexed SOL quote volume to exact lamports',()=>assert.equal(mapLabCandles([row])[0].quote_volume_base_units,'290'));
test('rejects malformed, inconsistent, out-of-order or unrepresentable candles',()=>{
 for(const rows of [[{...row,high:'0.5'}],[{...row,quote_volume:'0.0000000001'}],[{...row,open_time:'not a date'}],[row,row],[{...row,quote_volume:'9'.repeat(400)}]])assert.throws(()=>mapLabCandles(rows));
});

test('exact decimal comparison catches differences below Number precision',()=>{
 assert.throws(()=>mapLabCandles([{...row,open:'1.000000000000000001',high:'1.000000000000000000',close:'1.0'}]));
 assert.throws(()=>mapLabCandles([{...row,open_time:'2026-02-30T10:00:00Z'}]));
 assert.throws(()=>mapLabCandles([{...row,quote_volume:'340282366920938463463374607431.768211456'}]));
 assert.equal(mapLabCandles([{...row,quote_volume:'340282366920938463463374607431.768211455'}])[0].quote_volume_base_units,'340282366920938463463374607431768211455');
});

const qc=(i,patch={})=>({interval_start_ms:i*60000,open_price:"1.00",high_price:"1.01",low_price:"0.99",close_price:"1.00",quote_volume_base_units:"100",...patch});
test("candle quality computes exact coverage and volume concentration without actor claims",()=>{
 const result=analyzeCandleQuality(Array.from({length:10},(_,i)=>qc(i)));
 assert.equal(result.status,"OBSERVED");assert.equal(result.metrics.total_quote_volume_base_units,"1000");assert.equal(result.metrics.max_candle_volume_share_bps,"1000");assert.equal(result.metrics.missing_interval_count,0);assert.equal(result.buy_sell_flow_status,"UNAVAILABLE_FROM_OHLCV");assert.equal(result.wash_trade_detection_status,"UNAVAILABLE_FROM_OHLCV");assert.equal(result.execution_enabled,false);
});
test("candle quality flags gaps, large moves, drawdown and concentrated volume as observations only",()=>{
 const rows=Array.from({length:10},(_,i)=>qc(i<5?i:i+1,{quote_volume_base_units:i===9?"900":"10",...(i===9?{close_price:"1.30",high_price:"1.31",low_price:"0.70"}:{})}));
 const result=analyzeCandleQuality(rows);assert.equal(result.status,"OBSERVED_WITH_GAPS");assert.equal(result.metrics.missing_interval_count,1);
 for(const code of ["CANDLE_GAPS","LARGE_PRICE_MOVE","LARGE_OBSERVED_DRAWDOWN","VOLUME_CONCENTRATION"])assert.ok(result.alerts.some(a=>a.code===code));
 assert.equal(result.actor_attribution_status,"UNAVAILABLE_FROM_OHLCV");
});
test("candle quality withholds conclusions for small samples and rejects malformed prices",()=>{
 assert.equal(analyzeCandleQuality([qc(0)]).status,"INSUFFICIENT_OBSERVATIONS");assert.equal(analyzeCandleQuality([]).status,"NO_DATA");assert.equal(analyzeCandleQuality([]).execution_enabled,false);
 assert.throws(()=>analyzeCandleQuality([qc(0,{open_price:"1e9"})]));assert.throws(()=>analyzeCandleQuality([qc(0,{high_price:"1.0000000000000000001"})]));assert.throws(()=>analyzeCandleQuality([qc(0)],{intervalMs:123}));
});
