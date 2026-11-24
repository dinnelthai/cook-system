import {assessHistoricalRisk} from "./historical-risk.mjs";
import {buildHistoricalDashboard} from "./historical-dashboard.mjs";
import {buildTerminalCandles} from "./terminal-candles.mjs";
import {summarizeHistoricalNav} from "./historical-nav.mjs";

export const REVIEW_STAGES=Object.freeze(["REVIEW","SETTLED","ARCHIVED"]);

/** Read-only closed-interval state. No live trading or issuer action recommendations. */
export function buildTerminalState(input){
 const d=buildHistoricalDashboard(input);
 const ready=d.status==="REPORT_READY";
 const n=summarizeHistoricalNav({projectId:input.scope.projectId,quoteAsset:input.scope.quoteAsset,snapshots:input.nav.snapshots,historyComplete:input.nav.historyComplete});
 const buy=BigInt(d.market.buy_notional_base_units),sell=BigInt(d.market.sell_notional_base_units);
 const candles=buildTerminalCandles(input);
 const checks=[ 
  {id:"accounting",status:ready?"PASS":"REVIEW",evidence:d.issues},
  {id:"market_coverage",status:d.market.history_complete?"PASS":"REVIEW",evidence:[]},
  {id:"valuation",status:n.status==="COMPLETE"?"PASS":"REVIEW",evidence:n.issues},
  {id:"candle_evidence",status:candles.status==="REVIEW"?"REVIEW":candles.status==="CONSISTENT"||candles.status==="EMPTY"?"PASS":"UNKNOWN",evidence:candles.reason?[candles.reason]:[]},
  {id:"source_attestation",status:"UNKNOWN",evidence:[]},
  {id:"wallet_attribution",status:"UNKNOWN",evidence:[]},
  {id:"live_execution",status:"UNAVAILABLE",evidence:[]}
 ];
 return {...d,schema_version:"terminal-state.1",
  market:{...d.market,gross_turnover_base_units:(buy+sell).toString(),buy_minus_sell_notional_base_units:(buy-sell).toString()},
  performance:{closing_nav_base_units:ready?n.closing_nav_base_units:null,capital_adjusted_nav_change_base_units:ready?n.capital_adjusted_nav_change_base_units:null,time_weighted_return_bps:ready?n.time_weighted_return_bps:null,observations:ready?n.observations:[]},
  checks,candles,risk:assessHistoricalRisk({reportChecks:checks,sourceMode:input.sourceMode}),settlement_scope:input.sourceMode==="SYNTHETIC"?"SYNTHETIC_ONLY":"UNATTESTED_HISTORICAL",
  settlement_allowed:input.sourceMode==="SYNTHETIC"&&ready&&candles.status!=="REVIEW",execution_enabled:false};
}
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
