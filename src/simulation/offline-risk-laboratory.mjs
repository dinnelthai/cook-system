import {reconcilePumpSwapPoolSnapshot} from "../core/pool-state.mjs";
import {runParticipantValidationSuite} from "./participant-validation-suite.mjs";
import {summarizeMathValidation} from "./math-validation-summary.mjs";

/** Fixed synthetic reserve observation faults. These are read-only accounting
 * comparisons, not LP position allocation, executable depth or trade scenarios. */
export function runPoolEvidenceStress(){
 const state={pool_base_reserves_base_units:"9007199254740993",pool_quote_reserves_base_units:"1000",
  virtual_quote_reserves_base_units:"-10",protocol_fees_base_units:"10",creator_fees_base_units:"0"};
 const fixture={replayedState:state,decodedPool:{context_slot:10,data:{virtual_quote_reserves_base_units:"-10",protocol_fees_base_units:"10",creator_fees_base_units:"0"}},
  baseVault:{context_slot:10,amount_base_units:"9007199254740993"},quoteVault:{context_slot:10,amount_base_units:"1000"}};
 const cases=[
  ["MATCHED_SNAPSHOT","PASS",x=>x],
  ["MISSING_VAULT","UNKNOWN",x=>{delete x.baseVault}],
  ["SLOT_MISMATCH","UNKNOWN",x=>{x.quoteVault.context_slot=11}],
  ["BASE_BALANCE_CONFLICT","FAIL",x=>{x.baseVault.amount_base_units="9007199254740992"}],
  ["FEE_BUCKET_CONFLICT","FAIL",x=>{x.decodedPool.data.creator_fees_base_units="1"}],
  ["NEGATIVE_EFFECTIVE_RESERVE","FAIL",x=>{x.replayedState.pool_quote_reserves_base_units="5";x.quoteVault.amount_base_units="5"}]
 ].map(([case_id,expected_status,patch])=>{
  const input=structuredClone(fixture);patch(input);
  const result=reconcilePumpSwapPoolSnapshot(input);
  const checks=[{id:"expected_status",passed:result.status===expected_status},
   {id:"slot_mismatch_withholds_effective_reserve",passed:case_id!=="SLOT_MISMATCH"||result.effective_quote_reserves_base_units===null},
   {id:"exact_baseline",passed:case_id!=="MATCHED_SNAPSHOT"||result.effective_quote_reserves_base_units==="990"},
   {id:"missing_not_zero",passed:case_id!=="MISSING_VAULT"||result.missing_fields.includes("pool_base_reserves_base_units")}];
  return {case_id,expected_status,actual_status:result.status,checks,passed:checks.every(c=>c.passed)};
 });
 return {schema_version:"cook-pool-evidence-stress.1",status:cases.every(c=>c.passed)?"SYNTHETIC_REGRESSION_PASS":"REVIEW_REQUIRED",
  case_count:cases.length,passed_count:cases.filter(c=>c.passed).length,cases,lp_ownership:"UNKNOWN",live_liquidity_assessed:false,execution_enabled:false};
}

/** Explicit offline laboratory entry point. Separate groups: do not aggregate
 * artificial case outcomes into real-market probabilities. */
export function runOfflineRiskLaboratory({base,seeds=[701,702,703],steps=120}={}){
 if(base?.sourceMode!=="SYNTHETIC"||!Array.isArray(seeds)||seeds.length>5||!Number.isSafeInteger(steps)||steps>240)throw Error("OFFLINE_LAB_INPUT_LIMIT");
 const participant=summarizeMathValidation(runParticipantValidationSuite({base,seeds,steps}));
 const pools=runPoolEvidenceStress();
 return {schema_version:"cook-offline-risk-laboratory.1",status:participant.status==="SYNTHETIC_REGRESSION_PASS"&&pools.status==="SYNTHETIC_REGRESSION_PASS"?"SYNTHETIC_REGRESSION_PASS":"REVIEW_REQUIRED",
  participant,pools,real_market_validated:false,lp_position_valuation:null,operating_profit_forecast:null,real_data_connected:false,
  source_attestation:"UNKNOWN",execution_enabled:false,settlement_allowed:false};
}
