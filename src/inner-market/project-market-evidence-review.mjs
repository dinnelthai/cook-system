import {createHash} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";
import {assertProjectAggregate} from "./project-aggregate.mjs";
import {matchProjectReport} from "./project-report-identity.mjs";
import {buildTerminalState} from "./terminal-state.mjs";
import {describeClosedMarketQuality} from "./closed-market-quality.mjs";
import {buildTerminalCandles} from "./terminal-candles.mjs";
import {loadLinkedReport} from "./order-receipt-review.mjs";
const sha=x=>createHash("sha256").update(canonicalJson(x),"utf8").digest("hex");
/** Retrospective data-quality audit only. No trading signals, target prices,
 * market intervention, liquidity placement or live market assertions. */
export function reviewProjectMarketEvidence(projectInput,input){
 const p=assertProjectAggregate(projectInput);
 if(matchProjectReport(p,input).status!=="DECLARED_MATCH")throw Error("PROJECT_MARKET_REPORT_SCOPE_MISMATCH");
 const state=buildTerminalState(input),m=state.market_state,c=input.market.candleEvidence;
 const issues=[],unknown=[];
 if(m.status==="REVIEW_REQUIRED")issues.push("MARKET_HISTORY_OR_SNAPSHOT_REVIEW_REQUIRED");
 if(state.candles.status==="REVIEW")issues.push("CANDLE_EVENT_CONTRADICTION");
 if(state.candles.status==="UNAVAILABLE")unknown.push("CANDLE_EVIDENCE_UNAVAILABLE");
 const trade=state.checks.find(x=>x.id==="trade_evidence");
 if(trade?.status==="REVIEW")issues.push("TRADE_EVIDENCE_CONTRADICTION");
 else if(trade?.status!=="PASS")unknown.push("TRADE_EVIDENCE_INCOMPLETE");
 if(c){
  if(c.market?.quote_mint!==p.network.quote_mint)issues.push("PROJECT_QUOTE_MINT_MISMATCH");
  if(c.market?.curve_account){
   const bound=p.markets.filter(x=>x.venue==="PUMP_BONDING_CURVE");
   if(bound.length&&!bound.some(x=>x.market_account===c.market.curve_account&&x.identity.curve_program_id===c.market.curve_program_id))issues.push("REGISTERED_MARKET_IDENTITY_MISMATCH");
   if(!bound.length)unknown.push("REGISTERED_MARKET_IDENTITY_UNAVAILABLE");
  }else unknown.push("CURVE_ACCOUNT_IDENTITY_UNAVAILABLE");
 }
 // Coverage statistics are descriptive, not a participant attribution model.
 const trades=input.market.trades;
 const complete=trades.filter(t=>t.status==="FINALIZED"&&t.reconciliation==="PASS");
 const attributed=complete.filter(t=>typeof t.actorAddress==="string"&&t.actorAddress.trim()===t.actorAddress&&t.actorAddress.length>0);
 const participantCoverage={record_count:trades.length,reconciled_record_count:complete.length,declared_address_record_count:attributed.length,
  missing_address_record_count:complete.length-attributed.length,
  status:!trades.length?"NO_RECORDS":complete.length!==trades.length?"REVIEW_REQUIRED":attributed.length!==complete.length?"PARTIAL":"DECLARED_COMPLETE",
  independent_participant_count:null,ownership_attestation:"UNKNOWN"};
 if(participantCoverage.status==="REVIEW_REQUIRED")issues.push("UNRECONCILED_TRADE_RECORDS");
 if(participantCoverage.status==="PARTIAL")unknown.push("TRADE_ADDRESS_LABEL_COVERAGE_INCOMPLETE");
 if(participantCoverage.status==="NO_RECORDS")unknown.push("TRADE_ACTIVITY_EVIDENCE_UNAVAILABLE");
 const reserveKeys=["real_quote_reserves_base_units","virtual_quote_reserves_base_units","real_token_reserves_base_units","virtual_token_reserves_base_units"];
 const missingFields=reserveKeys.filter(k=>m.snapshot[k]===null||m.snapshot[k]===undefined);
 const reserveEvidence={status:m.snapshot.status==="REVIEW_REQUIRED"?"REVIEW_REQUIRED":missingFields.length?"PARTIAL":"DECLARED_FIELDS_PRESENT",
  missing_fields:missingFields,declared_lifecycle:m.snapshot.lifecycle,independent_reserve_attestation:"UNKNOWN",current_executable_depth:null};
 if(missingFields.length)unknown.push("HISTORICAL_RESERVE_FIELDS_UNAVAILABLE");
 const intervals=[60000,300000,900000,3600000].map(interval_ms=>{
  const r=buildTerminalCandles(input,interval_ms);
  return {interval_ms,status:r.status,reason:r.reason,candle_count:r.status==="CONSISTENT"||r.status==="EMPTY"?r.candles.length:null};
 });
 if(intervals.some(x=>x.status==="REVIEW"))issues.push("MULTI_INTERVAL_CANDLE_REVIEW_REQUIRED");
 const quality=describeClosedMarketQuality(input);
 if(quality.status==="REVIEW_REQUIRED")issues.push("MARKET_QUALITY_EVIDENCE_CONFLICT");
 else if(quality.status==="UNKNOWN")unknown.push("MARKET_QUALITY_EVIDENCE_UNAVAILABLE");
 unknown.push("INDEPENDENT_MARKET_SOURCE_UNATTESTED","MARKET_HISTORY_COMPLETENESS_UNATTESTED","LIVE_LIQUIDITY_UNAVAILABLE");
 return {schema_version:"cook-project-market-evidence-review.1",project_id:p.project_id,project_revision:p.revision,report_digest:sha(input),scope:m.scope,
  status:issues.length?"REVIEW_REQUIRED":"PARTIAL",declared_history_complete:m.declared_history_complete,
  trade_evidence_status:trade?.status??"UNKNOWN",candle_evidence_status:state.candles.status,
  candle_intervals:intervals,market_snapshot_status:m.snapshot.status,closed_market_quality:quality,
  participant_coverage:participantCoverage,reserve_evidence:reserveEvidence,
  observed_trade_record_count:input.market.trades.length,issues:[...new Set(issues)],unknown:[...new Set(unknown)],
  source_attestation:"UNKNOWN",live_market_assessed:false,execution_enabled:false,settlement_allowed:false};
}
export function createProjectMarketEvidenceReviewer({path,enabled}={}){
 return (project,link)=>{
  if(!enabled)throw Error("WORKSPACE_DISABLED");
  return {...reviewProjectMarketEvidence(project,loadLinkedReport(project,link,path)),report_link_archive_id:link.archive_id};
 };
}
