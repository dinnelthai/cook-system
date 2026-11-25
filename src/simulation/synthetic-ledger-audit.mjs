/** Audit already recorded offline accounting entries. No participant behavior,
 * pricing, order creation, or transaction submission is implemented here. */
const id=v=>typeof v==="string"&&v.length>0&&v.length<=256&&v.trim()===v;
const unsigned=v=>{
 if(typeof v!=="string"||!/^(0|[1-9][0-9]*)$/.test(v)||v.length>39)throw Error("INVALID_LEDGER_AMOUNT");
 return BigInt(v);
};
const signed=v=>{
 if(typeof v!=="string"||!/^(0|-?[1-9][0-9]*)$/.test(v)||v.length>40)throw Error("INVALID_LEDGER_DELTA");
 return BigInt(v);
};
export function auditSyntheticLedger({sourceMode,scenarioId,opening,closing,entries}={}){
 if(sourceMode!=="SYNTHETIC"||!id(scenarioId))throw Error("SYNTHETIC_LEDGER_REQUIRED");
 if(!Array.isArray(opening)||!opening.length||opening.length>1000||!Array.isArray(closing)||closing.length>1000||!Array.isArray(entries)||entries.length>20000)throw Error("INVALID_LEDGER_INPUT");
 const read=rows=>{
  const map=new Map();
  for(const r of rows){
   if(r?.scenario_id!==scenarioId||!id(r.account_id)||map.has(r.account_id))throw Error("INVALID_OR_DUPLICATE_LEDGER_ACCOUNT");
   map.set(r.account_id,{quote:unsigned(r.quote_base_units),token:unsigned(r.token_base_units)});
  }
  return map;
 };
 const initial=read(opening),end=read(closing),running=new Map([...initial].map(([k,v])=>[k,{...v}]));
 const seen=new Set(),issues=[];
 let netQ=0n,netT=0n;
 for(const e of entries){
  if(e?.scenario_id!==scenarioId||!id(e.entry_id)||seen.has(e.entry_id)||!running.has(e.account_id))throw Error("INVALID_OR_DUPLICATE_LEDGER_ENTRY");
  seen.add(e.entry_id);
  const q=signed(e.quote_delta_base_units),t=signed(e.token_delta_base_units);
  const row=running.get(e.account_id);row.quote+=q;row.token+=t;netQ+=q;netT+=t;
 }
 const rows=[];
 for(const [account,value] of running){
  const observed=end.get(account);
  if(!observed){issues.push("CLOSING_ACCOUNT_MISSING:"+account);continue;}
  const q=observed.quote-value.quote,t=observed.token-value.token;
  if(q!==0n||t!==0n)issues.push("ACCOUNT_BALANCE_MISMATCH:"+account);
  rows.push({account_id:account,quote_difference_base_units:q.toString(),token_difference_base_units:t.toString()});
 }
 for(const account of end.keys())if(!initial.has(account))issues.push("UNEXPECTED_CLOSING_ACCOUNT:"+account);
 if(netQ!==0n||netT!==0n)issues.push("CLOSED_LEDGER_NET_MOVEMENT_NONZERO");
 return {source_mode:"SYNTHETIC",scenario_id:scenarioId,status:issues.length?"REVIEW_REQUIRED":"INTERNALLY_CONSISTENT",
  account_count:initial.size,entry_count:seen.size,issues,accounts:rows,
  net_quote_delta_base_units:netQ.toString(),net_token_delta_base_units:netT.toString(),
  real_market_validated:false,execution_enabled:false,
  limitation:"Checks closed synthetic recorded postings and endpoint differences only; no economic attribution or trade validity inferred."};
}
