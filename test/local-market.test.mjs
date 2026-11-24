import test from 'node:test';import assert from 'node:assert/strict';import {mapLabCandles} from '../web/local-market.mjs';
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
