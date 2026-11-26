import test from "node:test";
import assert from "node:assert/strict";
import {scopedIndexCandles,renderCurrentCandles} from "../web/current-market-view.mjs";
const project={network:{cluster:"localnet",genesis_hash:"g"},token:{mint:"m"},markets:[{venue:"PUMP_SWAP",market_account:"p",verification_status:"VERIFIED"}]};const response={mint:"m",pool:"p",interval:"1m",candles:[{open_time:"2026-01-01T00:00:00Z",open:"1",high:"2",low:"1",close:"2",quote_volume:"1"}]};
test("index observations must match selected mint, registered verified pool and interval",()=>{assert.equal(scopedIndexCandles(project,response,"1m")[0].close_price,"2");assert.throws(()=>scopedIndexCandles(project,{...response,pool:"other"},"1m"));assert.throws(()=>scopedIndexCandles(project,{...response,mint:"other"},"1m"));assert.throws(()=>scopedIndexCandles(project,response,"5m"));assert.throws(()=>scopedIndexCandles({...project,network:{cluster:"mainnet"}},response,"1m"));});

test("current chart window limits the display",()=>{const points=Array.from({length:80},(_,i)=>({interval_start_ms:i*60000,open_price:"1",high_price:"2",low_price:"1",close_price:"2",quote_volume_base_units:"1"}));const out=renderCurrentCandles(points,"1m","candles",String,30);assert.match(out,/30 candles/);assert.doesNotMatch(out,/80 candles/);});
