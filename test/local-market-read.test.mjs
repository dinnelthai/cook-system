import test from "node:test";
import assert from "node:assert/strict";
import {scopedLabSnapshot,createLocalTrading} from "../src/inner-market/local-trading.mjs";
const identity={mint:"m",pool:"p",interval:"1m"},row={...identity,open_time:"2026-01-01T00:00:00Z",open:"1",high:"1",low:"1",close:"1",quote_volume:"0"};
test("market index rejects mixed identities without dropping trades",()=>{const r=scopedLabSnapshot({type:"market",candles:[row]},identity);assert.equal(r.candles.length,1);assert.equal(r.execution_enabled,false);assert.equal(r.source_attestation,"UNKNOWN");assert.throws(()=>scopedLabSnapshot({type:"market",candles:[row,{...row,pool:"other"}]},identity),/MARKET_CHANGED/);assert.equal(scopedLabSnapshot({type:"ping"},identity),null);});
test("read permission cannot enable market execution or signer access",async()=>{const s=createLocalTrading({readEnabled:true,enabled:false,wallets:{list(){throw Error("must not load wallet")}}});await assert.rejects(()=>s.batch({}),/TRADE_DISABLED/);await assert.rejects(()=>s.market(),/TRADE_DISABLED/);});
