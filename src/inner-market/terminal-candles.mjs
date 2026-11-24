import {buildRawCandles} from "../core/candle-builder.mjs";
import {sortForReplay} from "../core/event-order.mjs";
const SIDES={CURVE_BUY_EXECUTED:"BUY",CURVE_SELL_EXECUTED:"SELL"};
const scopeKeys=["projectId","quoteAsset","tokenMint","openingCutoff","closingCutoff"];
const marketKeys=["chain_id","network","token_mint","quote_mint","curve_program_id","market_phase"];
const intervals=new Set([60000,300000,900000,3600000]);
const result=(status,reason,candles=[])=>({status,reason,candles,external_attestation:"UNKNOWN"});

/** Import-only candle evidence. Validate event-level parity with the closed report.
 * This verifies consistency, not authenticity of supplied source attestations.
 * Does not infer missing prices or submit orders. */
export function buildTerminalCandles(input,intervalMs=60000){
 if(!intervals.has(intervalMs))throw new RangeError("unsupported candle interval");
 const evidence=input?.market?.candleEvidence;
 if(evidence==null)return result("UNAVAILABLE","CANDLE_EVIDENCE_MISSING");
 try{
  if(evidence.schema_version!=="terminal-candle-evidence.1"||evidence.complete!==true||
    input.market.historyComplete!==true||input.market.snapshot?.reconciliation!=="PASS")return result("REVIEW","COVERAGE_NOT_COMPLETE");
  if(!scopeKeys.every(k=>typeof input.scope[k]==="string"&&input.scope[k]===evidence.scope?.[k]))return result("REVIEW","SCOPE_MISMATCH");
  const identity=evidence.market;
  if(!marketKeys.every(k=>typeof identity?.[k]==="string"&&identity[k].length>0)||identity.token_mint!==input.scope.tokenMint||identity.market_phase!=="bonding_curve")return result("REVIEW","MARKET_IDENTITY_MISMATCH");
  if(!Number.isSafeInteger(evidence.startTimeMs)||!Number.isSafeInteger(evidence.endTimeMs)||evidence.startTimeMs<0||evidence.endTimeMs<=evidence.startTimeMs)return result("REVIEW","TIME_RANGE_INVALID");
  if(!Array.isArray(evidence.events)||!Array.isArray(input.market.trades))return result("REVIEW","EVENTS_MISSING");
  const provenance=input.sourceMode==="SYNTHETIC"?"synthetic":input.sourceMode==="ARCHIVED_HISTORICAL"?"observed_chain":null;
  if(!provenance)return result("REVIEW","PROVENANCE_MISMATCH");
  const trades=input.market.trades;
  if(trades.some(t=>t.status!=="FINALIZED"||t.reconciliation!=="PASS"))return result("REVIEW","UNCONFIRMED_REPORT_TRADE");
  const byId=new Map(trades.map(t=>[t.id,t]));
  if(byId.size!==trades.length||evidence.events.length!==trades.length)return result("REVIEW","EVENT_COVERAGE_MISMATCH");
  const ids=new Set(),scenarios=new Set();
  for(const e of evidence.events){
   const t=byId.get(e?.event_id);
   if(!t||ids.has(e.event_id)||SIDES[e.event_kind]!==t.side||e.payload?.quote_amount_base_units!==t.quoteNotionalBaseUnits)return result("REVIEW","EVENT_PARITY_MISMATCH");
   ids.add(e.event_id);
   if(e.schema_version!=="1.0.0"||e.provenance!==provenance||!marketKeys.every(k=>e.market?.[k]===identity[k])||e.payload?.quote_mint!==identity.quote_mint)return result("REVIEW","EVENT_IDENTITY_MISMATCH");
   if(e.quality?.is_complete!==true||e.quality?.validation_status!=="valid"||!Number.isSafeInteger(e.event_time_ms)||e.event_time_ms<evidence.startTimeMs||e.event_time_ms>=evidence.endTimeMs)return result("REVIEW","EVENT_QUALITY_INVALID");
   if(provenance==="synthetic"){if(!e.synthetic_metadata?.scenario_id)return result("REVIEW","SCENARIO_MISSING");scenarios.add(e.synthetic_metadata.scenario_id);}
  }
  if(scenarios.size>1)return result("REVIEW","MIXED_SCENARIOS");
  const ordered=sortForReplay(evidence.events);
  if(ordered.some((e,i)=>e.event_id!==trades[i].id||(i>0&&e.event_time_ms<ordered[i-1].event_time_ms)))return result("REVIEW","EVENT_ORDER_MISMATCH");
  const candles=buildRawCandles(ordered,intervalMs);
  return result(candles.length?"CONSISTENT":"EMPTY",null,candles);
 }catch{return result("REVIEW","INVALID_CANDLE_EVIDENCE");}
}
