import {reviewGraduationHistory} from "./graduation-history-review.mjs";
import {buildProjectFinancialCloseReview} from "./project-financial-close-review.mjs";
import {buildCreatorFeeLedgerReport} from "./creator-fee-ledger-report.mjs";
const valid=v=>typeof v==="string"&&v.length>0&&v.length<=256&&v.trim()===v;
/** Cross-module project dossier. It correlates only explicit identity fields;
 * quote asset symbols are never assumed to equal mint addresses. */
export function buildProjectLifecycleReview({financialInput,graduationHistory}){
 if(!financialInput||!graduationHistory)throw Error("PROJECT_LIFECYCLE_INPUTS_REQUIRED");
 const s=financialInput.scope;
 if(!s||!["projectId","quoteAsset","tokenMint","openingCutoff","closingCutoff"].every(k=>valid(s[k])))throw Error("PROJECT_FINANCIAL_SCOPE_REQUIRED");
 const graduation=reviewGraduationHistory(graduationHistory);
 const explicit=financialInput.projectIdentity??{},market=financialInput.market?.candleEvidence?.market??{};
 const values=(...v)=>v.filter(x=>x!=null);
 const networkValues=values(s.network,explicit.network,market.network).map(v=>v==="localnet"?"local_sim":v);
 const quoteValues=values(explicit.quoteMint,explicit.quote_mint,market.quote_mint);
 const tokenValues=values(explicit.tokenMint,explicit.token_mint,market.token_mint);
 const chainValues=values(explicit.chainId,explicit.chain_id,market.chain_id);
 const checks=[];
 const compare=(id,actual,expected)=>{const status=actual.length===0?"UNKNOWN":actual.every(v=>valid(v)&&v===expected)?"PASS":"FAIL";checks.push({id,status,actual:actual.join(" | ")||null,expected});return status;};
 const tokenMatch=compare("TOKEN_MINT_MATCH",[s.tokenMint,...tokenValues],graduation.scope.token_mint);
 const networkMatch=compare("NETWORK_MATCH",networkValues,graduation.scope.network);
 const quoteMatch=compare("QUOTE_MINT_MATCH",quoteValues,graduation.scope.quote_mint);
 const chainMatch=compare("CHAIN_MATCH",chainValues,"solana");
 if(tokenMatch==="FAIL")throw Error("PROJECT_TOKEN_MINT_MISMATCH");
 const financial=buildProjectFinancialCloseReview(financialInput);
 const creatorFees=buildCreatorFeeLedgerReport({scope:s,creator:financialInput.creator,cash:financialInput.cash});
 const identityMismatch=[networkMatch,quoteMatch,chainMatch].includes("FAIL");
 const identityPartial=[networkMatch,quoteMatch,chainMatch].includes("UNKNOWN");
 const g=graduation.lifecycle;
 const milestones=[
  {id:"PROJECT_CREATED",status:g.creation?"RECORDED":"UNKNOWN",evidence:g.creation},
  {id:"CURVE_COMPLETED",status:g.completion?"RECORDED":"UNKNOWN",evidence:g.completion},
  {id:"GRADUATION_MIGRATION",status:g.migration?(g.transaction_link==="MATCHED_DECLARED_TRANSACTION"?"LINKED":"REVIEW_REQUIRED"):"NOT_RECORDED",evidence:g.migration},
  {id:"PUMPSWAP_POOL_CREATED",status:g.migration_pool_address?"RECORDED":"UNKNOWN",evidence:g.migration_pool_address?{pool_address:g.migration_pool_address,signature:g.migration?.signature??null,slot:g.migration?.slot??null}:null},
  {id:"PUMPSWAP_POOL_REPLAY",status:graduation.pools.some(p=>p.snapshot_status==="PASS"&&p.replay_status==="PASS")?"REPLAY_AND_SNAPSHOT_MATCHED":g.migration_pool_address?"INCOMPLETE":"UNKNOWN",evidence:null},
  ...graduation.pools.map(p=>({id:"PUMPSWAP_POOL:"+p.pool_address,status:p.snapshot_status==="PASS"&&p.replay_status==="PASS"?"REPLAY_AND_SNAPSHOT_MATCHED":p.snapshot_status==="FAIL"||p.replay_status==="FAIL"?"REVIEW_REQUIRED":"INCOMPLETE",evidence:p.creation})),
  {id:"FINANCIAL_CLOSE",status:financial.status==="SUPPLIED_ACCOUNTING_AND_ENDPOINTS_CONSISTENT"?"ACCOUNTING_AND_ENDPOINTS_CONSISTENT":financial.status==="ACCOUNTING_CONSISTENT_VALUATION_UNAVAILABLE"?"ACCOUNTING_ONLY":financial.status,evidence:null},
  {id:"CREATOR_FEE_LEDGER",status:creatorFees.status,evidence:null}
 ];
 const issues=[];
 if(identityMismatch)issues.push("PROJECT_IDENTITY_MISMATCH");
 if(identityPartial)issues.push("CROSS_SOURCE_IDENTITY_EVIDENCE_INCOMPLETE");
 if(graduation.status!=="INTERNAL_CHECKS_CONSISTENT")issues.push(...graduation.issues.map(x=>"GRADUATION:"+x.code));
 if(financial.status==="REVIEW_REQUIRED")issues.push(...financial.issues.map(x=>"FINANCIAL:"+x));
 if(creatorFees.status!=="RECONCILED")issues.push(...creatorFees.issues.map(x=>"CREATOR_FEE:"+x.code));
 const reviewRequired=identityMismatch||graduation.status==="REVIEW_REQUIRED"||financial.status==="REVIEW_REQUIRED"||creatorFees.status==="REVIEW_REQUIRED";
 const partial=!reviewRequired&&(identityPartial||graduation.status!=="INTERNAL_CHECKS_CONSISTENT"||financial.status!=="SUPPLIED_ACCOUNTING_AND_ENDPOINTS_CONSISTENT"||creatorFees.status!=="RECONCILED");
 const status=reviewRequired?"REVIEW_REQUIRED":partial?"PARTIAL":"INTERNAL_CHECKS_CONSISTENT";
 const poolFeeBuckets=graduation.pools.filter(p=>p.metrics).map(p=>({pool_address:p.pool_address,creator_fee_bucket_base_units:p.metrics.creator_fee_bucket_base_units,accounting_treatment:"POOL_BUCKET_ONLY_NOT_CASH_RECEIPT"}));
 return {schema_version:"cook-project-lifecycle-review.1",status,
  project_identity:{project_id:s.projectId,token_mint:s.tokenMint,quote_asset:s.quoteAsset,network:graduation.scope.network,quote_mint:graduation.scope.quote_mint,opening_cutoff:s.openingCutoff,closing_cutoff:s.closingCutoff,cross_source_identity_status:identityMismatch?"MISMATCH":identityPartial?"PARTIAL":"MATCHED",identity_checks:checks},
  lifecycle:{recorded_phase:g.phase,milestones,pool_replay_record_count:graduation.pools.length,created_pool_address:g.migration_pool_address??null,linked_migration_pool:g.migration_pool_address??null},
  graduation,financial_close:financial,creator_fee_ledger:creatorFees,pool_fee_buckets:poolFeeBuckets,
  completeness:{checks:milestones.length+checks.length,passed:milestones.filter(x=>["RECORDED","LINKED","REPLAY_AND_SNAPSHOT_MATCHED","ACCOUNTING_AND_ENDPOINTS_CONSISTENT","RECONCILED"].includes(x.status)).length+checks.filter(x=>x.status==="PASS").length,independent_source_verification:"UNKNOWN",wallet_ownership:"UNKNOWN",valuation_attestation:"UNKNOWN"},
  issues:[...new Set(issues)],source_attestation:"UNKNOWN",ownership_attestation:"UNKNOWN",valuation_attestation:"UNKNOWN",actual_settlement_allowed:false,execution_enabled:false,
  notes:["A project dossier correlates explicit token, network and mint identity; quote asset symbol and quote mint remain separate.","A PumpSwap creator-fee bucket is not evidence of creator wallet receipt.","Historical financial consistency is not independent source, ownership or valuation attestation.","No launch, swap, withdrawal, liquidation or settlement action is performed."]};
}

/** Portable archive containing original inputs and a derived snapshot.
 * Restore always recomputes from raw inputs and ignores the cached review. */
export function createProjectLifecycleArchiveBundle({financialInput,graduationHistory,metadata=null}){
 const review=buildProjectLifecycleReview({financialInput,graduationHistory});
 return {schema_version:"cook-project-lifecycle-archive.1",metadata:metadata==null?null:structuredClone(metadata),
  financial_input:structuredClone(financialInput),graduation_history:structuredClone(graduationHistory),
  derived_review:structuredClone(review),execution_enabled:false};
}
export function restoreProjectLifecycleArchiveBundle(bundle){
 if(bundle?.schema_version!=="cook-project-lifecycle-archive.1"||!bundle.financial_input||!bundle.graduation_history)throw Error("INVALID_PROJECT_LIFECYCLE_ARCHIVE");
 const financialInput=structuredClone(bundle.financial_input),graduationHistory=structuredClone(bundle.graduation_history);
 const review=buildProjectLifecycleReview({financialInput,graduationHistory});
 return {financialInput,graduationHistory,metadata:bundle.metadata==null?null:structuredClone(bundle.metadata),review,
  restore_status:"RECOMPUTED_FROM_RAW_INPUTS",cached_review_ignored:bundle.derived_review!=null,execution_enabled:false};
}
