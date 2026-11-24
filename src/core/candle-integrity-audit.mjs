import {buildRawCandles} from "./candle-builder.mjs";
import {deduplicateEvents,sortForReplay} from "./event-order.mjs";
const stable=value=>value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?"["+value.map(stable).join(",")+"]":"{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable(value[k])).join(",")+"}";
/** Rebuild OHLCV from confirmed executions and compare a supplied candle set. */
export function auditCandleEvidence({events,candles,intervalMs,coverageStatus="UNKNOWN"}={}){
 if(!Array.isArray(events)||!Array.isArray(candles))throw Error("INVALID_CANDLE_AUDIT_INPUT");
 const issues=[];let expected=[],unique=[];
 try{
  unique=deduplicateEvents(events.filter(e=>["CURVE_BUY_EXECUTED","CURVE_SELL_EXECUTED","POOL_BUY_EXECUTED","POOL_SELL_EXECUTED"].includes(e?.event_kind)));
  expected=buildRawCandles(unique,intervalMs);
 }catch(error){
  return {schema_version:"cook-candle-integrity-audit.1",status:"REVIEW_REQUIRED",issues:[{code:"CANDLE_REPLAY_FAILED",detail:error.name}],expected_candle_count:null,provided_candle_count:candles.length,source_attestation:"UNKNOWN",coverage_attestation:"UNKNOWN"};
 }
 if(stable(expected)!==stable(candles))issues.push({code:"CANDLE_RECOMPUTATION_MISMATCH"});
 if(!["PAGINATION_COMPLETE_DECLARED","INTERNALLY_CONSISTENT","CONSISTENT"].includes(coverageStatus))issues.push({code:"SOURCE_COVERAGE_NOT_ESTABLISHED"});
 const ordered=sortForReplay(unique);
 return {schema_version:"cook-candle-integrity-audit.1",status:issues.some(x=>x.code==="CANDLE_RECOMPUTATION_MISMATCH")?"REVIEW_REQUIRED":issues.length?"PARTIAL":"CONSISTENT",
  interval_ms:intervalMs,execution_event_count:unique.length,source_event_ids:ordered.map(e=>e.event_id),
  expected_candle_count:expected.length,provided_candle_count:candles.length,issues,coverage_status:coverageStatus,
  coverage_attestation:"UNKNOWN",source_attestation:"UNKNOWN",
  note:"Recomputation proves internal consistency only; it does not authenticate the provider or prove complete chain history."};
}
