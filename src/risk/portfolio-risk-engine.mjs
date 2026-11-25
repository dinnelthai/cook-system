const units=(v,n)=>{if(typeof v!=="string"||v.length>78||!/^(0|[1-9][0-9]*)$/.test(v))throw Error("invalid "+n);return BigInt(v);};
const ratio=(n,d)=>d===0n?null:Number(n*1000000n/d)/1000000;
/** Evidence-aware portfolio guard. It reports configured exposure checks, not safety
 * certification or a permission to trade. Unknown inputs remain UNKNOWN. */
export function assessPortfolioRisk({positions,account,marketSnapshots,limits,nowMs,valuationScope=null}={}){
 if(!Array.isArray(positions)||!Array.isArray(marketSnapshots)||!account||!limits||!Number.isSafeInteger(nowMs)||nowMs<0)throw Error("INVALID_PORTFOLIO_RISK_INPUT");
 for(const k of ["max_total_exposure_quote_base_units","max_daily_loss_quote_base_units"])units(limits[k],k);
 for(const k of ["max_market_exposure_bps","max_drawdown_bps","max_data_age_ms","max_liquidation_depth_ratio_bps"])
  if(!Number.isSafeInteger(limits[k])||limits[k]<0)throw Error("INVALID_PORTFOLIO_RISK_LIMIT:"+k);
 const findings=[],byMarket=new Map();let totalExposure=0n,unknownExposure=0n,unknownPositionCount=0;
 if(limits.max_market_exposure_bps>10000||limits.max_drawdown_bps>10000)throw Error("INVALID_PORTFOLIO_PERCENT_LIMIT");
 // Scope is a declared unit contract, not proof of asset valuation.
 const scopeFields=["network","genesis_hash","quote_asset","quote_decimals"];
 const validScope=v=>v&&typeof v==="object"&&!Array.isArray(v)&&scopeFields.every(k=>k==="quote_decimals"?Number.isSafeInteger(v[k])&&v[k]>=0&&v[k]<=18:typeof v[k]==="string"&&v[k].length>0&&v[k].length<=256&&v[k].trim()===v[k]);
 if(valuationScope!==null&&!validScope(valuationScope))throw Error("INVALID_PORTFOLIO_VALUATION_SCOPE");
 const scopeRows=[account,limits,...positions,...marketSnapshots];
 for(const row of scopeRows){
  if(!row||typeof row!=="object")throw Error("INVALID_PORTFOLIO_SCOPE_ROW");
  if(row.valuation_scope!==undefined&&(!validScope(row.valuation_scope)||valuationScope===null||scopeFields.some(k=>row.valuation_scope[k]!==valuationScope[k])))throw Error("PORTFOLIO_VALUATION_SCOPE_MISMATCH");
 }
 const scopeComplete=valuationScope!==null&&scopeRows.every(row=>row.valuation_scope!==undefined);
 if(!scopeComplete)findings.push({code:"PORTFOLIO_VALUATION_SCOPE_UNVERIFIED",severity:"UNKNOWN"});
 const positionIds=new Set();
 for(const p of positions){
  const value=units(p.exposure_quote_base_units,"position exposure");totalExposure+=value;
  if(p.position_id!==undefined){if(typeof p.position_id!=="string"||!p.position_id.trim()||positionIds.has(p.position_id))throw Error("DUPLICATE_OR_INVALID_POSITION_ID");positionIds.add(p.position_id);}
  if(p.evidence_status!=="VERIFIED"||!p.market_id){unknownExposure+=value;unknownPositionCount++;}
  if(p.market_id)byMarket.set(p.market_id,(byMarket.get(p.market_id)??0n)+value);
 }
 const maxTotal=units(limits.max_total_exposure_quote_base_units,"max total exposure");
 if(totalExposure>maxTotal)findings.push({code:"TOTAL_EXPOSURE_LIMIT",severity:"BLOCK",actual:totalExposure.toString(),limit:maxTotal.toString()});
 const drawdown=account.drawdown_bps;
 if(!Number.isSafeInteger(drawdown)||drawdown<0)findings.push({code:"DRAWDOWN_UNKNOWN",severity:"UNKNOWN"});
 else if(drawdown>limits.max_drawdown_bps)findings.push({code:"DRAWDOWN_LIMIT",severity:"BLOCK",actual:drawdown,limit:limits.max_drawdown_bps});
 const dailyLoss=account.daily_loss_quote_base_units==null?null:units(account.daily_loss_quote_base_units,"daily loss");
  if(dailyLoss===null)findings.push({code:"DAILY_LOSS_UNKNOWN",severity:"UNKNOWN"});
 const maxLoss=units(limits.max_daily_loss_quote_base_units,"max daily loss");
 if(dailyLoss!==null&&dailyLoss>maxLoss)findings.push({code:"DAILY_LOSS_LIMIT",severity:"BLOCK",actual:dailyLoss.toString(),limit:maxLoss.toString()});
 if(unknownPositionCount>0)findings.push({code:"POSITION_OWNERSHIP_OR_VALUATION_UNKNOWN",severity:"UNKNOWN",exposure_quote_base_units:unknownExposure.toString(),position_count:unknownPositionCount});
 const snapshots=new Map();
 for(const snapshot of marketSnapshots){if(!snapshot?.market_id||snapshots.has(snapshot.market_id))throw Error("DUPLICATE_OR_INVALID_MARKET_SNAPSHOT");snapshots.set(snapshot.market_id,snapshot);}
 for(const [marketId,exposure] of byMarket){
  // Concentration is computable from declared positions even when market observations are missing.
  const marketShare=ratio(exposure,totalExposure);
  if(totalExposure>0n&&exposure*10000n>BigInt(limits.max_market_exposure_bps)*totalExposure)
   findings.push({code:"SINGLE_MARKET_CONCENTRATION",severity:"BLOCK",market_id:marketId,share:marketShare});
  const snapshot=snapshots.get(marketId);
  if(!snapshot){findings.push({code:"MARKET_SNAPSHOT_MISSING",severity:"UNKNOWN",market_id:marketId});continue;}
  if(!Number.isSafeInteger(snapshot.observed_at_ms)||snapshot.observed_at_ms<0||snapshot.observed_at_ms>nowMs||nowMs-snapshot.observed_at_ms>limits.max_data_age_ms)
   findings.push({code:"MARKET_DATA_STALE",severity:"BLOCK",market_id:marketId});
  if(snapshot.data_completeness!=="complete"||!["IDENTITY_MATCHED_NOT_AUTHENTICATED","SYNTHETIC_ONLY"].includes(snapshot.source_status))
   findings.push({code:"MARKET_EVIDENCE_INCOMPLETE",severity:"UNKNOWN",market_id:marketId});
  const depth=snapshot.liquidation_depth_quote_base_units;
  if(typeof depth!=="string"||depth.length>78||!/^(0|[1-9][0-9]*)$/.test(depth)||BigInt(depth)===0n)
   findings.push({code:"LIQUIDATION_DEPTH_UNKNOWN",severity:"UNKNOWN",market_id:marketId});
  else{
   const utilization=ratio(exposure*10000n,BigInt(depth));
   if(exposure*10000n>BigInt(limits.max_liquidation_depth_ratio_bps)*BigInt(depth))
    findings.push({code:"LIQUIDATION_DEPTH_LIMIT",severity:"BLOCK",market_id:marketId,exposure_to_depth_bps:utilization});
  }

 }
 const blocked=findings.some(x=>x.severity==="BLOCK"),unknown=findings.some(x=>x.severity==="UNKNOWN");
 return {schema_version:"cook-portfolio-risk.1",status:blocked?"BLOCKED":unknown?"UNKNOWN":"WITHIN_CONFIGURED_LIMITS",
  metrics:{total_exposure_quote_base_units:totalExposure.toString(),unknown_exposure_quote_base_units:unknownExposure.toString(),
   market_count:byMarket.size,unknown_position_count:unknownPositionCount,drawdown_bps:Number.isSafeInteger(drawdown)?drawdown:null,daily_loss_quote_base_units:dailyLoss?.toString()??null},
  valuation_scope:valuationScope,valuation_scope_status:scopeComplete?"DECLARED_MATCH":"UNKNOWN",findings,source_attestation:"UNKNOWN",production_ready:false,execution_enabled:false};
}
