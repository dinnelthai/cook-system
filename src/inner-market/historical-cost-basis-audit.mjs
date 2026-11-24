import {parseBaseUnits,U128_MAX} from "../core/integer.mjs";
const amount=(v,name)=>parseBaseUnits(v,{name,max:U128_MAX});
const result=(status,issues,checked)=>({status,issues,checked_trade_count:checked,cost_basis_attestation:"UNKNOWN",allocation_method_attestation:"UNKNOWN"});

/** Offline audit of already recorded historical balances. This does not choose
 * a cost allocation method, infer ownership, value assets, or propose trades.
 * External adjustments lack a common ordering contract and are not replayed. */
export function auditHistoricalCostBasis({inventory,market}){
 const {opening,closing,ledger,adjustments}=inventory;
 const issues=[];
 if(opening.costBasis==null||closing.costBasis==null)return result("PARTIAL",["COST_BASIS_ENDPOINT_UNKNOWN"],0);
 let qty=amount(opening.tokens,"opening quantity"),basis=amount(opening.costBasis,"opening basis");
 const closingQty=amount(closing.tokens,"closing quantity"),closingBasis=amount(closing.costBasis,"closing basis");
 if(qty===0n&&basis!==0n)issues.push("COST_BASIS_WITHOUT_OPENING_INVENTORY");
 if(closingQty===0n&&closingBasis!==0n)issues.push("COST_BASIS_WITHOUT_CLOSING_INVENTORY");
 if(issues.length)return result("REVIEW_REQUIRED",issues,0);
 if(adjustments.some(a=>a.kind!=="INTERNAL_TRANSFER"||a.status!=="FINALIZED"||a.reconciliation!=="PASS"||a.verifiedAggregateTokenDelta!=="0"||a.verifiedAggregateBasisDelta!=="0"))
  return result("PARTIAL",["COST_BASIS_ADJUSTMENT_ORDER_UNAVAILABLE"],0);
 if(inventory.historyComplete!==true||market.historyComplete!==true)
  return result("PARTIAL",["COST_BASIS_HISTORY_INCOMPLETE"],0);
 const byId=new Map(market.trades.map(t=>[t.id,t]));
 const journal=ledger.position_journal;
 const linked=journal.map(j=>({j,t:byId.get(j.event_id)}));
 if(linked.some(({j,t})=>!t||t.side!==j.side||t.status!=="FINALIZED"||t.reconciliation!=="PASS"||!Number.isSafeInteger(t.sequence)))
  return result("PARTIAL",["COST_BASIS_TRADE_ORDER_UNAVAILABLE"],0);
 if(journal.some(j=>j.side==="SELL"&&j.allocated_cost_basis_quote_base_units==null))
  return result("PARTIAL",["COST_BASIS_DISPOSAL_UNKNOWN"],0);
 linked.sort((a,b)=>a.t.sequence-b.t.sequence);
 let checked=0;
 for(const {j} of linked){
  const q=amount(j.token_amount_base_units,"journal quantity");
  if(j.side==="BUY"){
   qty+=q;basis+=amount(j.cash_cost_quote_base_units,"journal acquisition cost");
  }else{
   qty-=q;basis-=amount(j.allocated_cost_basis_quote_base_units,"journal disposed basis");
  }
  checked++;
  if(qty<0n)issues.push("COST_BASIS_NEGATIVE_INTERMEDIATE_INVENTORY:"+j.event_id);
  if(basis<0n)issues.push("COST_BASIS_NEGATIVE_INTERMEDIATE_BASIS:"+j.event_id);
  if(qty===0n&&basis!==0n)issues.push("COST_BASIS_RESIDUAL_WITHOUT_INVENTORY:"+j.event_id);
  if(issues.length)break;
 }
 if(!issues.length&&(qty!==closingQty||basis!==closingBasis))issues.push("COST_BASIS_REPLAY_ENDPOINT_MISMATCH");
 return result(issues.length?"REVIEW_REQUIRED":"INTERNALLY_CONSISTENT",issues,checked);
}
