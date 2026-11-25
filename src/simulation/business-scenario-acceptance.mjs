import {assessPortfolioRisk} from "../risk/portfolio-risk-engine.mjs";
import {valueSyntheticLpStatement} from "../inner-market/lp-statement-valuation.mjs";
import {reconcileLpStatement} from "../inner-market/lp-statement-reconciliation.mjs";
import {buildTerminalState,advanceReview,makeReviewArchive,restoreReviewArchive} from "../inner-market/terminal-state.mjs";
import {buildParticipantStressInput} from "../inner-market/participant-stress-lab.mjs";
/** Fixed independent accounting/risk QA; no strategy comparison, order creation
 * or profit optimization. */
export function runBusinessScenarioAcceptance(base){
 if(base?.sourceMode!=="SYNTHETIC")throw Error("SYNTHETIC_FIXTURE_REQUIRED");
 const before=JSON.stringify(base),cases=[];
 const add=(id,passed)=>cases.push({id,passed:passed===true});
 const state=buildTerminalState(base);
 const impaired=buildTerminalState(buildParticipantStressInput(base,"holder-impairment"));
 const missing=buildTerminalState(buildParticipantStressInput(base,"retail-coverage"));
 add("accounting_baseline",state.status==="REPORT_READY");
 add("valuation_stress_cash_unchanged",impaired.status==="REPORT_READY"&&state.treasury.closing_cash_base_units===impaired.treasury.closing_cash_base_units);
 add("missing_history_blocks_test_settlement",missing.status==="REVIEW_REQUIRED"&&missing.settlement_allowed===false);
 const stage=advanceReview(advanceReview("REVIEW","settle",state),"archive",state);
 add("synthetic_report_archive_roundtrip",restoreReviewArchive(makeReviewArchive(base,null,stage)).stage==="ARCHIVED");
 const riskInput={positions:[{position_id:"fixture-position",market_id:"fixture-market",exposure_quote_base_units:"20",evidence_status:"VERIFIED"}],
  account:{drawdown_bps:100,daily_loss_quote_base_units:"2"},marketSnapshots:[{market_id:"fixture-market",observed_at_ms:1000,data_completeness:"complete",source_status:"SYNTHETIC_ONLY",liquidation_depth_quote_base_units:"1000"}],
  limits:{max_total_exposure_quote_base_units:"100",max_daily_loss_quote_base_units:"10",max_market_exposure_bps:10000,max_drawdown_bps:1000,max_data_age_ms:100,max_liquidation_depth_ratio_bps:1000},nowMs:1000};
 const normal=assessPortfolioRisk(riskInput),stale=assessPortfolioRisk({...riskInput,nowMs:1200});
 const unknown=assessPortfolioRisk({...riskInput,marketSnapshots:[]});
 add("portfolio_configured_limits",normal.status==="WITHIN_CONFIGURED_LIMITS"&&normal.execution_enabled===false);
 add("portfolio_stale_blocks",stale.status==="BLOCKED");
 add("portfolio_missing_unknown",unknown.status==="UNKNOWN");
 const lp={source_mode:"SYNTHETIC",position_id:"fixture-lp",opening_cutoff:"0",closing_cutoff:"1",opening_lp_units:"100",added_lp_units:"20",removed_lp_units:"10",closing_lp_units:"110",opening_fee_receivable:"0",accrued_fee:"7",received_fee_cash:"3",written_off_fee:"0",closing_fee_receivable:"4",reconciled_cash_posting:"3"};
 add("lp_accounting",reconcileLpStatement(lp).status==="ARITHMETIC_MATCH");
 add("lp_cash_conflict",reconcileLpStatement({...lp,reconciled_cash_posting:"2"}).status==="REVIEW_REQUIRED");
 add("lp_unknown",reconcileLpStatement({...lp,closing_lp_units:null}).status==="INCOMPLETE");
 const fixture={statement:{...lp,pool_id:"fixture-pool"},
  snapshot:{source_mode:"SYNTHETIC",pool_id:"fixture-pool",cutoff:"1",claim_model:"DECLARED_PRO_RATA_FUNGIBLE_FIXTURE",base_asset:"base",quote_asset:"quote",supply_lp_units:"1000",distributable_base_units:"10000",distributable_quote_units:"20000"},
  mark:{source_mode:"SYNTHETIC",pool_id:"fixture-pool",cutoff:"1",base_asset:"base",quote_asset:"quote",quote_numerator:"2",base_denominator:"1"}};
 const marked=valueSyntheticLpStatement(fixture);
 add("lp_fixture_mark_separates_fees",marked.status==="DECLARED_FIXTURE_MARK"&&marked.values.position_mark_quote_units==="4400"&&!marked.values.fee_cash_included_in_position_mark&&!marked.values.fee_receivable_included_in_position_mark&&marked.actual_position_value===null);
 add("lp_fixture_scope_mismatch",valueSyntheticLpStatement({...fixture,mark:{...fixture.mark,cutoff:"other"}}).status==="REVIEW_REQUIRED");
 add("input_unchanged",JSON.stringify(base)===before);
 return {schema_version:"cook-business-scenario-acceptance.1",status:cases.every(c=>c.passed)?"SYNTHETIC_REGRESSION_PASS":"REVIEW_REQUIRED",cases,source_mode:"SYNTHETIC",execution_enabled:false,production_ready:false};
}
