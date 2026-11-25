import test from "node:test";
import assert from "node:assert/strict";
import {extractTransactionBalanceDeltas} from "../src/adapters/pump/transaction-reconciler.mjs";
const row=(amount,owner="owner",extra={})=>({accountIndex:1,mint:"mint",owner,uiTokenAmount:{amount,decimals:6},...extra});
const fixture=()=>({transaction:{message:{accountKeys:["owner","account"]}},meta:{fee:5000,preBalances:[10000,0],postBalances:[5000,0],preTokenBalances:[row("18446744073709551615")],postTokenBalances:[row("18446744073709551614")]}});
test("historical token differences use exact integers and count distinct accounts",()=>{
 const d=extractTransactionBalanceDeltas(fixture());assert.equal(d.tokens[0].delta_base_units,"-1");assert.equal(d.tokens[0].account_count,1);assert.equal(d.balance_evidence_status,"RECORDED_DELTAS");
});
test("unavailable arrays never generate artificial zero balances",()=>{
 const t=fixture();delete t.meta.preBalances;delete t.meta.postTokenBalances;delete t.meta.fee;
 const d=extractTransactionBalanceDeltas(t);assert.deepEqual(d.lamports,[]);assert.deepEqual(d.tokens,[]);assert.deepEqual(d.token_accounts,[]);assert.equal(d.fee_lamports,null);assert.equal(d.balance_evidence_status,"PARTIAL");
});
test("unsafe native balance is withheld rather than rounded",()=>{
 const t=fixture();t.meta.preBalances[0]=Number.MAX_SAFE_INTEGER+1;
 const d=extractTransactionBalanceDeltas(t);assert.equal(d.lamports.find(x=>x.address==="owner"),undefined);assert.ok(d.balance_evidence_issues.includes("NATIVE_BALANCE_UNKNOWN"));
});
test("missing token owner never becomes the token account address",()=>{
 const t=fixture();delete t.meta.preTokenBalances[0].owner;
 const d=extractTransactionBalanceDeltas(t);assert.deepEqual(d.tokens,[]);assert.equal(d.token_accounts[0].owner,null);assert.equal(d.token_accounts[0].delta_base_units,"-1");
});
test("duplicate token observations and changed mint cannot generate false deltas",()=>{
 const a=fixture();a.meta.preTokenBalances.push(row("1"));assert.deepEqual(extractTransactionBalanceDeltas(a).token_accounts,[]);
 const b=fixture();b.meta.postTokenBalances[0].mint="other";const d=extractTransactionBalanceDeltas(b);assert.deepEqual(d.tokens,[]);assert.deepEqual(d.token_accounts,[]);assert.ok(d.balance_evidence_issues.includes("TOKEN_ACCOUNT_IDENTITY_CHANGED"));
});
test("owner reassignment is accounted on each recorded side without inventing an owner",()=>{
 const t=fixture();t.meta.postTokenBalances[0].owner="other";
 const d=extractTransactionBalanceDeltas(t);assert.equal(d.token_accounts[0].owner,null);assert.equal(d.tokens.find(x=>x.owner==="owner").post_amount_base_units,"0");assert.equal(d.tokens.find(x=>x.owner==="other").pre_amount_base_units,"0");
});

test("transaction-wide native conservation matches recorded network fee without attributing project expenses",()=>{
 const t=fixture();t.meta.preBalances=[20000,1000];t.meta.postBalances=[13000,3000];
 const a=extractTransactionBalanceDeltas(t).native_fee_audit;
 assert.equal(a.status,"RECORDED_FEE_MATCH");assert.equal(a.observed_native_delta_lamports,"-5000");
 assert.equal(a.residual_lamports,"0");assert.equal(a.economic_attribution,"UNKNOWN");
});
test("native fee residual uses exact integers above safe number precision",()=>{
 const t=fixture();t.meta.preBalances=["9007199254740999","1"];t.meta.postBalances=["9007199254735999","2"];
 const a=extractTransactionBalanceDeltas(t).native_fee_audit;
 assert.equal(a.status,"REVIEW_REQUIRED");assert.equal(a.residual_lamports,"1");
});
test("missing fee, incomplete balances or duplicate addresses cannot certify native conservation",()=>{
 for(const change of [t=>delete t.meta.fee,t=>t.meta.postBalances.pop(),t=>t.transaction.message.accountKeys[1]="owner",t=>t.meta.preBalances[0]=Number.MAX_SAFE_INTEGER+1]){
  const t=fixture();change(t);const a=extractTransactionBalanceDeltas(t).native_fee_audit;
  assert.equal(a.status,"UNKNOWN");assert.equal(a.residual_lamports,null);
 }
});
test("R3 reported network fee amounts match synthetic native balance pairs independently",()=>{
 for(const fee of [10000,5000,5000,5000,5000,5000,5000]){
  const t=fixture();t.meta.fee=fee;t.meta.preBalances=[30000,1000];t.meta.postBalances=[28000-fee,3000];
  assert.equal(extractTransactionBalanceDeltas(t).native_fee_audit.residual_lamports,"0");
 }
});
