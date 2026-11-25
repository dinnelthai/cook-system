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
