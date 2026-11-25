import {publicKey} from "../src/inner-market/local-faucet.mjs";
const STORAGE_KEY="cook.project-registry.v1",VERSION="cook-project-registry.1",MAX_RECORDS=100,U64_MAX=18446744073709551615n;
const alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function decodedLength(value){let n=0n;for(const c of value){const i=alphabet.indexOf(c);if(i<0)throw Error("INVALID_ISSUANCE_SIGNATURE");n=n*58n+BigInt(i);}return value.match(/^1*/)[0].length+(n===0n?0:Math.ceil(n.toString(16).length/2));}
function urlValue(value){if(value==="")return "";try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password||!u.hostname)throw Error();return u.href;}catch{throw Error("INVALID_PROJECT_URL");}}
function normalizeDraft(input){
 if(!input||typeof input!=="object"||Array.isArray(input))throw Error("INVALID_PROJECT_DRAFT");
 const allowed=["id","name","symbol","description","supply","decimals","quote_asset","network","creator_wallet","website","telegram","twitter"];
 if(Object.keys(input).some(k=>!allowed.includes(k)))throw Error("INVALID_PROJECT_DRAFT");
 const name=typeof input.name==="string"?input.name.trim():"",symbol=typeof input.symbol==="string"?input.symbol.trim().toUpperCase():"",description=typeof input.description==="string"?input.description.trim():"",supply=String(input.supply??"").trim(),decimals=Number(input.decimals),quote=input.quote_asset??"SOL",network=input.network??"LOCALNET",wallet=String(input.creator_wallet??"").trim();
 if(!name||name.length>32||!/^[A-Z0-9]{1,10}$/.test(symbol)||description.length>1000||!/^\d{1,20}$/.test(supply)||BigInt(supply)<1n||!Number.isInteger(decimals)||decimals<0||decimals>9||BigInt(supply)*10n**BigInt(decimals)>U64_MAX||quote!=="SOL"||network!=="LOCALNET")throw Error("INVALID_PROJECT_DRAFT");
 if(wallet)publicKey(wallet);
 return {name,symbol,description,supply,decimals,quote_asset:quote,network,creator_wallet:wallet,website:urlValue(String(input.website??"").trim()),telegram:urlValue(String(input.telegram??"").trim()),twitter:urlValue(String(input.twitter??"").trim())};
}
export function createProjectRegistry({storage=null,idFactory=()=>globalThis.crypto?.randomUUID?.()??("project-"+Date.now()+"-"+Math.random().toString(36).slice(2)),now=()=>new Date().toISOString()}={}){
 function store(){if(storage)return storage;try{if(globalThis.localStorage)return globalThis.localStorage;}catch{}throw Error("PROJECT_STORAGE_UNAVAILABLE");}
 function read(){
  let raw;try{raw=store().getItem(STORAGE_KEY);}catch{throw Error("PROJECT_STORAGE_UNAVAILABLE");}
  if(raw===null)return [];
  let bundle;try{bundle=JSON.parse(raw);}catch{throw Error("PROJECT_REGISTRY_CORRUPT");}
  if(bundle?.schema_version!==VERSION||!Array.isArray(bundle.records)||bundle.records.length>MAX_RECORDS||Object.keys(bundle).some(k=>!["schema_version","records"].includes(k)))throw Error("PROJECT_REGISTRY_CORRUPT");
  const ids=new Set();
  for(const row of bundle.records){
   if(!row||typeof row.id!=="string"||!row.id||ids.has(row.id)||typeof row.created_at!=="string"||typeof row.updated_at!=="string"||!Array.isArray(row.issuance_records)||row.issuance_records.length>100)throw Error("PROJECT_REGISTRY_CORRUPT");
   normalizeDraft({id:row.id,name:row.name,symbol:row.symbol,description:row.description,supply:row.supply,decimals:row.decimals,quote_asset:row.quote_asset,network:row.network,creator_wallet:row.creator_wallet,website:row.website,telegram:row.telegram,twitter:row.twitter});
   if(!["DRAFT","CONFIGURED_NOT_ISSUED","ISSUANCE_EVIDENCE_UNVERIFIED"].includes(row.status)||row.issuance_records.some(e=>{try{return e?.status!=="UNVERIFIED"||e.network!=="LOCALNET"||e.verification!=="NOT_PERFORMED"||typeof e.signature!=="string"||decodedLength(e.signature)!==64||typeof e.mint!=="string"||(publicKey(e.mint),false);}catch{return true;}}))throw Error("PROJECT_REGISTRY_CORRUPT");
   ids.add(row.id);
  }
  return bundle.records;
 }
 function write(records){try{store().setItem(STORAGE_KEY,JSON.stringify({schema_version:VERSION,records}));}catch{throw Error("PROJECT_STORAGE_UNAVAILABLE");}}
 return {
  list:()=>structuredClone(read()),
  get:id=>{const row=read().find(x=>x.id===id);if(!row)throw Error("PROJECT_NOT_FOUND");return structuredClone(row);},
  saveDraft(input){
   const fields=normalizeDraft(input),rows=read(),id=typeof input.id==="string"&&input.id?input.id:idFactory();if(typeof id!=="string"||!id||id.length>128)throw Error("INVALID_PROJECT_ID");const index=rows.findIndex(x=>x.id===id),old=index<0?null:rows[index];
   if(!old&&rows.length>=MAX_RECORDS)throw Error("PROJECT_REGISTRY_LIMIT");
   const row={id,...fields,created_at:old?.created_at??now(),updated_at:now(),status:old?.issuance_records?.length?"ISSUANCE_EVIDENCE_UNVERIFIED":fields.creator_wallet?"CONFIGURED_NOT_ISSUED":"DRAFT",issuance_records:structuredClone(old?.issuance_records??[])};
   const next=structuredClone(rows);if(index<0)next.push(row);else next[index]=row;write(next);return structuredClone(row);
  },
  recordIssuanceEvidence(id,{mint,signature}={}){
   const rows=read(),index=rows.findIndex(x=>x.id===id);if(index<0)throw Error("PROJECT_NOT_FOUND");
   publicKey(mint);if(typeof signature!=="string"||signature.length<64||signature.length>88||decodedLength(signature)!==64)throw Error("INVALID_ISSUANCE_SIGNATURE");
   const row=structuredClone(rows[index]),old=row.issuance_records.find(x=>x.signature===signature);
   if(old){if(old.mint!==mint)throw Error("ISSUANCE_SIGNATURE_CONFLICT");return {status:"ALREADY_PRESENT",record:row};}
   if(row.issuance_records.length>=100)throw Error("PROJECT_ISSUANCE_LIMIT");
   row.issuance_records.push({network:"LOCALNET",mint,signature,status:"UNVERIFIED",recorded_at:now(),verification:"NOT_PERFORMED"});
   row.status="ISSUANCE_EVIDENCE_UNVERIFIED";row.updated_at=now();const next=structuredClone(rows);next[index]=row;write(next);
   return {status:"RECORDED_UNVERIFIED",record:structuredClone(row)};
  },
  remove(id){const rows=read(),next=rows.filter(x=>x.id!==id);if(next.length===rows.length)return false;write(next);return true;},
  exportBundle(){return {schema_version:VERSION,source_attestation:"UNKNOWN",execution_enabled:false,records:read()};}
 };
}
