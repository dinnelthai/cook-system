import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditLocalReadAcceptance} from "../src/inner-market/local-read-acceptance.mjs";
const pin="7".repeat(44),sig="8".repeat(88);
const input=()=>({endpoint:"http://127.0.0.1:8899",expectedGenesisHash:pin,range:{start_slot:100,end_slot:120},receiptSamples:[{signature:sig,slot:110}]});
const mock=(overrides={},calls=[])=>async(url,init)=>{
 const req=JSON.parse(init.body);calls.push(req.method);assert.equal(init.redirect,"error");
 const results={getGenesisHash:pin,getHealth:"ok",getVersion:{"solana-core":"fixture"},getSlot:200,getFirstAvailableBlock:90,minimumLedgerSlot:89,getTransaction:{slot:110,transaction:{signatures:[sig]},meta:{err:null,fee:5000}},...overrides};
 assert.ok(Object.hasOwn(results,req.method),"unexpected method");
 return {ok:true,json:async()=>({jsonrpc:"2.0",id:req.id,result:results[req.method]})};
};
test("preflight refuses non-loopback and public genesis before RPC requests",async()=>{
 const calls=[];for(const endpoint of ["http://192.168.1.1:8899","http://localhost:8899","http://127.0.0.1:8899/?key=x"]){
  await assert.rejects(()=>auditLocalReadAcceptance({...input(),endpoint,fetchImpl:mock({},calls)}),/INVALID_LOCAL_RPC_ENDPOINT/);
 }
 await assert.rejects(()=>auditLocalReadAcceptance({...input(),expectedGenesisHash:"5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",fetchImpl:mock({},calls)}),/INVALID_LOCAL_GENESIS_PIN/);
 assert.deepEqual(calls,[]);
});
test("genesis mismatch stops further requests",async()=>{
 const calls=[],r=await auditLocalReadAcceptance({...input(),fetchImpl:mock({getGenesisHash:"9".repeat(44)},calls)});
 assert.equal(r.status,"REVIEW_REQUIRED");assert.deepEqual(calls,["getGenesisHash"]);
});
test("retention gap and null receipt stay partial",async()=>{
 const r=await auditLocalReadAcceptance({...input(),fetchImpl:mock({getFirstAvailableBlock:115,getTransaction:null})});
 assert.equal(r.status,"PARTIAL");assert.ok(r.checks.some(c=>c.code==="REQUEST_PRECEDES_RETAINED_LEDGER"));assert.equal(r.receipts.unavailable,1);
 assert.equal(r.history_complete_attested,false);
});
test("receipt slot mismatch requires review",async()=>{
 const r=await auditLocalReadAcceptance({...input(),fetchImpl:mock({getTransaction:{slot:111,transaction:{signatures:[sig]},meta:{err:null,fee:5000}}})});
 assert.equal(r.status,"REVIEW_REQUIRED");assert.equal(r.receipts.contradicted,1);
});
test("successful read checks do not certify a historical report or financial parity",async()=>{
 const calls=[],r=await auditLocalReadAcceptance({...input(),fetchImpl:mock({},calls)});
 assert.equal(r.status,"PARTIAL");assert.equal(r.receipts.matched,1);assert.equal(r.execution_enabled,false);assert.equal(r.financial_parity_attested,false);
 assert.deepEqual(calls.sort(),["getGenesisHash","getHealth","getVersion","getSlot","getFirstAvailableBlock","minimumLedgerSlot","getTransaction"].sort());
});
test("synthetic report cannot serve as local validator evidence",async()=>{
 const reportInput=JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
 const r=await auditLocalReadAcceptance({...input(),reportInput,fetchImpl:mock()});
 assert.equal(r.status,"REVIEW_REQUIRED");assert.ok(r.checks.some(c=>c.code==="REPORT_SCOPE_MISMATCH"));
});
