import test from "node:test";
import assert from "node:assert/strict";
import {auditSyntheticLedger} from "../src/simulation/synthetic-ledger-audit.mjs";
const account=(id,q,t)=>({scenario_id:"s",account_id:id,quote_base_units:q,token_base_units:t});
const entry=(id,a,q,t)=>({scenario_id:"s",entry_id:id,account_id:a,quote_delta_base_units:q,token_delta_base_units:t});
const input=()=>({sourceMode:"SYNTHETIC",scenarioId:"s",opening:[account("a","100","5"),account("b","100","5")],closing:[account("a","90","6"),account("b","110","4")],entries:[entry("x","a","-10","1"),entry("y","b","10","-1")]});
test("closed synthetic ledger independently reconciles each recorded account",()=>{
 const i=input(),copy=structuredClone(i),r=auditSyntheticLedger(i);
 assert.equal(r.status,"INTERNALLY_CONSISTENT");assert.equal(r.net_quote_delta_base_units,"0");
 assert.ok(r.accounts.every(a=>a.quote_difference_base_units==="0"&&a.token_difference_base_units==="0"));assert.deepEqual(i,copy);
});
test("offsetting account errors cannot hide behind aggregate conservation",()=>{
 const i=input();i.closing[0].quote_base_units="91";i.closing[1].quote_base_units="109";
 const r=auditSyntheticLedger(i);assert.equal(r.status,"REVIEW_REQUIRED");assert.equal(r.net_quote_delta_base_units,"0");
 assert.equal(r.accounts[0].quote_difference_base_units,"1");assert.equal(r.accounts[1].quote_difference_base_units,"-1");
});
test("missing closing accounts and unbalanced postings require review",()=>{
 const i=input();i.closing.pop();i.entries.pop();
 const r=auditSyntheticLedger(i);assert.ok(r.issues.includes("CLOSING_ACCOUNT_MISSING:b"));assert.ok(r.issues.includes("CLOSED_LEDGER_NET_MOVEMENT_NONZERO"));
});
test("cross-scenario records, duplicate entries and malformed amounts cannot be merged",()=>{
 for(const change of [i=>i.entries[0].scenario_id="other",i=>i.entries.push({...i.entries[0]}),i=>i.opening[0].quote_base_units="-1",i=>i.sourceMode="ARCHIVED_HISTORICAL"]){
  const i=input();change(i);assert.throws(()=>auditSyntheticLedger(i));
 }
});

test("endpoint equality does not hide negative intermediate balance in supplied posting order",()=>{
 const i=input();i.entries=[entry("x","a","-110","1"),entry("y","b","110","-1"),entry("z","a","100","0"),entry("w","b","-100","0")];
 const r=auditSyntheticLedger(i);assert.equal(r.status,"INTERNALLY_CONSISTENT");
 assert.equal(r.process_check.status,"REVIEW_REQUIRED");
 assert.deepEqual(r.process_check.issues,["NEGATIVE_INTERMEDIATE_BALANCE:a"]);
});
