/** Aggregate balance conservation of an already completed synthetic fixture.
 * No order logic, predictions, role inference or trading recommendations. */
const amount=v=>{
 if(typeof v!=="string"||!/^(0|[1-9][0-9]*)$/.test(v))throw Error("INVALID_SYNTHETIC_BALANCE");
 return BigInt(v);
};
export function auditSyntheticConservation({openingTotals,finalState,agentStates}){
 if(!Array.isArray(agentStates)||!agentStates.length)throw Error("INVALID_SYNTHETIC_AGENT_SET");
 let quote=amount(finalState.quote_reserves_base_units),token=amount(finalState.token_reserves_base_units);
 const seen=new Set();
 for(const row of agentStates){
  if(typeof row?.agent_id!=="string"||!row.agent_id.trim()||seen.has(row.agent_id))throw Error("INVALID_SYNTHETIC_AGENT_ID");
  seen.add(row.agent_id);
  quote+=amount(row.quote_balance_base_units);token+=amount(row.token_balance_base_units);
 }
 const q=quote-amount(openingTotals.quote),t=token-amount(openingTotals.token);
 return {status:q===0n&&t===0n?"BALANCED":"REVIEW_REQUIRED",quote_difference_base_units:q.toString(),token_difference_base_units:t.toString(),real_market_validated:false};
}
