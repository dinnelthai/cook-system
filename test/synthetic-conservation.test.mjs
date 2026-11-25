import test from "node:test";
import assert from "node:assert/strict";
import {auditSyntheticConservation} from "../src/simulation/synthetic-conservation.mjs";
const fixture=()=>({openingTotals:{quote:"9007199254740995",token:"100"},finalState:{quote_reserves_base_units:"9007199254740993",token_reserves_base_units:"70"},agentStates:[{agent_id:"a",quote_balance_base_units:"2",token_balance_base_units:"30"}]});
test("aggregate conservation uses exact integer arithmetic",()=>{assert.equal(auditSyntheticConservation(fixture()).status,"BALANCED");});
test("single unit imbalance is detected above safe integer precision",()=>{
 const i=fixture();i.agentStates[0].quote_balance_base_units="3";i.agentStates[0].token_balance_base_units="29";
 const r=auditSyntheticConservation(i);assert.equal(r.status,"REVIEW_REQUIRED");assert.equal(r.quote_difference_base_units,"1");assert.equal(r.token_difference_base_units,"-1");
});
test("duplicate identities cannot inflate synthetic totals",()=>{
 const i=fixture();i.agentStates.push({...i.agentStates[0]});
 assert.throws(()=>auditSyntheticConservation(i),/INVALID_SYNTHETIC_AGENT_ID/);
});
test("negative and missing balances are rejected rather than assumed zero",()=>{
 for(const v of ["-1",null,undefined,1]){const i=fixture();i.agentStates[0].token_balance_base_units=v;assert.throws(()=>auditSyntheticConservation(i),/INVALID_SYNTHETIC_BALANCE/);}
});
