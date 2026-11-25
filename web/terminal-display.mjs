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
