import test from "node:test";
import assert from "node:assert/strict";
import {auditHistoricalCostBasis} from "../src/inner-market/historical-cost-basis-audit.mjs";
const buy=(id,q,c)=>({event_id:id,side:"BUY",token_amount_base_units:q,cash_cost_quote_base_units:c});
const sell=(id,q,c)=>({event_id:id,side:"SELL",token_amount_base_units:q,allocated_cost_basis_quote_base_units:c});
const input=(journal,opening={tokens:"0",costBasis:"0"},closing={tokens:"0",costBasis:"0"})=>({inventory:{opening,closing,historyComplete:true,adjustments:[],ledger:{position_journal:journal}},market:{historyComplete:true,trades:journal.map((j,i)=>({id:j.event_id,side:j.side,sequence:i,status:"FINALIZED",reconciliation:"PASS"}))}});
test("negative intermediate cost basis is rejected even if later acquisitions offset it",()=>{
 const i=input([buy("a","10","20"),sell("b","5","30"),buy("c","5","10")],undefined,{tokens:"10",costBasis:"0"});
 const r=auditHistoricalCostBasis(i);
 assert.ok(r.issues.includes("COST_BASIS_NEGATIVE_INTERMEDIATE_BASIS:b"));
 assert.equal(r.status,"REVIEW_REQUIRED");
});
test("disposing all historical quantity cannot leave residual recorded cost",()=>{
 const i=input([buy("a","10","20"),sell("b","10","10"),buy("c","10","10")],undefined,{tokens:"10",costBasis:"20"});
 assert.ok(auditHistoricalCostBasis(i).issues.includes("COST_BASIS_RESIDUAL_WITHOUT_INVENTORY:b"));
});
test("zero opening inventory cannot carry positive cost",()=>{
 const i=input([],{tokens:"0",costBasis:"1"},{tokens:"0",costBasis:"1"});
 assert.ok(auditHistoricalCostBasis(i).issues.includes("COST_BASIS_WITHOUT_OPENING_INVENTORY"));
});
test("unknown adjustment ordering is partial rather than assumed",()=>{
 const i=input([buy("a","10","20")],undefined,{tokens:"10",costBasis:"20"});
 i.inventory.adjustments.push({kind:"EXTERNAL_IN"});
 const r=auditHistoricalCostBasis(i);
 assert.equal(r.status,"PARTIAL");assert.equal(r.checked_trade_count,0);
 assert.equal(r.cost_basis_attestation,"UNKNOWN");
});
test("fully disposed historical inventory and cost are internally consistent",()=>{
 const i=input([buy("a","10","20"),sell("b","10","20")]);
 assert.equal(auditHistoricalCostBasis(i).status,"INTERNALLY_CONSISTENT");
});
test("reported ending balance must match ordered ledger",()=>{
 const i=input([buy("a","10","20")],undefined,{tokens:"10",costBasis:"21"});
 assert.ok(auditHistoricalCostBasis(i).issues.includes("COST_BASIS_REPLAY_ENDPOINT_MISMATCH"));
});
