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
const graduation=()=>({schema_version:"1.1.0",market:{chain_id:"solana",network:"local_sim",token_mint:"synthetic-mint",quote_mint:"synthetic-quote",curve_program_id:PUMP,curve_account:"curve"},bonding_curve_address:"curve",curve_replay_status:"REPLAYED_FULL_CURVE_HISTORY",current_account_reconciliation:{status:"PASS"},signature_coverage:{coverage_complete:true},data_gaps:[],events:[event("MARKET_CREATED",1),event("CURVE_COMPLETE",2),event("POOL_CREATED",3,{pool_program_id:AMM,pool_address:"pool",base_mint:"synthetic-mint",quote_mint:"synthetic-quote",base_amount_in_base_units:"400",quote_amount_in_base_units:"300",pool_base_reserves_base_units:"1000",pool_quote_reserves_base_units:"500"},"migration","post_graduation",3),event("CURVE_MIGRATED",4,{pool_address:"pool",mint:"synthetic-mint",quote_mint:"synthetic-quote",migrated_token_amount_base_units:"400",migrated_quote_amount_base_units:"300",pool_migration_fee_base_units:"10"},"migration","graduated",3)],pool_replays:[]});
test("lifecycle dossier correlates project identity, graduation, finance and Creator Fee subledger",()=>{
 const i=financial(),g=graduation(),r=buildProjectLifecycleReview({financialInput:i,graduationHistory:g});
 assert.equal(r.status,"PARTIAL");assert.equal(r.project_identity.cross_source_identity_status,"MATCHED");
 assert.equal(r.lifecycle.recorded_phase,"MIGRATION_LINK_RECORDED");assert.equal(r.lifecycle.milestones[0].status,"RECORDED");
 assert.equal(r.lifecycle.milestones.find(x=>x.id==="GRADUATION_MIGRATION").status,"LINKED");
 assert.equal(r.lifecycle.milestones.find(x=>x.id==="PUMPSWAP_POOL_CREATED").status,"RECORDED");
 assert.equal(r.lifecycle.milestones.find(x=>x.id==="PUMPSWAP_POOL_REPLAY").status,"INCOMPLETE");
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

function addPoolReplay(g){
 g.events.push(event("POOL_BUY_EXECUTED",5,{pool_address:"pool",base_mint:"synthetic-mint",quote_mint:"synthetic-quote",token_amount_base_units:"1",quote_amount_base_units:"1",pool_reserves_before:{pool_base_reserves_base_units:"1000",pool_quote_reserves_base_units:"500"},pool_vault_deltas:{base_delta_base_units:"-1",quote_delta_base_units:"1",source_signature:"swap"},fee_balances_delta:{protocol_fees_base_units:"0",creator_fees_base_units:"7"},virtual_quote_reserves_reported_base_units:"0",transaction_balance_reconciliation:{status:"PASS"}},"swap","post_graduation",4));
 g.events.at(-1).quality.transaction_balance_reconciliation={status:"PASS"};
 g.pool_replays=[{pool_address:"pool",signature_coverage:{coverage_complete:true},data_gaps:[],unresolved_events:[],initialization_evidence:[],replay_status:"REPLAYED_FULL_POOL_HISTORY",current_snapshot:{errors:[],decoded_pool:{account_address:"pool",account_owner:AMM,context_slot:5,data:{base_mint:"synthetic-mint",quote_mint:"synthetic-quote",virtual_quote_reserves_base_units:"0",protocol_fees_base_units:"0",creator_fees_base_units:"7",lp_supply_base_units:"100"}},base_vault:{mint:"synthetic-mint",token_authority:"pool",amount_base_units:"999",context_slot:5},quote_vault:{mint:"synthetic-quote",token_authority:"pool",amount_base_units:"501",context_slot:5}}}];
 return g;
}
function addEndpoints(i){
 i.nav.endpointEvidence={schema_version:"cook-nav-endpoints.1",scope:{...i.scope},
 opening:{cutoff:i.scope.openingCutoff,sequence:0,cashBaseUnits:"1000",tokenAmountBaseUnits:"0",inventoryValueBaseUnits:"0",receivableBaseUnits:"0",liabilitiesBaseUnits:"0",otherAssetsBaseUnits:"0"},
 closing:{cutoff:i.scope.closingCutoff,sequence:3,cashBaseUnits:"887",tokenAmountBaseUnits:"50",inventoryValueBaseUnits:"90",receivableBaseUnits:"3",liabilitiesBaseUnits:"0",otherAssetsBaseUnits:"0"}};
 return i;
}
test("B09 end-to-end dossier reconciles curve graduation, PumpSwap replay, Creator Fee ledger and NAV without merging fee buckets",()=>{
 const i=addEndpoints(financial()),g=addPoolReplay(graduation()),r=buildProjectLifecycleReview({financialInput:i,graduationHistory:g});
 assert.equal(r.status,"INTERNAL_CHECKS_CONSISTENT");
 assert.equal(r.graduation.status,"INTERNAL_CHECKS_CONSISTENT");
 assert.equal(r.financial_close.status,"SUPPLIED_ACCOUNTING_AND_ENDPOINTS_CONSISTENT");
 assert.equal(r.creator_fee_ledger.status,"RECONCILED");
 assert.equal(r.lifecycle.milestones.find(x=>x.id==="PUMPSWAP_POOL_REPLAY").status,"REPLAY_AND_SNAPSHOT_MATCHED");
 assert.equal(r.pool_fee_buckets[0].creator_fee_bucket_base_units,"7");
 assert.equal(r.pool_fee_buckets[0].accounting_treatment,"POOL_BUCKET_ONLY_NOT_CASH_RECEIPT");
 assert.equal(r.creator_fee_ledger.summary.verified_cash_income_base_units,"7");
 assert.equal(r.financial_close.realized_pnl.creator_cash_income_base_units,"7");
 assert.equal(r.project_identity.cross_source_identity_status,"MATCHED");
 assert.equal(r.source_attestation,"UNKNOWN");assert.equal(r.actual_settlement_allowed,false);assert.equal(r.execution_enabled,false);
});
test("localnet accounting label maps only to the explicitly equivalent local_sim adapter network",()=>{
 const i=financial();i.scope.network="localnet";i.projectIdentity.network="localnet";
 const r=buildProjectLifecycleReview({financialInput:i,graduationHistory:graduation()});
 assert.equal(r.project_identity.identity_checks.find(x=>x.id==="NETWORK_MATCH").status,"PASS");
});

test("lifecycle archive preserves raw inputs and restore recomputes rather than trusting cached review",async()=>{
 const financialInput=financial(),graduationHistory=graduation();
 const {createProjectLifecycleArchiveBundle,restoreProjectLifecycleArchiveBundle}=await import("../src/inner-market/project-lifecycle-review.mjs");
 const bundle=createProjectLifecycleArchiveBundle({financialInput,graduationHistory,metadata:{label:"archive-test"}});
 assert.equal(bundle.schema_version,"cook-project-lifecycle-archive.1");assert.equal(bundle.execution_enabled,false);
 bundle.derived_review.status="INTERNAL_CHECKS_CONSISTENT";
 const restored=restoreProjectLifecycleArchiveBundle(bundle);
 assert.equal(restored.restore_status,"RECOMPUTED_FROM_RAW_INPUTS");assert.equal(restored.cached_review_ignored,true);
 assert.equal(restored.review.status,"PARTIAL");assert.equal(restored.metadata.label,"archive-test");
 assert.deepEqual(restored.financialInput,financialInput);assert.deepEqual(restored.graduationHistory,graduationHistory);
});
test("lifecycle archive rejects unsupported or incomplete bundles",async()=>{
 const {restoreProjectLifecycleArchiveBundle}=await import("../src/inner-market/project-lifecycle-review.mjs");
 assert.throws(()=>restoreProjectLifecycleArchiveBundle({schema_version:"wrong"}),/INVALID_PROJECT_LIFECYCLE_ARCHIVE/);
});
