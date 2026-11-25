import {parseBaseUnits,U128_MAX} from "../core/integer.mjs";
const amount=(v,name)=>parseBaseUnits(v,{name,max:U128_MAX});
const result=(status,issues,checked)=>({status,issues,checked_trade_count:checked,cost_basis_attestation:"UNKNOWN",allocation_method_attestation:"UNKNOWN"});

/** Offline audit of already recorded historical balances. This does not choose
 * a cost allocation method, infer ownership, value assets, or propose trades.
 * External adjustments lack a common ordering contract and are not replayed. */
export function auditHistoricalCostBasis({inventory,market}){
 const {opening,closing,ledger,adjustments}=inventory;
 const issues=[];
 // Validate each available endpoint independently before returning PARTIAL.
 // Missing basis at one endpoint cannot hide a known contradiction at the other.
 let qty=amount(opening.tokens,"opening quantity"),basis=opening.costBasis==null?null:amount(opening.costBasis,"opening basis");
 const closingQty=amount(closing.tokens,"closing quantity"),closingBasis=closing.costBasis==null?null:amount(closing.costBasis,"closing basis");
 if(qty===0n&&basis!==null&&basis!==0n)issues.push("COST_BASIS_WITHOUT_OPENING_INVENTORY");
 if(closingQty===0n&&closingBasis!==null&&closingBasis!==0n)issues.push("COST_BASIS_WITHOUT_CLOSING_INVENTORY");
 if(issues.length)return result("REVIEW_REQUIRED",issues,0);
 if(basis===null||closingBasis===null)return result("PARTIAL",["COST_BASIS_ENDPOINT_UNKNOWN"],0);
 if(adjustments.some(a=>a.kind!=="INTERNAL_TRANSFER"||a.status!=="FINALIZED"||a.reconciliation!=="PASS"||a.verifiedAggregateTokenDelta!=="0"||a.verifiedAggregateBasisDelta!=="0"))
  return result("PARTIAL",["COST_BASIS_ADJUSTMENT_ORDER_UNAVAILABLE"],0);
 if(inventory.historyComplete!==true||market.historyComplete!==true)
  return result("PARTIAL",["COST_BASIS_HISTORY_INCOMPLETE"],0);
 const byId=new Map();
 for(const t of market.trades){
  if(typeof t.id!=="string"||!t.id.trim()||byId.has(t.id))return result("REVIEW_REQUIRED",["COST_BASIS_MARKET_EVENT_ID_INVALID_OR_DUPLICATE"],0);
  byId.set(t.id,t);
 }
 const journal=ledger.position_journal,seen=new Set();
 for(const j of journal){
  if(typeof j.event_id!=="string"||!j.event_id.trim()||seen.has(j.event_id))return result("REVIEW_REQUIRED",["COST_BASIS_JOURNAL_EVENT_ID_INVALID_OR_DUPLICATE"],0);
  if(!["BUY","SELL"].includes(j.side))return result("REVIEW_REQUIRED",["COST_BASIS_JOURNAL_SIDE_INVALID"],0);
  seen.add(j.event_id);
 }
 const linked=journal.map(j=>({j,t:byId.get(j.event_id)}));
 if(linked.some(({j,t})=>!t||t.side!==j.side||t.status!=="FINALIZED"||t.reconciliation!=="PASS"||!Number.isSafeInteger(t.sequence)||t.sequence<0))
  return result("PARTIAL",["COST_BASIS_TRADE_ORDER_UNAVAILABLE"],0);
 if(journal.some(j=>j.side==="SELL"&&j.allocated_cost_basis_quote_base_units==null))
  return result("PARTIAL",["COST_BASIS_DISPOSAL_UNKNOWN"],0);
 if(new Set(linked.map(({t})=>t.sequence)).size!==linked.length)return result("REVIEW_REQUIRED",["COST_BASIS_AMBIGUOUS_TRADE_ORDER"],0);
 linked.sort((a,b)=>a.t.sequence-b.t.sequence);
 let checked=0;
 for(const {j} of linked){
  const q=amount(j.token_amount_base_units,"journal quantity");
  if(q===0n){issues.push("COST_BASIS_ZERO_TRADE_QUANTITY:"+j.event_id);break;}
  if(j.side==="BUY"){
   qty+=q;basis+=amount(j.cash_cost_quote_base_units,"journal acquisition cost");
  }else{
   qty-=q;basis-=amount(j.allocated_cost_basis_quote_base_units,"journal disposed basis");
  }
  checked++;
  if(qty>U128_MAX||basis>U128_MAX)issues.push("COST_BASIS_INTERMEDIATE_RANGE_EXCEEDED:"+j.event_id);
  if(qty<0n)issues.push("COST_BASIS_NEGATIVE_INTERMEDIATE_INVENTORY:"+j.event_id);
  if(basis<0n)issues.push("COST_BASIS_NEGATIVE_INTERMEDIATE_BASIS:"+j.event_id);
  if(qty===0n&&basis!==0n)issues.push("COST_BASIS_RESIDUAL_WITHOUT_INVENTORY:"+j.event_id);
  if(issues.length)break;
 }
 if(!issues.length&&(qty!==closingQty||basis!==closingBasis))issues.push("COST_BASIS_REPLAY_ENDPOINT_MISMATCH");
 return result(issues.length?"REVIEW_REQUIRED":"INTERNALLY_CONSISTENT",issues,checked);
}
