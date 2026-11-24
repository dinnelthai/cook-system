import { parseBaseUnits, U128_MAX } from "../core/integer.mjs";
const amount=(v,n)=>parseBaseUnits(v,{name:n,max:U128_MAX});
const SCALE=10n**18n;
const BPS=10000n;
const bps=(num,den)=>den===0n?null:(num*BPS/den).toString();

/**
 * Historical time-weighted accounting of externally verified NAV observations.
 * A capital flow requires a valuation immediately before and after the flow.
 * No inferred prices, future scenarios, or transaction recommendations.
 */
export function summarizeHistoricalNav({projectId,quoteAsset,snapshots,historyComplete=false}) {
  if(typeof projectId!=="string"||!projectId.trim()||typeof quoteAsset!=="string"||!quoteAsset.trim()) throw new TypeError("scope required");
  if(!Array.isArray(snapshots)||snapshots.length===0) throw new TypeError("snapshots required");
  if(typeof historyComplete!=="boolean") throw new TypeError("historyComplete must be boolean");
  let prev=null,index=SCALE,peak=SCALE,maxDrawdown=0n,totalFlow=0n,initial=null,closing=null;
  const rows=[],issues=[];
  if(!historyComplete) issues.push("HISTORY_INCOMPLETE");
  for(let i=0;i<snapshots.length;i++){
    const s=snapshots[i];
    if(!s||s.projectId!==projectId||s.quoteAsset!==quoteAsset) throw new Error("snapshot scope mismatch");
    if(!Number.isSafeInteger(s.sequence)||s.sequence<0||(prev&&s.sequence<=prev.sequence)) throw new Error("snapshot sequence must increase");
    if(s.reconciliation!=="PASS"||s.valuationStatus!=="VERIFIED") issues.push("UNVERIFIED_SNAPSHOT:"+s.sequence);
    const before=amount(s.navBeforeFlowBaseUnits,"NAV before flow");
    const after=amount(s.navAfterFlowBaseUnits,"NAV after flow");
    const contribution=amount(s.capitalInBaseUnits,"capital in");
    const withdrawal=amount(s.capitalOutBaseUnits,"capital out");
    if(before+contribution-withdrawal!==after) issues.push("CAPITAL_FLOW_MISMATCH:"+s.sequence);
    if(i===0){
      if(contribution!==0n||withdrawal!==0n||before!==after||after===0n) issues.push("INVALID_OPENING_NAV");
      initial=after;
    }else{
      if(prev.after===0n) issues.push("ZERO_PRIOR_NAV:"+s.sequence);
      else if(index>0n){
        index=index*before/prev.after;
        if(index===0n&&before>0n) issues.push("INDEX_PRECISION_EXHAUSTED:"+s.sequence);
      }
      if(index>peak)peak=index;
      const drawdown=(peak-index)*BPS/peak;
      if(drawdown>maxDrawdown)maxDrawdown=drawdown;
      if(before===0n) issues.push("TOTAL_LOSS_REBASE_REQUIRED:"+s.sequence);
    }
    totalFlow+=contribution-withdrawal;
    closing=after;
    rows.push({sequence:s.sequence,nav_base_units:after.toString(),net_capital_flow_base_units:(contribution-withdrawal).toString(),
      performance_index_scaled_18:index.toString(),drawdown_bps:bps(peak-index,peak)});
    prev={sequence:s.sequence,after};
  }
  const ready=issues.length===0;
  return {project_id:projectId,quote_asset:quoteAsset,status:ready?"COMPLETE":"REVIEW_REQUIRED",issues,
    opening_nav_base_units:initial.toString(),closing_nav_base_units:closing.toString(),net_capital_flow_base_units:totalFlow.toString(),
    capital_adjusted_nav_change_base_units:ready?(closing-initial-totalFlow).toString():null,
    time_weighted_return_bps:ready?bps(index-SCALE,SCALE):null,
    max_observed_drawdown_bps:ready?maxDrawdown.toString():null,
    observations:ready?rows:rows.map(({sequence,nav_base_units,net_capital_flow_base_units})=>({sequence,nav_base_units,net_capital_flow_base_units})),
    note:"Historical sampled drawdown only; not intraperiod maximum. NAV valuations and flow timing are supplied and verified externally."};
}
