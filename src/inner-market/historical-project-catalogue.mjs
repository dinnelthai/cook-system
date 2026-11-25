import {buildUnifiedHistoricalReport} from "./unified-historical-report.mjs";
const fields=["projectId","tokenMint","quoteAsset","openingCutoff","closingCutoff"];
/** Session-only closed-interval report catalogue. No live market selection,
 * wallet association, execution or lifecycle commands. */
export function createHistoricalProjectCatalogue(){
 const records=new Map();let total=0;
 const maxChars=16*1024*1024;
 function add(input){
  const copy=structuredClone(input);
  const scope=copy?.scope;
  if(!["SYNTHETIC","ARCHIVED_HISTORICAL"].includes(copy?.sourceMode)||fields.some(k=>typeof scope?.[k]!=="string"||!scope[k].trim()||scope[k].length>512))throw Error("INVALID_CATALOGUE_SCOPE");
  const key=JSON.stringify([copy.sourceMode,...fields.map(k=>scope[k])]);
  const serialized=JSON.stringify(copy);
  if(serialized.length>maxChars)throw Error("CATALOGUE_SIZE_LIMIT");
  const previous=records.get(key);
  if(previous){
   if(previous.serialized!==serialized)throw Error("CONFLICTING_CLOSED_INTERVAL");
   return {key,status:"ALREADY_PRESENT"};
  }
  if(records.size>=8||total+serialized.length>maxChars)throw Error("CATALOGUE_CAPACITY");
  const report=buildUnifiedHistoricalReport(copy);
  const summary={key,source_mode:copy.sourceMode,...Object.fromEntries(fields.map(k=>[k,scope[k]])),audit_status:report.status,issue_count:report.issues.length,source_attestation:"UNKNOWN"};
  records.set(key,{serialized,summary});total+=serialized.length;
  return {key,status:"ADDED"};
 }
 return {add,list:()=>[...records.values()].map(r=>structuredClone(r.summary)),
  get:key=>{const r=records.get(key);if(!r)throw Error("CATALOGUE_RECORD_NOT_FOUND");const input=JSON.parse(r.serialized);return {input,report:buildUnifiedHistoricalReport(input)}},
  remove:key=>{const r=records.get(key);if(!r)return false;total-=r.serialized.length;return records.delete(key)}};
}
