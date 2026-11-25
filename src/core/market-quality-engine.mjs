import {createHash} from "node:crypto";
import {sortForReplay} from "./event-order.mjs";
import {buildRawCandles} from "./candle-builder.mjs";
import {auditObservedEventTimeline} from "./event-timeline-audit.mjs";
const EXEC=new Set(["CURVE_BUY_EXECUTED","CURVE_SELL_EXECUTED","POOL_BUY_EXECUTED","POOL_SELL_EXECUTED"]);
const validId=v=>typeof v==="string"&&v.length>0&&v.length<=256&&v.trim()===v;
const parse=v=>{if(typeof v!=="string"||!/^(0|[1-9][0-9]*)$/.test(v))throw Error("invalid base-unit amount");return BigInt(v);};
const decimal=v=>{if(typeof v!=="string"||!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(v))throw Error("invalid execution price");const [a,b=""]=v.split(".");return {n:BigInt(a+b),scale:b.length};};
const compareDecimal=(a,b)=>{const x=decimal(a),y=decimal(b),s=Math.max(x.scale,y.scale),l=x.n*10n**BigInt(s-x.scale),r=y.n*10n**BigInt(s-y.scale);return l<r?-1:l>r?1:0;};
const ratio=(n,d)=>d===0n?null:Number(n*1000000n/d)/1000000;
const stable=v=>v===null||typeof v!=="object"?JSON.stringify(v):Array.isArray(v)?"["+v.map(stable).join(",")+"]":"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stable(v[k])).join(",")+"}";
const hash=v=>createHash("sha256").update(stable(v)).digest("hex");
function concentration(rows){
 let total=0n;for(const x of rows.values())total+=x;
 if(total===0n)return {hhi:null,effective_count:null,top_share:null,total:"0"};
 let hhi=0,top=0;for(const x of rows.values()){const share=ratio(x,total);hhi+=share*share;if(share>top)top=share;}
 return {hhi,effective_count:hhi?1/hhi:null,top_share:top,total:total.toString()};
}
function add(map,key,amount){map.set(key,(map.get(key)??0n)+amount);}
function alertRecord(type,severity,market,events,facts,unknowns,interpretation){
 const ids=events.map(e=>e.event_id),id=hash([type,ids]).slice(0,24);
 let start=Number.MAX_SAFE_INTEGER,end=0;for(const e of events){start=Math.min(start,e.event_time_ms);end=Math.max(end,e.event_time_ms);}
 return {schema_version:"1.0.0",alert_id:id,alert_type:type,severity,market,window_start_ms:start,window_end_ms:end,
  observed_facts:facts,inferred_relationships:[],evidence:ids.map(x=>"event:"+x),counter_evidence:[],unknowns,
  confidence:0.5,data_completeness:"unknown",source_event_ids:ids,model_version:"market-quality.1",
  explanation:facts.join("; "),defensive_interpretation:interpretation};
}
/** Descriptive, evidence-bounded analysis. Not a forecast, ownership classifier,
 * manipulation finding, or trading signal. */
export function analyzeMarketQuality({events,intervalMs=60000,coverageStatus="UNKNOWN",sourceAttestation="UNKNOWN",inventoryPositions=[],marketState=null,thresholds={}}={}){
 if(!Array.isArray(events)||events.length>100000||!Array.isArray(inventoryPositions)||inventoryPositions.length>100000)throw Error("INVALID_MARKET_QUALITY_INPUT");
 const trades=events.filter(e=>EXEC.has(e?.event_kind));
 if(!trades.length)return {schema_version:"cook-market-quality.1",status:"NO_EXECUTIONS",metrics:null,alerts:[],candles:[],execution_enabled:false,is_trading_signal:false};
 const ordered=sortForReplay(trades),market=ordered[0].market;
 if(ordered.some(e=>stable(e.market)!==stable(market)))throw Error("MIXED_MARKET_QUALITY_SCOPE");
 if(ordered[0].provenance==="synthetic"&&(!validId(ordered[0].synthetic_metadata?.scenario_id)||ordered.some(e=>e.synthetic_metadata?.scenario_id!==ordered[0].synthetic_metadata.scenario_id||e.synthetic_metadata?.random_seed!==ordered[0].synthetic_metadata.random_seed||e.synthetic_metadata?.generator_version!==ordered[0].synthetic_metadata.generator_version)))throw Error("MIXED_OR_MISSING_SYNTHETIC_SCENARIO");
 const timeline=ordered[0].provenance==="observed_chain"?auditObservedEventTimeline({events:ordered}):{status:"SYNTHETIC_ONLY",issues:[]};
 let buy=0n,sell=0n,tokenBuy=0n,tokenSell=0n;
 const buyers=new Map(),sellers=new Map();let unknownActors=0,unknownBuys=0,unknownSells=0;
 let windowStart=Number.MAX_SAFE_INTEGER,windowEnd=0;
 let minPrice=ordered[0].payload.execution_price_decimal,maxPrice=minPrice;
 for(const e of ordered){
  const q=parse(e.payload.quote_amount_base_units),t=parse(e.payload.token_amount_base_units);
  if(!Number.isSafeInteger(e.event_time_ms)||e.event_time_ms<0)throw Error("INVALID_MARKET_EVENT_TIME");
  windowStart=Math.min(windowStart,e.event_time_ms);windowEnd=Math.max(windowEnd,e.event_time_ms);
  const isBuy=e.event_kind==="CURVE_BUY_EXECUTED"||e.event_kind==="POOL_BUY_EXECUTED",actor=e.payload.actor_address;
  if(isBuy){buy+=q;tokenBuy+=t;if(validId(actor))add(buyers,actor,q);else{unknownActors++;unknownBuys++;}}
  else{sell+=q;tokenSell+=t;if(validId(actor))add(sellers,actor,q);else{unknownActors++;unknownSells++;}}
  if(compareDecimal(e.payload.execution_price_decimal,minPrice)<0)minPrice=e.payload.execution_price_decimal;
  if(compareDecimal(e.payload.execution_price_decimal,maxPrice)>0)maxPrice=e.payload.execution_price_decimal;
 }
 const gross=buy+sell,net=buy-sell,first=decimal(ordered[0].payload.execution_price_decimal),last=decimal(ordered.at(-1).payload.execution_price_decimal),scale=Math.max(first.scale,last.scale);
 const firstN=first.n*10n**BigInt(scale-first.scale),lastN=last.n*10n**BigInt(scale-last.scale);
 const returnBps=firstN===0n?null:Number((lastN-firstN)*10000n/firstN);
 const buyConc=concentration(buyers),sellConc=concentration(sellers);
 let inventoryTotal=0n,inventoryUnknown=0n,unknownInventoryRows=0;const holderMap=new Map(),positionIds=new Set();
 for(const p of inventoryPositions){const amount=parse(p.token_amount_base_units);inventoryTotal+=amount;
  if(p.position_id!==undefined){if(!validId(p.position_id)||positionIds.has(p.position_id))throw Error("DUPLICATE_OR_INVALID_INVENTORY_POSITION");positionIds.add(p.position_id);}
  if(p.attribution_status!=="verified"||!validId(p.owner)){inventoryUnknown+=amount;unknownInventoryRows++;}else add(holderMap,p.owner,amount);
 }
 const holderConc=concentration(holderMap),unknownInventoryShare=ratio(inventoryUnknown,inventoryTotal);
 // Closing reserve is not matched pre-execution depth. Withhold this proxy.
 const depthRatio=null;
 const candles=buildRawCandles(ordered,intervalMs);
 const metrics={trade_count:ordered.length,buy_count:ordered.filter(e=>e.event_kind.endsWith("BUY_EXECUTED")).length,
  sell_count:ordered.filter(e=>e.event_kind.endsWith("SELL_EXECUTED")).length,gross_quote_turnover_base_units:gross.toString(),
  buy_quote_flow_base_units:buy.toString(),sell_quote_flow_base_units:sell.toString(),net_quote_flow_proxy_base_units:net.toString(),
  buy_token_volume_base_units:tokenBuy.toString(),sell_token_volume_base_units:tokenSell.toString(),
  unique_buyer_count:buyers.size,unique_seller_count:sellers.size,unknown_actor_trade_count:unknownActors,
  buyer_quote_hhi:unknownBuys?null:buyConc.hhi,buyer_effective_count:unknownBuys?null:buyConc.effective_count,buyer_top_share:unknownBuys?null:buyConc.top_share,
  seller_quote_hhi:unknownSells?null:sellConc.hhi,seller_effective_count:unknownSells?null:sellConc.effective_count,seller_top_share:unknownSells?null:sellConc.top_share,
  first_execution_price:ordered[0].payload.execution_price_decimal,last_execution_price:ordered.at(-1).payload.execution_price_decimal,
  min_execution_price:minPrice,max_execution_price:maxPrice,price_return_bps:returnBps,
  max_trade_to_virtual_quote_depth_bps:depthRatio,holder_token_hhi:unknownInventoryRows?null:holderConc.hhi,holder_effective_count:unknownInventoryRows?null:holderConc.effective_count,
  unknown_inventory_share:unknownInventoryShare,inventory_evidence_count:inventoryPositions.length};
 const alerts=[],divergence=gross>0n?ratio(net<0n?-net:net,gross):null;
 if(gross>0n&&divergence!==null&&divergence<(thresholds.grossNetDivergenceRatio??0.1))
  alerts.push(alertRecord("GROSS_NET_DEMAND_DIVERGENCE","medium",market,ordered,["Gross quote turnover is high relative to the signed buy-minus-sell quote-flow proxy."],["Transfers and off-market inventory changes are not included.","Quote-flow proxy is not a complete ownership or demand measure."],"High turnover does not by itself establish independent demand or coordinated activity."));
 if(unknownBuys===0&&buyers.size>0&&buyers.size<=(thresholds.lowBuyerBreadth??2)&&returnBps!==null&&Math.abs(returnBps)>=(thresholds.priceShockBps??2000))
  alerts.push(alertRecord("LOW_BREADTH_PRICE_SHOCK","medium",market,ordered,["A large observed price move coincides with a small number of identified buyer addresses."],["Address count is not a count of independent economic actors.","The event window may omit delayed or missing observations."],"This is a descriptive breadth/price association, not a manipulation or intent finding."));
 if(unknownActors>0||unknownInventoryRows>0)
  alerts.push(alertRecord("ATTRIBUTION_UNCERTAINTY","low",market,ordered,["Some activity or inventory lacks attributable owner evidence."],["Wallet ownership and common control are not inferred from address count."],"Unknown attribution must remain unknown; it is not evidence of common control."));
 if(timeline.status==="REVIEW_REQUIRED")
  alerts.push(alertRecord("EXECUTION_ORDERING_DISTORTION","high",market,ordered,["Execution ordering evidence failed validation."],["No causal inference is made from the rejected ordering."],"Do not use this event window for replay-dependent conclusions."));
 if(ordered.some(e=>e.quality?.validation_status!=="valid"||e.quality?.is_complete!==true))
  alerts.push(alertRecord("CURVE_STATE_OR_DATA_MISMATCH","high",market,ordered,["At least one source event is incomplete or carries a validation warning."],["The missing evidence may be unrelated to market behavior."],"Treat affected market metrics as provisional until source evidence is reconciled."));
 const dataCompleteness=coverageStatus==="PARTIAL"?"partial":coverageStatus==="STALE"?"stale":"unknown";for(const a of alerts)a.data_completeness=dataCompleteness;
 return {schema_version:"cook-market-quality.1",status:alerts.some(a=>a.severity==="high")?"REVIEW_REQUIRED":"DESCRIPTIVE_ONLY",
  market,window:{start_ms:windowStart,end_ms:windowEnd},metrics:alerts.some(a=>a.severity==="high")?null:metrics,candles:alerts.some(a=>a.severity==="high")?[]:candles,timeline_audit:timeline,
  coverage_status:coverageStatus,coverage_attestation:"UNKNOWN",source_attestation:"UNKNOWN",inventory_ownership_attestation:"UNKNOWN",depth_evidence_status:"UNAVAILABLE",alerts,
  limitations:["Address count is not independent-actor count.","Gross/net quote-flow is a proxy, not a complete inventory ledger.","No wallet intent or common-control conclusion is produced.","Historical metrics are not live market risk.","Concentration is limited to supplied evidence, not the entire market.","Closing reserve does not establish historical execution depth."],
  execution_enabled:false,is_trading_signal:false};
}
