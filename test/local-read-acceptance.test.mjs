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

const acct="11111111111111111111111111111111";
const expected={fee_lamports:"5000",outcome:"SUCCESS",accounts:[{address:acct,pre_lamports:"10000",post_lamports:"5000"}]};
const tx=()=>({slot:110,transaction:{signatures:[sig],message:{accountKeys:[acct]}},meta:{err:null,fee:5000,preBalances:[10000],postBalances:[5000]}});
const financialInput=()=>({...input(),receiptSamples:[{signature:sig,slot:110,expected}]});
test("declared sample fee and native balance observations match without certifying financial parity",async()=>{
 const r=await auditLocalReadAcceptance({...financialInput(),fetchImpl:mock({getTransaction:tx()})});
 assert.equal(r.status,"PARTIAL");assert.equal(r.receipt_financial_observations[0].status,"DECLARED_SAMPLE_MATCH");assert.equal(r.financial_parity_attested,false);
 assert.ok(r.checks.some(c=>c.id==="receipt_financial"&&c.status==="PASS"));
});
test("contradictory fee or balance does not pass receipt financial audit",async()=>{
 for(const patch of [{fee:5001},{postBalances:[4999]},{err:{InstructionError:[0,"Custom"]}}]){
  const data=tx();Object.assign(data.meta,patch);
  const r=await auditLocalReadAcceptance({...financialInput(),fetchImpl:mock({getTransaction:data})});
  assert.equal(r.status,"REVIEW_REQUIRED");
 }
});
test("missing or unsafe numeric balances remain partial, and loaded address indices are checked",async()=>{
 for(const patch of [{postBalances:[Number.MAX_SAFE_INTEGER+1]},{postBalances:undefined}]){
  const data=tx();Object.assign(data.meta,patch);
  const r=await auditLocalReadAcceptance({...financialInput(),fetchImpl:mock({getTransaction:data})});
  assert.equal(r.receipt_financial_observations[0].status,"PARTIAL");
 }
 const data=tx();data.meta.postBalances=[];
 const r=await auditLocalReadAcceptance({...financialInput(),fetchImpl:mock({getTransaction:data})});
 assert.equal(r.status,"REVIEW_REQUIRED");
});
test("malformed receipt expectations fail before RPC reads",async()=>{
 const calls=[];const data=financialInput();data.receiptSamples[0].expected={...expected,fee_lamports:"01"};
 await assert.rejects(()=>auditLocalReadAcceptance({...data,fetchImpl:mock({},calls)}),/INVALID_RECEIPT_EXPECTATION_AMOUNT/);
 assert.deepEqual(calls,[]);
});
test("read-only acceptance rejects mismatched JSON-RPC response IDs",async()=>{
 const calls=[];
 const r=await auditLocalReadAcceptance({...input(),fetchImpl:async(_url,init)=>{
  const q=JSON.parse(init.body);calls.push(q.method);return {ok:true,json:async()=>({jsonrpc:"2.0",id:q.id+1,result:pin})};
 }});
 assert.equal(r.status,"PARTIAL");assert.equal(r.checks[0].code,"GENESIS_UNAVAILABLE");assert.deepEqual(calls,["getGenesisHash"]);
});

const tokenAccount="11111111111111111111111111111112",mint="So11111111111111111111111111111111111111112";
const tokenExpected={address:tokenAccount,mint,owner:acct,decimals:6,pre_amount:"18446744073709551615",post_amount:"0"};
const tokenRow=(amount,extra={})=>({accountIndex:1,mint,owner:acct,uiTokenAmount:{amount,decimals:6},...extra});
function tokenTx(){
 const t=tx();t.version=0;t.transaction.message.addressTableLookups=[{}];t.meta.loadedAddresses={writable:[tokenAccount],readonly:[]};
 t.meta.preBalances.push(200);t.meta.postBalances.push(200);
 t.meta.preTokenBalances=[tokenRow(tokenExpected.pre_amount)];t.meta.postTokenBalances=[tokenRow("0")];return t;
}
const tokenInput=(row=tokenExpected)=>({...input(),receiptSamples:[{signature:sig,slot:110,expected:{...expected,token_accounts:[row]}}]});
test("token receipts match exact u64 strings on loaded account indices",async()=>{
 const r=await auditLocalReadAcceptance({...tokenInput(),fetchImpl:mock({getTransaction:tokenTx()})});
 assert.equal(r.status,"PARTIAL");assert.ok(r.checks.some(c=>c.id==="receipt_tokens"&&c.status==="PASS"));
 assert.equal(r.receipt_financial_observations[0].status,"DECLARED_SAMPLE_MATCH");
 assert.equal(r.financial_parity_attested,false);assert.ok(!JSON.stringify(r).includes(tokenAccount));
});
test("token amount mint decimals and owner contradictions require review",async()=>{
 for(const patch of [{uiTokenAmount:{amount:"1",decimals:6}},{mint:acct},{uiTokenAmount:{amount:"0",decimals:9}},{owner:tokenAccount}]){
  const t=tokenTx();Object.assign(t.meta.postTokenBalances[0],patch);
  const r=await auditLocalReadAcceptance({...tokenInput(),fetchImpl:mock({getTransaction:t})});
  assert.equal(r.status,"REVIEW_REQUIRED");assert.ok(r.checks.some(c=>c.id==="receipt_tokens"&&c.status==="REVIEW_REQUIRED"));
 }
});
test("absent token metadata and missing owner remain unknown rather than zero",async()=>{
 for(const change of [t=>delete t.meta.postTokenBalances,t=>t.meta.postTokenBalances=[],t=>delete t.meta.postTokenBalances[0].owner]){
  const t=tokenTx();change(t);
  const r=await auditLocalReadAcceptance({...tokenInput(),fetchImpl:mock({getTransaction:t})});
  assert.equal(r.receipt_financial_observations[0].status,"PARTIAL");assert.ok(r.checks.some(c=>c.id==="receipt_tokens"&&c.status==="PARTIAL"));
 }
});
test("explicitly absent token record is not equivalent to an observed zero",async()=>{
 const t=tokenTx(),wanted={...tokenExpected,post_amount:null};t.meta.postTokenBalances=[];
 const r=await auditLocalReadAcceptance({...tokenInput(wanted),fetchImpl:mock({getTransaction:t})});
 assert.equal(r.receipt_financial_observations[0].status,"DECLARED_SAMPLE_MATCH");
 t.meta.postTokenBalances=[tokenRow("0")];
 const r2=await auditLocalReadAcceptance({...tokenInput(wanted),fetchImpl:mock({getTransaction:t})});
 assert.equal(r2.status,"REVIEW_REQUIRED");
});
test("duplicate indices and malformed token receipt amounts require review",async()=>{
 for(const change of [t=>t.meta.postTokenBalances.push(tokenRow("0")),t=>t.meta.postTokenBalances[0].accountIndex=256,t=>t.meta.postTokenBalances[0].uiTokenAmount.amount="18446744073709551616"]){
  const t=tokenTx();change(t);const r=await auditLocalReadAcceptance({...tokenInput(),fetchImpl:mock({getTransaction:t})});
  assert.equal(r.status,"REVIEW_REQUIRED");
 }
});
test("token expectation rejects duplicate accounts and unsafe amounts before RPC",async()=>{
 const calls=[],i=tokenInput();i.receiptSamples[0].expected.token_accounts.push({...tokenExpected});
 await assert.rejects(()=>auditLocalReadAcceptance({...i,fetchImpl:mock({},calls)}),/DUPLICATE_TOKEN_EXPECTATION_ACCOUNT/);
 await assert.rejects(()=>auditLocalReadAcceptance({...tokenInput({...tokenExpected,pre_amount:"18446744073709551616"}),fetchImpl:mock({},calls)}),/INVALID_RECEIPT_EXPECTATION_AMOUNT/);
 assert.deepEqual(calls,[]);
});
test("token contradiction is not masked by missing native balance evidence",async()=>{
 const t=tokenTx();delete t.meta.preBalances;t.meta.postTokenBalances[0].uiTokenAmount.amount="1";
 const r=await auditLocalReadAcceptance({...tokenInput(),fetchImpl:mock({getTransaction:t})});
 assert.equal(r.status,"REVIEW_REQUIRED");
});

test("retained report samples bind exact closed interval and declared financial expectations",async()=>{
 const {bindLocalReadReportSamples}=await import("../src/inner-market/local-read-report-binding.mjs");
 const sample={signature:sig,slot:110,expected};
 const reportInput={sourceMode:"ARCHIVED_HISTORICAL",scope:{network:"localnet",genesisHash:pin,openingCutoff:"slot:100",closingCutoff:"slot:120"},
 archivedEvidence:{accountInterval:{scope:{genesisHash:pin,openingSlot:100,closingSlot:120},receipts:[{signature:sig,genesisHash:pin,finality:"FINALIZED",transaction:tx()}]}}};
 const args={reportInput,range:{start_slot:100,end_slot:120},receiptSamples:[sample],expectedGenesisHash:pin};
 const r=bindLocalReadReportSamples(args);
 assert.equal(r.status,"PARTIAL");assert.equal(r.counts.matched,1);assert.equal(r.financial_parity_attested,false);
 assert.equal(r.code,"REPORT_RETAINED_SAMPLE_MATCH_INTERVAL_COMPLETENESS_UNATTESTED");
 assert.ok(!JSON.stringify(r).includes(sig));
 assert.equal(bindLocalReadReportSamples({...args,range:{start_slot:99,end_slot:120}}).code,"REPORT_INTERVAL_MISMATCH");
 const bad=structuredClone(reportInput);bad.archivedEvidence.accountInterval.receipts[0].transaction.meta.fee=5001;
 assert.equal(bindLocalReadReportSamples({...args,reportInput:bad}).status,"REVIEW_REQUIRED");
 const missing=structuredClone(reportInput);missing.archivedEvidence.accountInterval.receipts=[];
 assert.equal(bindLocalReadReportSamples({...args,reportInput:missing}).counts.incomplete,1);
 const legacy=structuredClone(reportInput);legacy.scope.network="local_sim";
 assert.equal(bindLocalReadReportSamples({...args,reportInput:legacy}).code,"LEGACY_REPORT_NETWORK_ALIAS");
 const noExpected=bindLocalReadReportSamples({...args,receiptSamples:[{signature:sig,slot:110}]});
 assert.equal(noExpected.counts.incomplete,1);
 assert.equal(bindLocalReadReportSamples({...args,receiptSamples:[{...sample,slot:100}]}).status,"REVIEW_REQUIRED");
});
