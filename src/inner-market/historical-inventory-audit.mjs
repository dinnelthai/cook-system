import { parseBaseUnits, U128_MAX } from "../core/integer.mjs";
const amount=(v,n)=>parseBaseUnits(v,{name:n,max:U128_MAX});
function sameScope(a,b){
  return a && b && ["projectId","tokenMint","quoteAsset","openingCutoff","closingCutoff"].every(k=>typeof a[k]==="string"&&a[k].trim()&&a[k]===b[k]);
}

/** Audit aggregate historical non-trade inventory adjustments.
 * Independent verified source records are required. This function does not
 * allocate basis between wallets, propose transfers, or generate transactions.
 */
export function auditInventoryAdjustments({scope,opening,closing,tradeSummary,adjustments,historyComplete=false}){
  if(!sameScope(scope,opening?.scope)||!sameScope(scope,closing?.scope)||!sameScope(scope,tradeSummary?.scope)) throw new Error("inventory scope mismatch");
  if(!Array.isArray(adjustments)||typeof historyComplete!=="boolean") throw new TypeError("adjustments and completeness required");
  const issues=[], seen=new Set();
  let tokens=amount(opening.tokens,"opening tokens")+amount(tradeSummary.boughtTokens,"bought tokens")-amount(tradeSummary.soldTokens,"sold tokens");
  let basis=opening.costBasis===null?null:amount(opening.costBasis,"opening basis");
  if(basis!==null&&tradeSummary.acquisitionCost!==null&&tradeSummary.disposedBasis!==null)
    basis+=amount(tradeSummary.acquisitionCost,"acquisition cost")-amount(tradeSummary.disposedBasis,"disposed basis");
  else basis=null;
  let internalCount=0;
  for(const e of adjustments){
    if(!e||typeof e.id!=="string"||!e.id.trim()||seen.has(e.id))throw new Error("missing or duplicate adjustment id");
    seen.add(e.id);
    if(!sameScope(scope,e.scope))throw new Error("adjustment scope mismatch");
    if(!["INTERNAL_TRANSFER","EXTERNAL_IN","EXTERNAL_OUT","BURN"].includes(e.kind))throw new Error("unsupported adjustment kind");
    if(e.status!=="FINALIZED"||e.reconciliation!=="PASS"){issues.push("UNVERIFIED_ADJUSTMENT:"+e.id);continue;}
    const qty=amount(e.tokens,"adjustment tokens");
    if(qty===0n)throw new RangeError("adjustment quantity must be positive");
    if(e.kind==="INTERNAL_TRANSFER"){
      internalCount++;
      if(e.verifiedAggregateTokenDelta!=="0"||e.verifiedAggregateBasisDelta!=="0")issues.push("INTERNAL_CONSERVATION_NOT_VERIFIED:"+e.id);
      continue;
    }
    const sign=e.kind==="EXTERNAL_IN"?1n:-1n;
    tokens+=sign*qty;
    if(e.costBasis===null){basis=null;issues.push("UNKNOWN_ADJUSTMENT_BASIS:"+e.id);}
    else if(basis!==null)basis+=sign*amount(e.costBasis,"verified adjustment basis");
  }
  if(!historyComplete)issues.push("HISTORY_INCOMPLETE");
  if([opening,closing,tradeSummary].some(x=>x.reconciliation!=="PASS"))issues.push("SOURCE_NOT_RECONCILED");
  if(tokens<0n)issues.push("NEGATIVE_INVENTORY");
  if(tokens!==amount(closing.tokens,"closing tokens"))issues.push("TOKEN_BALANCE_MISMATCH");
  if(basis===null||closing.costBasis===null)issues.push("UNKNOWN_COST_BASIS");
  else{
    if(basis<0n)issues.push("NEGATIVE_COST_BASIS");
    if(basis!==amount(closing.costBasis,"closing basis"))issues.push("COST_BASIS_MISMATCH");
    if(tokens===0n&&basis!==0n)issues.push("BASIS_WITHOUT_INVENTORY");
  }
  return {status:issues.length?"REVIEW_REQUIRED":"RECONCILED",issues,internal_transfer_records:internalCount,
    expected_token_balance:tokens.toString(),expected_cost_basis:basis?.toString()??null,
    verified_cost_basis:issues.length?null:basis.toString(),
    note:"Aggregate historical conservation audit only; basis inputs must be independently verified. No wallet allocation or trading instructions."};
}

/** Verify a supplied historical valuation against independently observed real reserves.
 * Gross quote obligations must include all amounts drawn from the curve.
 * A passing result is a necessary check, not proof that a trade is executable.
 */
export function auditHistoricalReserveCoverage({snapshot,valuation}){
  if(!snapshot||!valuation||typeof snapshot.snapshotId!=="string"||!snapshot.snapshotId.trim()||snapshot.snapshotId!==valuation.snapshotId)throw new Error("snapshot identity mismatch");
  const issues=[];
  if(snapshot.reconciliation!=="PASS"||valuation.reconciliation!=="PASS")issues.push("UNVERIFIED_SOURCE");
  if(snapshot.lifecycle!=="bonding_curve"||snapshot.complete!==false)issues.push("OUTSIDE_INNER_CURVE");
  if(snapshot.realQuoteReserves===null||valuation.grossQuoteObligation===null)issues.push("RESERVE_OR_GROSS_OBLIGATION_UNKNOWN");
  else if(amount(valuation.grossQuoteObligation,"gross obligation")>amount(snapshot.realQuoteReserves,"real reserve"))issues.push("REAL_RESERVE_INSUFFICIENT");
  return {status:issues.length?"REVIEW_REQUIRED":"CHECK_PASSED",issues,
    note:"A historical reserve coverage check only; no size search, execution guarantee or estimate of achievable proceeds."};
}
