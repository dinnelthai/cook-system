import test from "node:test";
import assert from "node:assert/strict";
import {newLab,addWallet,previewRows,applyExercise,totals} from "../src/inner-market/mock-wallet-lab.mjs";
test("fictional wallet ledger is isolated, exact and fee reconciled",()=>{
 const initial=addWallet(addWallet(newLab()));
 const req=[{id:"SIM-1",quantity:2},{id:"SIM-2",quantity:3}];
 const rows=previewRows(initial,"BUY",req);assert.equal(rows.length,2);assert.equal(initial.wallets[0].cash,1000);
 const bought=applyExercise(initial,"BUY",req);assert.deepEqual(totals(bought),{cash:1948,token:5,fees:2,initial:2000,nav:1998,pnl:-2});
 const sold=applyExercise(bought,"SELL",req);assert.equal(totals(sold).cash,1996);assert.equal(totals(sold).token,0);
 assert.equal(initial.events.length,0);assert.equal(sold.events.length,4);
});
test("reject invalid amounts, duplicate requests, insufficient balances and pause",()=>{
 const s=addWallet(newLab());
 for(const r of [[{id:"SIM-1",quantity:0}],[{id:"SIM-1",quantity:1.5}],[{id:"SIM-1",quantity:100}],[{id:"SIM-1",quantity:1},{id:"SIM-1",quantity:1}]])assert.throws(()=>applyExercise(s,"BUY",r));
 assert.throws(()=>applyExercise(s,"SELL",[{id:"SIM-1",quantity:1}]));
 assert.throws(()=>previewRows({...s,paused:true},"BUY",[{id:"SIM-1",quantity:1}]));
 assert.equal(s.events.length,0);assert.equal(s.wallets[0].cash,1000);
});
