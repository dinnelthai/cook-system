import test from 'node:test';import assert from 'node:assert/strict';import {mapLabCandles} from '../web/local-market.mjs';
const row={open_time:'2026-11-24T10:00:00.000Z',open:'1.0',high:'2.0',low:'1.0',close:'2.0',quote_volume:'0.000000290000'};
test('converts indexed SOL quote volume to exact lamports',()=>assert.equal(mapLabCandles([row])[0].quote_volume_base_units,'290'));
test('rejects malformed, inconsistent, out-of-order or unrepresentable candles',()=>{
 for(const rows of [[{...row,high:'0.5'}],[{...row,quote_volume:'0.0000000001'}],[{...row,open_time:'not a date'}],[row,row],[{...row,quote_volume:'9'.repeat(400)}]])assert.throws(()=>mapLabCandles(rows));
});
