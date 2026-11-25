import test from "node:test";
import assert from "node:assert/strict";
import {reviewGraduationHistory} from "../src/inner-market/graduation-history-review.mjs";
const PUMP="6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",AMM="pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
const market={chain_id:"solana",network:"local_sim",token_mint:"token",quote_mint:"SOL",curve_program_id:PUMP,curve_account:"curve",market_phase:"bonding_curve"};
function event(kind,seq,payload={},signature="tx"+seq,phase="bonding_curve",slot=seq){
 return {event_id:kind+seq,event_kind:kind,provenance:"observed_chain",market:{...market,market_phase:phase},ordering:{slot,transaction_index:0,instruction_index:seq,event_sequence:seq,ordering_confidence:"complete"},source:{signature},payload:{...payload,signature},quality:{is_complete:true,validation_status:"valid"}};
}
const fixture=()=>({schema_version:"1.1.0",market,bonding_curve_address:"curve",curve_replay_status:"REPLAYED_FULL_CURVE_HISTORY",current_account_reconciliation:{status:"PASS"},signature_coverage:{coverage_complete:true},data_gaps:[],events:[
 event("MARKET_CREATED",1),
 event("CURVE_COMPLETE",2),
 event("POOL_CREATED",3,{pool_program_id:AMM,pool_address:"pool",base_mint:"token",quote_mint:"SOL",base_amount_in_base_units:"400",quote_amount_in_base_units:"300",pool_base_reserves_base_units:"1000",pool_quote_reserves_base_units:"500"},"migration","post_graduation",3),
 event("CURVE_MIGRATED",4,{pool_address:"pool",mint:"token",quote_mint:"SOL",migrated_token_amount_base_units:"400",migrated_quote_amount_base_units:"300",pool_migration_fee_base_units:"10"},"migration","graduated",3),
 ],pool_replays:[{pool_address:"pool",signature_coverage:{coverage_complete:true},data_gaps:[],unresolved_events:[],initialization_evidence:[],replay_status:"REPLAYED_FULL_POOL_HISTORY",current_snapshot:{errors:[],decoded_pool:{account_address:"pool",account_owner:AMM,context_slot:5,data:{base_mint:"token",quote_mint:"SOL",virtual_quote_reserves_base_units:"0",protocol_fees_base_units:"0",creator_fees_base_units:"0",lp_supply_base_units:"100"}},base_vault:{mint:"token",token_authority:"pool",amount_base_units:"1000",context_slot:5},quote_vault:{mint:"SOL",token_authority:"pool",amount_base_units:"500",context_slot:5}}}]});
test("archived graduation matches declared transaction and recomputes pool snapshot; no attestation or settlement",()=>{
 const r=reviewGraduationHistory(fixture());
 assert.equal(r.status,"INTERNAL_CHECKS_CONSISTENT");
 assert.equal(r.lifecycle.transaction_link,"MATCHED_DECLARED_TRANSACTION");
 assert.equal(r.lifecycle.declared_amounts.declared_input_comparison,"MATCH");
 assert.equal(r.lifecycle.declared_amounts.migration_fee_base_units,"10");
 assert.equal(r.pools[0].snapshot_status,"PASS");
 assert.equal(r.pools[0].metrics.quote_vault_base_units,"500");
 assert.equal(r.pools[0].metrics.creator_fee_cash_received,"UNKNOWN");
 assert.equal(r.pools[0].metrics.lp_ownership,"UNKNOWN");
 assert.equal(r.source_attestation,"UNKNOWN");assert.equal(r.execution_enabled,false);assert.equal(r.settlement_allowed,false);
});
test("scope, chronology, duplicate identities and forged reported replay state cannot bypass checks",()=>{
 const f=fixture();f.events[0].market={...f.events[0].market,network:"mainnet"};assert.throws(()=>reviewGraduationHistory(f),/MIXED_GRADUATION_SCOPE/);
 const g=fixture();g.events[3].ordering={...g.events[3].ordering,slot:1,transaction_index:1};assert.equal(reviewGraduationHistory(g).status,"REVIEW_REQUIRED");
 const h=fixture();h.pool_replays.push(structuredClone(h.pool_replays[0]));assert.throws(()=>reviewGraduationHistory(h),/INVALID_OR_DUPLICATE_POOL_RECORD/);
 const i=fixture();i.pool_replays[0].replay={state:{pool_quote_reserves_base_units:"999"}};assert.equal(reviewGraduationHistory(i).pools[0].metrics.quote_vault_base_units,"500");
});
test("different transaction and missing completion never imply verified migration",()=>{
 const f=fixture();f.events[3].source.signature="different";f.events[3].payload.signature="different";
 const r=reviewGraduationHistory(f);assert.equal(r.lifecycle.transaction_link,"UNKNOWN");assert.equal(r.status,"PARTIAL");
 const g=fixture();g.events=g.events.filter(e=>e.event_kind!=="CURVE_COMPLETE");assert.equal(reviewGraduationHistory(g).status,"PARTIAL");
 const h=fixture();h.events=h.events.filter(e=>e.event_kind!=="POOL_CREATED");assert.equal(reviewGraduationHistory(h).pools[0].metrics,null);
});
test("reserve mismatch, wrong identity, incomplete coverage or different snapshot slots withhold pool metrics",()=>{
 for(const edit of [
  f=>{f.pool_replays[0].current_snapshot.quote_vault.amount_base_units="999"},
  f=>{f.pool_replays[0].current_snapshot.quote_vault.mint="other"},
  f=>{f.pool_replays[0].current_snapshot.quote_vault.context_slot=6},
  f=>{f.pool_replays[0].initialization_evidence.push({status:"UNKNOWN"})},
  f=>{f.pool_replays[0].signature_coverage.coverage_complete=false}
 ]){const f=fixture();edit(f);const r=reviewGraduationHistory(f);assert.notEqual(r.status,"INTERNAL_CHECKS_CONSISTENT");assert.equal(r.pools[0].metrics,null);}
});
test("declared migration inputs and reserves are different concepts",()=>{
 const f=fixture();f.events[3].payload.migrated_quote_amount_base_units="301";
 const r=reviewGraduationHistory(f);assert.equal(r.lifecycle.declared_amounts.declared_input_comparison,"DIFFERENT_REQUIRES_EXPLANATION");assert.equal(r.status,"PARTIAL");
});
