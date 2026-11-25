import {buildUnifiedHistoricalReport} from "./unified-historical-report.mjs";
import {canonicalJson} from "../core/canonical-json.mjs";
import {assertHistoricalReportScope} from "./historical-market-state.mjs";
const fields=["projectId","tokenMint","quoteAsset","openingCutoff","closingCutoff"];
const optional=["network","genesisHash","wallet","tokenAccount"];
/** Session-only closed-interval report catalogue. No live market selection,
 * wallet association, execution or lifecycle commands. */
export function createHistoricalProjectCatalogue(){
 const records=new Map();let total=0;
 const maxChars=16*1024*1024;
 function add(input){
  const copy=structuredClone(input);
  const scope=copy?.scope;
  if(!["SYNTHETIC","ARCHIVED_HISTORICAL"].includes(copy?.sourceMode)||fields.some(k=>typeof scope?.[k]!=="string"||!scope[k].trim()||scope[k].length>512))throw Error("INVALID_CATALOGUE_SCOPE");
  const report=buildUnifiedHistoricalReport(copy);
  const identity=assertHistoricalReportScope(copy).declared_identity;
   const key=JSON.stringify([copy.sourceMode,...fields.map(k=>scope[k]),...optional.map(k=>identity[k]??null)]);
  const serialized=JSON.stringify(copy);
  if(serialized.length>maxChars)throw Error("CATALOGUE_SIZE_LIMIT");
  const previous=records.get(key);
  if(previous){
   if(canonicalJson(JSON.parse(previous.serialized))!==canonicalJson(copy))throw Error("CONFLICTING_CLOSED_INTERVAL");
   return {key,status:"ALREADY_PRESENT"};
  }
  if(records.size>=8||total+serialized.length>maxChars)throw Error("CATALOGUE_CAPACITY");
  const summary={key,source_mode:copy.sourceMode,...Object.fromEntries([...fields,...optional].map(k=>[k,identity[k]??null])),declared_identity_complete:typeof identity.network==="string"&&typeof identity.genesisHash==="string",audit_status:report.status,issue_count:report.issues.length,source_attestation:"UNKNOWN"};
  records.set(key,{serialized,summary});total+=serialized.length;
  return {key,status:"ADDED"};
 }
 return {add,list:()=>[...records.values()].map(r=>structuredClone(r.summary)),
  get:key=>{const r=records.get(key);if(!r)throw Error("CATALOGUE_RECORD_NOT_FOUND");const input=JSON.parse(r.serialized);return {input,report:buildUnifiedHistoricalReport(input)}},
  remove:key=>{const r=records.get(key);if(!r)return false;total-=r.serialized.length;return records.delete(key)}};
}
