import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildProjectLifecycleReview} from "../src/inner-market/project-lifecycle-review.mjs";
const financial=()=>{const i=JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));i.sourceMode="ARCHIVED_HISTORICAL";i.scope.network="local_sim";i.projectIdentity={chainId:"solana",network:"local_sim",tokenMint:"synthetic-mint",quoteMint:"synthetic-quote"};return i;};
const PUMP="6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",AMM="pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
function event(kind,seq,payload={},signature="tx"+seq,phase="bonding_curve",slot=seq){
 const market={chain_id:"solana",network:"local_sim",token_mint:"synthetic-mint",quote_mint:"synthetic-quote",curve_program_id:PUMP,curve_account:"curve",market_phase:phase};
 return {event_id:kind+seq,event_kind:kind,provenance:"observed_chain",market,ordering:{slot,transaction_index:0,instruction_index:seq,event_sequence:seq,ordering_confidence:"complete"},source:{signature},payload:{...payload,signature},quality:{is_complete:true,validation_status:"valid"}};
}
const graduation=()=>({schema_version:"1.1.0",market:{chain_id:"solana",network:"local_sim",token_mint:"synthetic-mint",quote_mint:"synthetic-quote",curve_program_id:PUMP,curve_account:"curve"},bonding_curve_address:"curve",curve_replay_status:"REPLAYED_FULL_CURVE_HISTORY",current_account_reconciliation:{status:"PASS"},signature_coverage:{coverage_complete:true},data_gaps:[],events:[event("MARKET_CREATED",1),event("CURVE_COMPLETE",2),event("POOL_CREATED",3,{pool_program_id:AMM,pool_address:"pool",base_mint:"synthetic-mint",quote_mint:"synthetic-quote",base_amount_in_base_units:"400",quote_amount_in_base_units:"300"},"migration","post_graduation",3),event("CURVE_MIGRATED",4,{pool_address:"pool",mint:"synthetic-mint",quote_mint:"synthetic-quote",migrated_token_amount_base_units:"400",migrated_quote_amount_base_units:"300",pool_migration_fee_base_units:"10"},"migration","graduated",3)],pool_replays:[]});
test("lifecycle dossier correlates project identity, graduation, finance and Creator Fee subledger",()=>{
 const i=financial(),g=graduation(),r=buildProjectLifecycleReview({financialInput:i,graduationHistory:g});
 assert.equal(r.status,"PARTIAL");assert.equal(r.project_identity.cross_source_identity_status,"MATCHED");
 assert.equal(r.lifecycle.recorded_phase,"MIGRATION_LINK_RECORDED");assert.equal(r.lifecycle.milestones[0].status,"RECORDED");
 assert.equal(r.lifecycle.milestones.find(x=>x.id==="GRADUATION_MIGRATION").status,"LINKED");
 assert.equal(r.creator_fee_ledger.summary.verified_cash_income_base_units,"7");assert.equal(r.actual_settlement_allowed,false);
 assert.equal(r.pool_fee_buckets.length,0);assert.equal(r.execution_enabled,false);
});
test("token identity mismatch is rejected rather than silently combining two projects",()=>{
 const i=financial(),g=graduation();g.market.token_mint="other";for(const e of g.events)e.market.token_mint="other";
 assert.throws(()=>buildProjectLifecycleReview({financialInput:i,graduationHistory:g}),/PROJECT_TOKEN_MINT_MISMATCH|INVALID_HISTORY_SCOPE/);
});
test("network or quote mint identity contradictions require review",()=>{
 const i=financial();i.projectIdentity.quoteMint="wrong";
 const r=buildProjectLifecycleReview({financialInput:i,graduationHistory:graduation()});
 assert.equal(r.status,"REVIEW_REQUIRED");assert.ok(r.issues.includes("PROJECT_IDENTITY_MISMATCH"));
});
test("missing cross-source network and quote mint labels are explicitly partial",()=>{
 const i=financial();delete i.projectIdentity.network;delete i.projectIdentity.quoteMint;
 const r=buildProjectLifecycleReview({financialInput:i,graduationHistory:graduation()});
 assert.equal(r.project_identity.cross_source_identity_status,"PARTIAL");assert.ok(r.issues.includes("CROSS_SOURCE_IDENTITY_EVIDENCE_INCOMPLETE"));
});
