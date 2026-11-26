import {test} from 'node:test';
import assert from 'node:assert/strict';
import {solToLamports,portionOfBalance} from '../web/trade-ticket.mjs';
test('SOL amount converts exactly without floating point',()=>{assert.equal(solToLamports('0.000000001'),'1');assert.equal(solToLamports('1.25'),'1250000000');assert.throws(()=>solToLamports('0.0000000001'));assert.throws(()=>solToLamports('0'));});
test('sell percentages round down to token base units',()=>{assert.equal(portionOfBalance('101',25),'25');assert.equal(portionOfBalance('100',100),'100');assert.throws(()=>portionOfBalance('0',25));});
