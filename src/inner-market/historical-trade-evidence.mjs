import {parseBaseUnits,U128_MAX} from "../core/integer.mjs";
const amount=(v,name)=>parseBaseUnits(v,{name,max:U128_MAX});
const valid=s=>typeof s==="string"&&s.length>0&&s.trim()===s;
const sides={CURVE_BUY_EXECUTED:"BUY",CURVE_SELL_EXECUTED:"SELL"};

/** Retrospective consistency checks on existing records only.
 * Cash is net of attributable costs; gross market notional is not assumed
 * equal to cash movement. No inference of ownership or execution advice. */
export function auditHistoricalTradeEvidence({market,journal,cashEntries}){
 const byId=new Map(market.trades.map(t=>[t.id,t]));
 const posts=new Map();
 for(const p of cashEntries){
  if(!["TRADE_CASH_COST","TRADE_NET_RECEIPT"].includes(p.kind)||p.status!=="FINALIZED"||p.reconciliation!=="PASS")continue;
  if(!posts.has(p.tradeEventId))posts.set(p.tradeEventId,[]);
  posts.get(p.tradeEventId).push(p);
 }
 const events=new Map();
 const duplicates=new Set();
 const rows=market.candleEvidence?.events;
 if(Array.isArray(rows))for(const e of rows){
  if(events.has(e?.event_id))duplicates.add(e?.event_id);
  events.set(e?.event_id,e);
 }
 const issues=[],missing=[];
 let matched=0,fullyMatched=0,quantityMatched=0,signatureMatched=0;
 for(const j of journal){
  const id=j.event_id,t=byId.get(id),p=posts.get(id)??[],e=events.get(id);
  const before=issues.length,missingBefore=missing.length,issue=code=>issues.push(code+":"+id);
  if(!t){issue("PROJECT_TRADE_MARKET_EVENT_MISSING");continue;}
  if(t.side!==j.side)issue("PROJECT_TRADE_SIDE_MISMATCH");
  if(t.status!=="FINALIZED"||t.reconciliation!=="PASS")issue("PROJECT_TRADE_MARKET_UNVERIFIED");
  if(duplicates.has(id))issue("PROJECT_TRADE_DUPLICATE_EVIDENCE");
  const q=amount(j.token_amount_base_units,"journal token quantity");
  if(q===0n)issue("PROJECT_TRADE_ZERO_QUANTITY");
  const quantities=[];
  if(Object.hasOwn(t,"tokenAmountBaseUnits"))quantities.push(t.tokenAmountBaseUnits);
  if(e){
   if(sides[e.event_kind]!==j.side)issue("PROJECT_TRADE_SIDE_MISMATCH");
   if(e.payload?.quote_amount_base_units!==t.quoteNotionalBaseUnits)issue("PROJECT_TRADE_NOTIONAL_MISMATCH");
   quantities.push(e.payload?.token_amount_base_units);
  }
  if(!quantities.length)missing.push("PROJECT_TRADE_QUANTITY_UNAVAILABLE:"+id);
  else if(quantities.some(v=>v==null||amount(v,"market token quantity")!==q))issue("PROJECT_TRADE_QUANTITY_MISMATCH");
  else quantityMatched++;
  const signatures=[t.signature,j.signature,e?.payload?.signature,...p.map(x=>x.signature)].filter(v=>v!==undefined);
  if(signatures.some(v=>!valid(v))||new Set(signatures).size>1)issue("PROJECT_TRADE_SIGNATURE_MISMATCH");
  else if(signatures.length>=2)signatureMatched++;
  else missing.push("PROJECT_TRADE_SIGNATURE_UNAVAILABLE:"+id);
  if(issues.length===before){matched++;if(missing.length===missingBefore)fullyMatched++;}
 }
 return {status:issues.length?"REVIEW_REQUIRED":missing.length?"PARTIAL":"INTERNALLY_CONSISTENT",
  issues,missing,project_trade_count:journal.length,matched_trade_count:matched,fully_evidenced_trade_count:fullyMatched,quantity_matched_count:quantityMatched,
  signature_matched_count:signatureMatched,source_attestation:"UNKNOWN",ownership_attestation:"UNKNOWN",economic_classification_attestation:"UNKNOWN"};
}
