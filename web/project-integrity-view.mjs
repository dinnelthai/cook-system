import {canonicalJson} from "../src/core/canonical-json.mjs";
// Only an already-linked, non-conflicting historical interval may be shown as project evidence.
export function linkedReportMatches(review,digest,scope){
 if(typeof digest!=="string"||!/^[0-9a-f]{64}$/.test(digest)||!scope||review?.project_id!==scope.projectId||review.execution_enabled!==false)return false;
 const rows=review.runtime?.asset_intervals;
 if(!Array.isArray(rows)||review.runtime.project_id!==review.project_id||review.runtime.project_revision!==review.project_revision)return false;
 const matches=rows.filter(r=>r.report_digest===digest&&r.opening_cutoff===scope.openingCutoff&&r.closing_cutoff===scope.closingCutoff);
 return matches.length===1&&["INCOMPLETE","DECLARED_ENDPOINT_PRESENT"].includes(matches[0].status);
}
export async function historicalReportDigest(input,subtle=globalThis.crypto?.subtle){
 if(!subtle)return null;
 try{
  const digest=await subtle.digest("SHA-256",new TextEncoder().encode(canonicalJson(input)));
  return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("");
 }catch{return null;}
}
const max=18446744073709551615n;
export function formatDeclaredSupply(value,decimals){
 if(value==null)return "";
 if(!/^[1-9][0-9]*$/.test(value)||!Number.isInteger(decimals)||decimals<0||decimals>9)throw Error("INVALID_TOKEN_SUPPLY");
 const n=BigInt(value),scale=10n**BigInt(decimals);
 const tail=decimals?String(n%scale).padStart(decimals,"0").replace(/0+$/,""):"";
 return String(n/scale)+(tail?"."+tail:"");
}
export function parseDeclaredSupply(value,decimals){
 const s=String(value??"").trim(),d=String(decimals??"").trim();
 if(!s&&!d)return {supply_base_units:null,decimals:null};
 if(!/^(0|[1-9][0-9]{0,19})(\.[0-9]{1,9})?$/.test(s)||! /^[0-9]$/.test(d))throw Error("INVALID_TOKEN_SUPPLY");
 const n=Number(d),[whole,frac=""]=s.split(".");
 if(frac.length>n)throw Error("TOKEN_SUPPLY_PRECISION_EXCEEDS_DECIMALS");
 const units=BigInt(whole)*10n**BigInt(n)+BigInt(frac.padEnd(n,"0")||"0");
 if(units<1n||units>max)throw Error("INVALID_TOKEN_SUPPLY");
 return {supply_base_units:units.toString(),decimals:n};
}
// Do not silently replace existing wallet registrations while saving unrelated draft fields.
export function preserveDraftRegistration(project,creator,proposed){
 const existing=project?.wallet_groups?.find(g=>g.group_id==="dev-wallets");
 if(!existing)return proposed;
 if(creator!==project.token.creator_wallet_address)throw Error("EXISTING_WALLET_REGISTRATION_REQUIRES_SEPARATE_REVIEW");
 return existing;
}
