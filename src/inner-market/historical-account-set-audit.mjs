import {parseBaseUnits,U128_MAX} from "../core/integer.mjs";
const amt=(v,name)=>parseBaseUnits(v,{name,max:U128_MAX});
const valid=v=>typeof v==="string"&&v.length>0&&v.length<=256&&v.trim()===v;
const scopeKeys=["network","genesisHash","projectId","quoteAsset","tokenMint","cutoff"];
/** Reconcile supplied closed historical balance sheets only. No wallet discovery,
 * transfers, signing, position selection or independent ownership inference. */
export function auditHistoricalAccountSet({scope,expectedAccounts,accounts,reportedTotals}={}){
 if(!scope||!scopeKeys.every(k=>valid(scope[k]))||!Array.isArray(expectedAccounts)||!expectedAccounts.length||expectedAccounts.length>1000||!Array.isArray(accounts)||accounts.length>1000)throw Error("INVALID_HISTORICAL_ACCOUNT_SET");
 const expected=new Set(expectedAccounts);
 if(expected.size!==expectedAccounts.length||expectedAccounts.some(x=>!valid(x)))throw Error("INVALID_EXPECTED_ACCOUNT_SET");
 const seen=new Set(),issues=[],missing=[];
 let cash=0n,tokens=0n,basis=0n,value=0n,receivable=0n,liabilities=0n,other=0n;
 let basisKnown=true,valueKnown=true;
 for(const row of accounts){
  if(!row||!valid(row.accountId)||!row.scope)throw Error("INVALID_ACCOUNT_EVIDENCE");
  const id=row.accountId;
  if(seen.has(id)){issues.push("DUPLICATE_ACCOUNT:"+id);continue;}
  seen.add(id);
  if(!expected.has(id))issues.push("UNEXPECTED_ACCOUNT:"+id);
  if(scopeKeys.some(k=>row.scope[k]!==scope[k]))issues.push("ACCOUNT_SCOPE_MISMATCH:"+id);
  if(row.reconciliation!=="PASS")missing.push("ACCOUNT_RECONCILIATION_UNAVAILABLE:"+id);
  const q=amt(row.tokenAmountBaseUnits,"token quantity");
  cash+=amt(row.cashBaseUnits,"cash");tokens+=q;
  receivable+=amt(row.receivableBaseUnits,"receivable");liabilities+=amt(row.liabilitiesBaseUnits,"liabilities");other+=amt(row.otherAssetsBaseUnits,"other assets");
  if(row.costBasisBaseUnits==null){basisKnown=false;missing.push("ACCOUNT_COST_BASIS_UNKNOWN:"+id);}
  else{const x=amt(row.costBasisBaseUnits,"cost basis");basis+=x;if(q===0n&&x!==0n)issues.push("ACCOUNT_COST_WITHOUT_INVENTORY:"+id);}
  if(row.inventoryValueBaseUnits==null){valueKnown=false;missing.push("ACCOUNT_VALUATION_UNKNOWN:"+id);}
  else{const x=amt(row.inventoryValueBaseUnits,"inventory value");value+=x;if(q===0n&&x!==0n)issues.push("ACCOUNT_VALUE_WITHOUT_INVENTORY:"+id);}
 }
 for(const id of expected)if(!seen.has(id))missing.push("EXPECTED_ACCOUNT_MISSING:"+id);
 const totals={cashBaseUnits:cash,tokenAmountBaseUnits:tokens,costBasisBaseUnits:basisKnown?basis:null,inventoryValueBaseUnits:valueKnown?value:null,receivableBaseUnits:receivable,liabilitiesBaseUnits:liabilities,otherAssetsBaseUnits:other,navBaseUnits:valueKnown?cash+value+receivable+other-liabilities:null};
 if(!reportedTotals)missing.push("REPORTED_TOTALS_UNAVAILABLE");
 else if(!missing.length)for(const [key,v] of Object.entries(totals)){
  if(reportedTotals[key]==null){missing.push("REPORTED_TOTAL_UNAVAILABLE:"+key);continue;}
  const actual=reportedTotals[key];
  if(key==="navBaseUnits"){
   if(typeof actual!=="string"||! /^(0|-?[1-9][0-9]*)$/.test(actual))throw Error("INVALID_REPORTED_NAV");
   if(BigInt(actual)!==v)issues.push("ACCOUNT_SET_TOTAL_MISMATCH:"+key);
  }else if(amt(actual,key)!==v)issues.push("ACCOUNT_SET_TOTAL_MISMATCH:"+key);
 }
 const status=issues.length?"REVIEW_REQUIRED":missing.length?"PARTIAL":"INTERNALLY_CONSISTENT";
 return {schema_version:"cook-historical-account-set-audit.1",status,issues,missing,expected_account_count:expected.size,observed_account_count:seen.size,
  totals:status==="INTERNALLY_CONSISTENT"?Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,v?.toString()??null])):null,
  ownership_attestation:"UNKNOWN",valuation_attestation:"UNKNOWN",source_attestation:"UNKNOWN",account_set_completeness_attested:false,execution_enabled:false};
}
