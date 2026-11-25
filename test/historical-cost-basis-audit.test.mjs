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

test("duplicate market event identities cannot silently select the last record",()=>{
 const i=input([buy("a","10","20")],undefined,{tokens:"10",costBasis:"20"});
 i.market.trades.push({...i.market.trades[0]});
 assert.deepEqual(auditHistoricalCostBasis(i).issues,["COST_BASIS_MARKET_EVENT_ID_INVALID_OR_DUPLICATE"]);
});
test("duplicate journal entries cannot inflate a matching historical endpoint",()=>{
 const i=input([buy("a","10","20")],undefined,{tokens:"20",costBasis:"40"});
 i.inventory.ledger.position_journal.push({...i.inventory.ledger.position_journal[0]});
 assert.deepEqual(auditHistoricalCostBasis(i).issues,["COST_BASIS_JOURNAL_EVENT_ID_INVALID_OR_DUPLICATE"]);
});
test("same trade sequence cannot be resolved by arbitrary input order",()=>{
 const i=input([buy("a","10","20"),sell("b","10","20")]);i.market.trades[1].sequence=0;
 assert.deepEqual(auditHistoricalCostBasis(i).issues,["COST_BASIS_AMBIGUOUS_TRADE_ORDER"]);
});
test("unknown journal side is not treated as a disposal",()=>{
 const i=input([{...sell("a","1","1"),side:"OTHER"}],{tokens:"1",costBasis:"1"});
 assert.deepEqual(auditHistoricalCostBasis(i).issues,["COST_BASIS_JOURNAL_SIDE_INVALID"]);
});
test("zero token quantity cannot add cost to a historical position",()=>{
 const i=input([buy("a","0","20")],{tokens:"10",costBasis:"10"},{tokens:"10",costBasis:"30"});
 assert.deepEqual(auditHistoricalCostBasis(i).issues,["COST_BASIS_ZERO_TRADE_QUANTITY:a"]);
});
test("intermediate quantity and cost must remain inside supported integer range",()=>{
 const max=((1n<<128n)-1n).toString();
 const i=input([buy("a","1","1"),sell("b","1","1")],{tokens:max,costBasis:max},{tokens:max,costBasis:max});
 assert.ok(auditHistoricalCostBasis(i).issues.includes("COST_BASIS_INTERMEDIATE_RANGE_EXCEEDED:a"));
});

test("missing cost endpoint cannot conceal contradictory other endpoint",()=>{
 const openingUnknown=input([],{tokens:"0",costBasis:null},{tokens:"0",costBasis:"1"});
 const closingUnknown=input([],{tokens:"0",costBasis:"1"},{tokens:"0",costBasis:null});
 assert.deepEqual(auditHistoricalCostBasis(openingUnknown).issues,["COST_BASIS_WITHOUT_CLOSING_INVENTORY"]);
 assert.deepEqual(auditHistoricalCostBasis(closingUnknown).issues,["COST_BASIS_WITHOUT_OPENING_INVENTORY"]);
 assert.equal(auditHistoricalCostBasis(openingUnknown).status,"REVIEW_REQUIRED");
 assert.equal(auditHistoricalCostBasis(closingUnknown).status,"REVIEW_REQUIRED");
 assert.equal(auditHistoricalCostBasis(input([],{tokens:"0",costBasis:null},{tokens:"0",costBasis:"0"})).status,"PARTIAL");
});
