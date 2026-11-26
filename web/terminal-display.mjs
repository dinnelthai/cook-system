// Presentation helpers only; do not use rounded chart values for accounting.
export function formatHistoricalSol(value){
 if(typeof value!=="string"||! /^(0|-?[1-9][0-9]*)$/.test(value))return "—";
 const n=BigInt(value),abs=n<0n?-n:n;
 return (n<0n?"-":"")+(abs/1000000000n)+"."+String(abs%1000000000n).padStart(9,"0").replace(/0+$/,"").padEnd(2,"0");
}
export function historicalSeriesRange(points,kind){
 if(!points.length||points.some(p=>p.value==null||p.value===""||!Number.isFinite(Number(p.value))||(kind!=="NAV"&&Number(p.value)<0)))return null;
 const values=points.map(p=>Number(p.value));
 const min=kind==="NAV"?Math.min(0,...values):0;
 const max=Math.max(0,...values);
 return {min,max,span:Math.max(1,max-min),values};
}

// Chart coordinates reflect elapsed time, including gaps without observed trades.
export function candleTimeLayout(points,intervalMs,left=48,right=548){
 if(!Array.isArray(points)||!points.length||!Number.isSafeInteger(intervalMs)||intervalMs<=0)return null;
 const times=points.map(p=>p.interval_start_ms);
 if(times.some((v,i)=>!Number.isSafeInteger(v)||v<0||(i>0&&(v<=times[i-1]||(v-times[i-1])%intervalMs!==0))))return null;
 const start=times[0],end=times.at(-1),span=end-start;
 if(!Number.isSafeInteger(span))return null;
 const width=Math.max(0.5,Math.min(12,(right-left)*0.65/Math.max(1,span/intervalMs)));
 return {positions:times.map(t=>span?left+(right-left)*(t-start)/span:(left+right)/2),width,missing_intervals:span/intervalMs+1-times.length};
}

export function candleEvidenceRows(points){
 return points.map(c=>[new Date(c.interval_start_ms).toISOString(),c.open_price,c.high_price,c.low_price,c.close_price,c.quote_volume_base_units]);
}
// Only display the existing server's scoped closed-market audit; never import Node-only analysis into the browser.
export function marketQualityRows(q){
 const safe=q?.source_attestation==="UNKNOWN"&&q.live_state===false&&q.execution_enabled===false?q:null;
 const descriptive=safe?.status==="DESCRIPTIVE_ONLY"||safe?.status==="NO_EXECUTIONS";
 return [["证据状态",safe?.status??"UNKNOWN"],["记录数",descriptive?safe.event_count??"未知":"未知"],["事件顺序",safe?.ordering_status??"UNKNOWN"],["数据质量警报",descriptive?safe.data_quality_alert_count??"未知":"未知"],["独立来源认证","未知"],["实时市场质量","未核验"]];
}

// Presentation-only chart segments: never interpolate across missing intervals.
export function candleLineSegments(points,intervalMs){
 if(!candleTimeLayout(points,intervalMs))return [];
 const groups=[];
 for(let i=0;i<points.length;i++){
  if(i===0||points[i].interval_start_ms-points[i-1].interval_start_ms!==intervalMs)groups.push([]);
  groups.at(-1).push(i);
 }
 return groups;
}
