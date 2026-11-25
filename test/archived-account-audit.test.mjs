import test from "node:test";
import assert from "node:assert/strict";
import {auditArchivedAccountInterval,normalizeArchivedReceipt,reviewUncertainLocalReceipt} from "../src/inner-market/archived-account-audit.mjs";
const g="local-fixture",wallet="wallet",tokenAccount="token-account",mint="mint";
const scope={mode:"READ_ONLY",network:"localnet",genesisHash:g,wallet,tokenAccount,mint,openingSlot:10,closingSlot:20};
const snapshot=(slot,lamports,tokenAmount)=>({slot,genesisHash:g,wallet,tokenAccount,mint,lamports,tokenAmount});
const row=(n)=>({accountIndex:1,mint,owner:wallet,uiTokenAmount:{amount:String(n),decimals:6}});
function receipt(signature,slot,pre,post,preToken,postToken,failed=false){
 return {signature,genesisHash:g,finality:"FINALIZED",transactionIndex:0,transaction:{slot,transaction:{signatures:[signature],message:{accountKeys:[wallet,tokenAccount,"other"]}},meta:{err:failed?{InstructionError:[0,"Custom"]}:null,fee:5,preBalances:pre,postBalances:post,preTokenBalances:[row(preToken)],postTokenBalances:[row(postToken)]}}};
}
const fixture=()=>({scope,opening:snapshot(10,"1000","100"),closing:snapshot(20,"890","110"),historyComplete:true,receipts:[
 receipt("b",12,[895,10,200], [890,10,200],110,110,true),
 receipt("a",11,[1000,10,100],[895,10,200],100,110)
]});
test("replay archived balances in slot order and include failed transaction fees",()=>{
 const r=auditArchivedAccountInterval(fixture());
 assert.equal(r.status,"INTERNALLY_CONSISTENT");assert.equal(r.native.difference_lamports,"0");assert.equal(r.token.difference_base_units,"0");
 assert.equal(r.observed_network_fees_lamports,"10");assert.equal(r.observed_failed_tx_fees_lamports,"5");
 assert.equal(r.source_attestation,"UNKNOWN");assert.equal(r.settlement_allowed,false);assert.equal(r.execution_enabled,false);
});
test("detect receipt gaps, closing mismatch, and incomplete history",()=>{
 const i=fixture();i.receipts.pop();i.historyComplete=false;
 const codes=auditArchivedAccountInterval(i).issues.map(x=>x.code);
 assert.ok(codes.includes("NATIVE_CONTINUITY_MISMATCH"));assert.ok(codes.includes("TOKEN_CONTINUITY_MISMATCH"));assert.ok(codes.includes("CLOSING_NATIVE_MISMATCH"));assert.ok(codes.includes("HISTORY_INCOMPLETE"));
});
test("reject mismatched scope, duplicate signatures, unsafe numbers and missing metadata",()=>{
 for(const mutate of [
  i=>i.scope={...i.scope,network:"mainnet"},
  i=>i.receipts[0].genesisHash="other",
  i=>i.receipts.push(i.receipts[0]),
  i=>i.receipts[0].transaction.meta.preBalances[0]=Number.MAX_SAFE_INTEGER+1,
  i=>delete i.receipts[0].transaction.meta.err,
  i=>i.receipts[0].transaction.meta.postBalances.pop(),
  i=>i.receipts[0].finality="CONFIRMED",
  i=>i.receipts[0].transaction.meta.preTokenBalances=[],
  i=>i.receipts[0].transaction.meta.postTokenBalances[0].owner="other"
 ]){const i=fixture();mutate(i);assert.throws(()=>auditArchivedAccountInterval(i));}
});
test("failed transaction with inconsistent changes requires review",()=>{
 const i=fixture();i.receipts[0].transaction.meta.postTokenBalances=[row(111)];
 const codes=auditArchivedAccountInterval(i).issues.map(x=>x.code);
 assert.ok(codes.includes("FAILED_RECEIPT_UNEXPECTED_DELTA"));
});
test("supports explicitly loaded account keys and new token accounts",()=>{
 const r=receipt("c",13,[100,0,100],[85,10,100],0,1);
 r.transaction.transaction.message.accountKeys=[wallet,"other"];
 r.transaction.transaction.message.addressTableLookups=[{}];
 r.transaction.meta.loadedAddresses={writable:[tokenAccount],readonly:[]};
 r.transaction.meta.preBalances=[100,100,0];r.transaction.meta.postBalances=[85,100,10];
 r.transaction.meta.preTokenBalances=[];r.transaction.meta.postTokenBalances=[{...row(1),accountIndex:2}];
 assert.equal(normalizeArchivedReceipt(r,g).tokens[0].before,0n);
});

test("local read-only archive audit accepts the existing local_sim label without changing evidence scope",()=>{
 const i=fixture();i.scope={...i.scope,network:"local_sim"};
 const r=auditArchivedAccountInterval(i);
 assert.equal(r.status,"INTERNALLY_CONSISTENT");
 assert.equal(r.source_attestation,"UNKNOWN");assert.equal(r.execution_enabled,false);
 assert.equal(i.scope.network,"local_sim");
 i.scope={...i.scope,mode:"EXECUTION"};
 assert.throws(()=>auditArchivedAccountInterval(i),/LOCALNET_READ_ONLY_REQUIRED/);
});

test("uncertain local receipts remain unknown without archived evidence or identity",()=>{
 for(const [signature,receipt,code] of [[null,null,"SIGNATURE_UNAVAILABLE"],["a",null,"RECEIPT_NOT_OBSERVED"],["a",{...fixture().receipts[1],finality:"CONFIRMED"},"RECEIPT_NOT_FINALIZED"]]){
  const r=reviewUncertainLocalReceipt({scope,signature,receipt});
  assert.equal(r.status,"UNKNOWN");assert.ok(r.issues.includes(code));assert.equal(r.retry_authorized,false);
  assert.equal(r.execution_enabled,false);assert.equal(r.recorded_fee_lamports,null);
 }
});
test("archived outcome review separates fee evidence and contradictions from retry authority",()=>{
 const i=fixture();
 const r=reviewUncertainLocalReceipt({scope,signature:"b",receipt:i.receipts[0]});
 assert.equal(r.status,"RECORDED_RECEIPT_CONSISTENT");assert.equal(r.recorded_outcome,"FAILED");
 assert.equal(r.recorded_fee_lamports,"5");assert.equal(r.source_attestation,"UNKNOWN");assert.equal(r.retry_authorized,false);
 const bad=structuredClone(i.receipts[0]);bad.transaction.meta.postBalances[0]+=1;
 assert.equal(reviewUncertainLocalReceipt({scope,signature:"b",receipt:bad}).status,"REVIEW_REQUIRED");
 assert.equal(reviewUncertainLocalReceipt({scope,signature:"a",receipt:i.receipts[0]}).status,"REVIEW_REQUIRED");
 bad.transaction.meta.err=false;
 assert.throws(()=>normalizeArchivedReceipt(bad,g),/INVALID_RECEIPT_OUTCOME/);
});
