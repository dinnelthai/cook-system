import {canonicalJson} from "./canonical-json.mjs";
import {isLocalHistoricalNetwork} from "./historical-network-label.mjs";
/** Check declared historical interval coverage only. Never fit participant
 * behavior or infer completeness from non-overlapping samples. */
const slot=v=>typeof v==="string"&&/^slot:(0|[1-9][0-9]{0,19})$/.test(v)&&BigInt(v.slice(5))<=18446744073709551615n?BigInt(v.slice(5)):null;
// Only an explicit read-only comparison key. Persisted source labels stay intact.
export const calibrationNetworkKey=network=>isLocalHistoricalNetwork(network)?"localnet":network;
export function auditDeclaredHistoricalIntervals(scopes,{limit=50}={}){
 if(![50,256].includes(limit)||!Array.isArray(scopes)||scopes.length>limit)throw Error("INVALID_CALIBRATION_INTERVALS");
 const groups=new Map(),unknown=[],issues=[],pairs=[];
 for(let i=0;i<scopes.length;i++){
  const s=scopes[i];
  if(!s||!["network","genesisHash","tokenMint","quoteAsset"].every(k=>typeof s[k]==="string"&&s[k].trim()))throw Error("CALIBRATION_SCOPE_INCOMPLETE");
  const a=slot(s.openingCutoff),b=slot(s.closingCutoff);
  if(a===null||b===null){unknown.push(i);continue;}
  if(a>=b){issues.push({code:"INVALID_INTERVAL_ORDER",index:i});continue;}
  const key=canonicalJson([calibrationNetworkKey(s.network),s.genesisHash,s.tokenMint,s.quoteAsset]);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push({i,a,b});
 }
 for(const rows of groups.values()){
  rows.sort((x,y)=>x.a<y.a?-1:x.a>y.a?1:x.i-y.i);
  for(let j=0;j<rows.length;j++)for(let k=j+1;k<rows.length;k++){
   const a=rows[j],b=rows[k];
   if(b.a>a.b)break;
   pairs.push({left_index:a.i,right_index:b.i,status:b.a===a.b?"SHARED_BOUNDARY":"OVERLAP"});
  }
 }
 const overlap_count=pairs.filter(p=>p.status==="OVERLAP").length;
 return {status:issues.length||overlap_count?"REVIEW_REQUIRED":!scopes.length||unknown.length?"UNKNOWN":"DECLARED_NONOVERLAP_CHECKED",
  report_count:scopes.length,unknown_indices:unknown,issues,pairs,overlap_count,coverage_attestation:"UNKNOWN",independence_attestation:"UNKNOWN",execution_enabled:false};
}
