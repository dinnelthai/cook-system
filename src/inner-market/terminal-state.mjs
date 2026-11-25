import {auditTerminalEvidence} from "./terminal-evidence.mjs";
import {assessHistoricalRisk} from "./historical-risk.mjs";
import {computeHistoricalDashboard} from "./historical-dashboard.mjs";
import {buildTerminalCandles} from "./terminal-candles.mjs";
import {describeHistoricalTrust} from "./historical-trust.mjs";
import {describeHistoricalMarket} from "./historical-market-state.mjs";
import {auditReportClosingAccounts} from "./historical-account-set-audit.mjs";

export const REVIEW_STAGES=Object.freeze(["REVIEW","SETTLED","ARCHIVED"]);

/** Read-only closed-interval state. No live trading or issuer action recommendations. */
export function computeTerminalState(input){
 const {dashboard:d,report,nav:n,cash,fees,projectPnl}=computeHistoricalDashboard(input);
 const evidence=auditTerminalEvidence(input);
 const candles=buildTerminalCandles(input);
 const marketState=describeHistoricalMarket({input,market:d.market,candles});
 const accountSet=auditReportClosingAccounts(input);
 const accountSetReview=accountSet.status==="REVIEW_REQUIRED";
 const issues=[...d.issues,...evidence.issues,...(candles.status==="REVIEW"?["CANDLE_EVIDENCE_CONTRADICTION"]:[]),...(accountSetReview?["CLOSING_ACCOUNT_SET_CONTRADICTION",...accountSet.issues]:[])];
 const ready=d.status==="REPORT_READY"&&evidence.status!=="REVIEW_REQUIRED"&&candles.status!=="REVIEW"&&!accountSetReview;
 const navEndpoints=d.nav_evidence;
 const sample=input.sourceMode==="SYNTHETIC";
 const endpointReady=ready&&(sample||navEndpoints.status==="INTERNALLY_CONSISTENT");
 const pathReady=ready&&sample;
 const buy=BigInt(d.market.buy_notional_base_units),sell=BigInt(d.market.sell_notional_base_units);
 const checks=[ 
  {id:"accounting",status:ready?"PASS":"REVIEW",evidence:issues},
  {id:"archived_evidence",status:evidence.status==="UNAVAILABLE"?"UNKNOWN":evidence.status==="REVIEW_REQUIRED"?"REVIEW":"PASS",evidence:evidence.issues},
  {id:"closing_account_set",status:accountSetReview?"REVIEW":accountSet.status==="INTERNALLY_CONSISTENT"?"PASS":"UNKNOWN",evidence:[...accountSet.issues,...accountSet.missing]},
  {id:"cost_basis",status:d.cost_basis_evidence.status==="REVIEW_REQUIRED"?"REVIEW":"UNKNOWN",evidence:d.cost_basis_evidence.issues},
  {id:"creator_receipt_identity",status:fees.receipt_identity_coverage.status==="REVIEW_REQUIRED"?"REVIEW":fees.receipt_identity_coverage.status==="DECLARED_MATCH"?"PASS":"UNKNOWN",evidence:fees.issues.map(x=>x.code)},
  {id:"economic_classification",status:evidence.classification.status==="REVIEW_REQUIRED"?"REVIEW":"UNKNOWN",evidence:evidence.classification.issues},
  {id:"trade_evidence",status:d.trade_evidence.status==="REVIEW_REQUIRED"?"REVIEW":d.trade_evidence.status==="INTERNALLY_CONSISTENT"?"PASS":"UNKNOWN",evidence:[...d.trade_evidence.issues,...d.trade_evidence.missing]},
  {id:"market_coverage",status:d.market.history_complete?"PASS":"REVIEW",evidence:[]},
  {id:"valuation",status:n.status!=="COMPLETE"||navEndpoints.status==="REVIEW_REQUIRED"?"REVIEW":"UNKNOWN",evidence:[...n.issues,...navEndpoints.issues,"INDEPENDENT_VALUATION_UNAVAILABLE"]},
  {id:"candle_evidence",status:candles.status==="REVIEW"?"REVIEW":candles.status==="CONSISTENT"||candles.status==="EMPTY"?"PASS":"UNKNOWN",evidence:candles.reason?[candles.reason]:[]},
  {id:"source_attestation",status:"UNKNOWN",evidence:[]},
  {id:"wallet_attribution",status:"UNKNOWN",evidence:[]},
  {id:"live_execution",status:"UNAVAILABLE",evidence:[]}
 ];
 const trust=describeHistoricalTrust({sourceMode:input.sourceMode,ready,checks,navEndpoints,tradeEvidence:d.trade_evidence,costBasisEvidence:d.cost_basis_evidence,archivedEvidence:evidence,accountSet});
 const state={...d,schema_version:"terminal-state.1",status:ready?"REPORT_READY":"REVIEW_REQUIRED",issues,trust,market_state:marketState,closing_account_set:accountSet,
  treasury:ready?d.treasury:Object.fromEntries(Object.keys(d.treasury).map(k=>[k,null])),
  market:{...d.market,verified_real_reserve_base_units:marketState.snapshot.real_quote_reserves_base_units,gross_turnover_base_units:(buy+sell).toString(),buy_minus_sell_notional_base_units:(buy-sell).toString()},
  performance:{closing_nav_base_units:endpointReady?n.closing_nav_base_units:null,capital_adjusted_nav_change_base_units:endpointReady?n.capital_adjusted_nav_change_base_units:null,time_weighted_return_bps:pathReady?n.time_weighted_return_bps:null,observations:pathReady?n.observations:[],valuation_attestation:"UNKNOWN",endpoint_status:navEndpoints.status},
  checks,candles,archived_evidence:evidence,risk:assessHistoricalRisk({reportChecks:checks,sourceMode:input.sourceMode,accountAudit:evidence.account_audit,cashAudit:evidence.cash_audit}),settlement_scope:input.sourceMode==="SYNTHETIC"?"SYNTHETIC_ONLY":"UNATTESTED_HISTORICAL",
  settlement_allowed:trust.dimensions.settlement_eligibility==="SYNTHETIC_TEST_ONLY",execution_enabled:false};
 return {state,report,cash,fees,projectPnl,nav:n};
}
export function buildTerminalState(input){return computeTerminalState(input).state;}
export function advanceReview(stage,action,state){
 if(!REVIEW_STAGES.includes(stage))throw new Error("unknown review stage");
 if(action==="reset")return "REVIEW";
 if(action==="settle"&&stage==="REVIEW"&&state?.settlement_allowed===true&&state?.status==="REPORT_READY")return "SETTLED";
 if(action==="archive"&&stage==="SETTLED"&&state?.settlement_allowed===true&&state?.status==="REPORT_READY")return "ARCHIVED";
 throw new Error("invalid or unverified review transition");
}
export function makeReviewArchive(input,metadata,stage){
 const state=buildTerminalState(input);
 if(stage!=="ARCHIVED"||!state.settlement_allowed)throw new Error("verified report must be settled before archive");
 return {schema_version:"cook-review-archive.1",stage,metadata:metadata??null,input:structuredClone(input),execution_enabled:false};
}
export function restoreReviewArchive(bundle){
 if(bundle?.schema_version!=="cook-review-archive.1"||bundle.stage!=="ARCHIVED")throw new Error("invalid archive format");
 const state=buildTerminalState(bundle.input);
 if(!state.settlement_allowed)throw new Error("archive accounting requires review");
 return {input:structuredClone(bundle.input),metadata:bundle.metadata??null,stage:"ARCHIVED"};
}
