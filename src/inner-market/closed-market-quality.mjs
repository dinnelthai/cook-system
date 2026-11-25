import {analyzeMarketQuality} from "../core/market-quality-engine.mjs";
import {buildTerminalCandles} from "./terminal-candles.mjs";
/** Defensive source-quality projection of canonical parity-checked events.
 * No actor ranking, target price, trading signal, or live depth. */
export function describeClosedMarketQuality(input){
 const parity=buildTerminalCandles(input);
 const out=(status,reason,extras={})=>({status,reason,event_count:null,ordering_status:"UNKNOWN",
  source_attestation:"UNKNOWN",live_state:false,execution_enabled:false,...extras});
 if(parity.status==="UNAVAILABLE")return out("UNKNOWN",parity.reason);
 if(parity.status==="REVIEW")return out("REVIEW_REQUIRED",parity.reason);
 if(parity.status==="EMPTY")return out("NO_EXECUTIONS",null,{event_count:0});
 try{
  const v=analyzeMarketQuality({events:input.market.candleEvidence.events});
  if(v.status==="REVIEW_REQUIRED")return out("REVIEW_REQUIRED","CANONICAL_MARKET_QUALITY_CONFLICT",{ordering_status:v.timeline_audit?.status??"UNKNOWN"});
  if(v.status!=="DESCRIPTIVE_ONLY")return out("UNKNOWN","MARKET_QUALITY_UNAVAILABLE");
  return out("DESCRIPTIVE_ONLY",null,{event_count:v.metrics.trade_count,ordering_status:v.timeline_audit?.status??"UNKNOWN",
    data_quality_alert_count:v.alerts.filter(a=>["EXECUTION_ORDERING_DISTORTION","CURVE_STATE_OR_DATA_MISMATCH","ATTRIBUTION_UNCERTAINTY"].includes(a.alert_type)).length});
 }catch{return out("REVIEW_REQUIRED","INVALID_MARKET_QUALITY_EVENTS");}
}
