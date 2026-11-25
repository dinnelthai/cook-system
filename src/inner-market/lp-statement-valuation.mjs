import {parseBaseUnits,mulDivFloor,U128_MAX,checkedAddU128} from "../core/integer.mjs";
import {reconcileLpStatement} from "./lp-statement-reconciliation.mjs";
const id=v=>typeof v==="string"&&v.length>0&&v.length<=128&&v.trim()===v;
const amount=(v,name)=>{
 if(typeof v!=="string"||v.length>39)throw Error("INVALID_LP_AMOUNT:"+name);
 return parseBaseUnits(v,{name,max:U128_MAX});
};
/** Synthetic, passive accounting of a declared fungible pro-rata claim.
 * Not a PumpSwap redemption formula, liquidity placement model, withdrawal
 * quote or independently verified valuation. Exclude virtual reserves and fee
 * buckets: the fixture explicitly supplies distributable assets. */
export function valueSyntheticLpStatement({statement,snapshot,mark}={}){
 const ledger=reconcileLpStatement(statement);
 const out=(status,issues=[],values=null)=>({
  schema_version:"cook-synthetic-lp-valuation.1",position_id:statement.position_id,
  cutoff:statement.closing_cutoff,status,ledger,issues,values,actual_position_value:null,
  ownership_attestation:"UNKNOWN",valuation_attestation:"UNKNOWN",source_mode:"SYNTHETIC",
  executable_value:null,project_nav_inclusion:"NOT_ESTABLISHED",execution_enabled:false});
 if(ledger.status!=="ARITHMETIC_MATCH")return out(ledger.status,ledger.issues);
 if(snapshot==null||mark==null)return out("INCOMPLETE",["SNAPSHOT_OR_MARK_MISSING"]);
 if(snapshot.source_mode!=="SYNTHETIC"||mark.source_mode!=="SYNTHETIC"||
  snapshot.claim_model!=="DECLARED_PRO_RATA_FUNGIBLE_FIXTURE"||!id(statement.pool_id)||
  !id(snapshot.base_asset)||!id(snapshot.quote_asset)||snapshot.base_asset===snapshot.quote_asset||
  snapshot.pool_id!==statement.pool_id||snapshot.cutoff!==statement.closing_cutoff||
  mark.pool_id!==snapshot.pool_id||mark.cutoff!==snapshot.cutoff||mark.base_asset!==snapshot.base_asset||mark.quote_asset!==snapshot.quote_asset)
  return out("REVIEW_REQUIRED",["LP_SCOPE_OR_MODEL_MISMATCH"]);
 // A pro-rata fixture assumes distributable assets are distinct from
 // separately recorded fee receivables and cash. Explicit contradictory
 // declarations must not produce a mark; missing declarations stay unknown.
 const flags=["includes_separately_recorded_fee_receivable","includes_separately_recorded_fee_cash"];
 if(flags.some(k=>Object.hasOwn(snapshot,k)&&snapshot[k]!==false))
  return out("REVIEW_REQUIRED",["LP_DISTRIBUTABLE_ASSET_BOUNDARY_CONFLICT"]);
 const distributable_fee_separation=flags.every(k=>snapshot[k]===false)?"DECLARED_SEPARATE":"UNKNOWN";
 if(statement.fee_asset!=null&&![snapshot.base_asset,snapshot.quote_asset].includes(statement.fee_asset))
  return out("REVIEW_REQUIRED",["LP_FEE_ASSET_SCOPE_MISMATCH"]);
 const required=["supply_lp_units","distributable_base_units","distributable_quote_units"];
 if(required.some(k=>snapshot[k]==null)||mark.quote_numerator==null||mark.base_denominator==null)
  return out("INCOMPLETE",["LP_AMOUNT_OR_MARK_MISSING"]);
 try{
  const supply=amount(snapshot.supply_lp_units,"supply"),held=amount(statement.closing_lp_units,"held");
  const b=amount(snapshot.distributable_base_units,"distributable base"),q=amount(snapshot.distributable_quote_units,"distributable quote");
  const num=amount(mark.quote_numerator,"mark numerator"),den=amount(mark.base_denominator,"mark denominator");
  if(supply===0n||held>supply||den===0n)return out("REVIEW_REQUIRED",["LP_SHARE_OR_MARK_INVALID"]);
  const baseClaim=mulDivFloor(b,held,supply),quoteClaim=mulDivFloor(q,held,supply);
  const baseMarked=mulDivFloor(baseClaim,num,den);
  const value=checkedAddU128(baseMarked,quoteClaim);
  return out("DECLARED_FIXTURE_MARK",[],{
   lp_units:held.toString(),supply_lp_units:supply.toString(),
   share_numerator:held.toString(),share_denominator:supply.toString(),
   base_claim_units:baseClaim.toString(),quote_claim_units:quoteClaim.toString(),
   base_mark_quote_units:baseMarked.toString(),position_mark_quote_units:value.toString(),
   received_fee_cash:statement.received_fee_cash,closing_fee_receivable:statement.closing_fee_receivable,
   fee_asset:statement.fee_asset??null,fee_asset_alignment:ledger.fee_asset_alignment,
   distributable_fee_separation,
   fee_cash_included_in_position_mark:false,fee_receivable_included_in_position_mark:false,
   rounding:"FLOOR_EACH_DECLARED_ASSET_CLAIM_THEN_MARK"});
 }catch{return out("REVIEW_REQUIRED",["LP_AMOUNT_OR_ARITHMETIC_INVALID"]);}
}
