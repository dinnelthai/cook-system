import test from "node:test";
import assert from "node:assert/strict";
import {reconcilePumpSwapPoolSnapshot,replayPumpSwapPoolEvents} from "../src/core/pool-state.mjs";
const state={pool_address:"pool",market:{token_mint:"mint",quote_mint:"quote"},pool_base_reserves_base_units:"100",pool_quote_reserves_base_units:"200",virtual_quote_reserves_base_units:"0",protocol_fees_base_units:"0",creator_fees_base_units:"0",boost_reserves_base_units:"0",liquidity_add_count:0};
const snapshot=()=>({replayedState:state,decodedPool:{context_slot:20,data:{virtual_quote_reserves_base_units:"0",protocol_fees_base_units:"0",creator_fees_base_units:"0"}},baseVault:{context_slot:20,amount_base_units:"100"},quoteVault:{context_slot:20,amount_base_units:"200"}});
test("historical snapshot comparison exposes same-slot evidence",()=>{
 const r=reconcilePumpSwapPoolSnapshot(snapshot());assert.equal(r.status,"PASS");assert.equal(r.snapshot_slot_status,"SAME_REPORTED_SLOT");assert.equal(r.snapshot_slot,20);
});
test("different snapshot slots cannot be treated as one observation",()=>{
 const s=snapshot();s.quoteVault.context_slot=21;const r=reconcilePumpSwapPoolSnapshot(s);
 assert.equal(r.status,"UNKNOWN");assert.equal(r.snapshot_slot_status,"NOT_COMPARABLE");assert.equal(r.snapshot_slot,null);assert.equal(r.effective_quote_reserves_base_units,null);
});
test("missing snapshot amount never becomes zero",()=>{
 const s=snapshot();delete s.quoteVault.amount_base_units;
 const r=reconcilePumpSwapPoolSnapshot(s);assert.equal(r.status,"UNKNOWN");assert.equal(r.effective_quote_reserves_base_units,null);
});
test("legacy value comparison does not attest slot consistency",()=>{
 const s=snapshot();delete s.baseVault.context_slot;const r=reconcilePumpSwapPoolSnapshot(s);assert.equal(r.status,"PASS");assert.equal(r.snapshot_slot_status,"UNKNOWN");assert.equal(r.snapshot_slot,null);
});
function event(i,delta){return {event_id:"e"+i,event_kind:"POOL_LIQUIDITY_ADDED",market:state.market,provenance:"observed_chain",event_time_ms:1000,ordering:{slot:10,transaction_index:0,instruction_index:i,event_sequence:0,ordering_confidence:"complete"},source:{signature:"receipt"},payload:{pool_address:"pool",pool_vault_deltas:delta}};}
test("conflicting recorded transaction deltas do not silently apply the first annotation",()=>{
 const a={base_delta_base_units:"1",quote_delta_base_units:"2"},b={...a,quote_delta_base_units:"3"};
 const r=replayPumpSwapPoolEvents(state,[event(0,a),event(1,b)]);assert.equal(r.status,"FAIL");assert.equal(r.state.pool_quote_reserves_base_units,"200");assert.ok(r.reconciliations.some(x=>x.reason==="conflicting_transaction_vault_delta_evidence"));
});
test("missing vault delta field remains partial",()=>{
 const r=replayPumpSwapPoolEvents(state,[event(0,{base_delta_base_units:"1"})]);assert.equal(r.status,"PARTIAL");assert.equal(r.state.pool_base_reserves_base_units,"100");
});
