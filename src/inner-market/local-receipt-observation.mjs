import {publicKey} from "./local-faucet.mjs";
const MAX_U64=(1n<<64n)-1n;
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
function amount(x){if(typeof x!=="string"||!/^(0|[1-9]\d{0,19})$/.test(x)||BigInt(x)>MAX_U64)throw Error("INVALID_RECEIPT_EXPECTATION_AMOUNT");return x;}
function rpcAmount(x){return Number.isSafeInteger(x)&&x>=0?String(x):null;}
function shape(x,keys){if(!plain(x)||Object.keys(x).some(k=>!keys.includes(k)))throw Error("INVALID_RECEIPT_EXPECTATION");}
export function validateReceiptExpectation(expected){
 if(expected===undefined)return;
 shape(expected,["fee_lamports","outcome","accounts"]);
 amount(expected.fee_lamports);
 if(!["SUCCESS","FAILED"].includes(expected.outcome)||!Array.isArray(expected.accounts)||!expected.accounts.length||expected.accounts.length>32)throw Error("INVALID_RECEIPT_EXPECTATION");
 const seen=new Set();
 for(const row of expected.accounts){
  shape(row,["address","pre_lamports","post_lamports"]);
  publicKey(row.address);if(seen.has(row.address))throw Error("DUPLICATE_RECEIPT_EXPECTATION_ACCOUNT");seen.add(row.address);
  amount(row.pre_lamports);amount(row.post_lamports);
 }
}
/** Compare only declared sample facts. No ownership, completeness, economic
 * classification, inventory valuation or independent source authentication. */
export function auditReceiptObservation(tx,expected){
 validateReceiptExpectation(expected);
 const checks=[];
 const add=(id,status)=>checks.push({id,status});
 const finish=()=>({status:checks.some(x=>x.status==="MISMATCH")?"REVIEW_REQUIRED":checks.some(x=>x.status==="UNKNOWN")?"PARTIAL":"DECLARED_SAMPLE_MATCH",checks,independent_attestation:false});
 if(expected===undefined){add("independent_expectation","UNKNOWN");return finish();}
 const m=tx?.meta;
 const fee=rpcAmount(m?.fee);
 add("fee",fee===null?"UNKNOWN":fee===expected.fee_lamports?"MATCH":"MISMATCH");
 const outcome=!plain(m)||!Object.hasOwn(m,"err")?null:m.err===null?"SUCCESS":plain(m.err)||typeof m.err==="string"?"FAILED":null;
 add("outcome",outcome===null?"UNKNOWN":outcome===expected.outcome?"MATCH":"MISMATCH");
 const staticKeys=tx?.transaction?.message?.accountKeys;
 const loaded=m?.loadedAddresses;
 // RPC encoding=json: static keys followed by loaded writable and readonly addresses.
 if(!Array.isArray(staticKeys)||!staticKeys.length||
    (loaded!==undefined&&(!plain(loaded)||!Array.isArray(loaded.writable)||!Array.isArray(loaded.readonly)))||
    (tx?.version===0&&loaded===undefined&&tx?.transaction?.message?.addressTableLookups?.length)){
  add("account_mapping","UNKNOWN");return finish();
 }
 const keys=[...staticKeys,...(loaded?.writable??[]),...(loaded?.readonly??[])];
 if(keys.length>256||new Set(keys).size!==keys.length){add("account_mapping","MISMATCH");return finish();}
 try{for(const key of keys)publicKey(key);}catch{add("account_mapping","MISMATCH");return finish();}
 if(!Array.isArray(m?.preBalances)||!Array.isArray(m?.postBalances)){add("account_balances","UNKNOWN");return finish();}
 if(m.preBalances.length!==keys.length||m.postBalances.length!==keys.length){add("account_mapping","MISMATCH");return finish();}
 for(const [i,row] of expected.accounts.entries()){
  const n=keys.indexOf(row.address);
  if(n<0){add("account_"+i,"MISMATCH");continue;}
  const pre=rpcAmount(m.preBalances[n]),post=rpcAmount(m.postBalances[n]);
  add("account_"+i,pre===null||post===null?"UNKNOWN":pre===row.pre_lamports&&post===row.post_lamports?"MATCH":"MISMATCH");
 }
 return finish();
}
