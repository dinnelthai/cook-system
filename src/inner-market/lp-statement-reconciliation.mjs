const unit=v=>typeof v==="string"&&v.length<=160&&/^(0|[1-9][0-9]*)$/.test(v);
/** Reconcile supplied LP accounting statements, not pool-level assets,
 * position placement, executable valuation, or a recommendation.
 * All rows refer to one declared position and closed interval. */
export function reconcileLpStatement(input){
 if(!input||input.source_mode!=="SYNTHETIC"||typeof input.position_id!=="string"||!input.position_id||
    typeof input.opening_cutoff!=="string"||!input.opening_cutoff||typeof input.closing_cutoff!=="string"||!input.closing_cutoff||input.opening_cutoff===input.closing_cutoff)throw Error("INVALID_SYNTHETIC_LP_SCOPE");
 const checks=[],unknown=[],issues=[];
 // Optional explicit fee units. Legacy fixtures remain arithmetic-only.
 const assetId=v=>typeof v==="string"&&v.length>0&&v.length<=128&&v.trim()===v;
 const fee=input.fee_asset,posting=input.cash_posting_asset;
 const unitConflict=(fee!=null&&!assetId(fee))||(posting!=null&&!assetId(posting))||(fee!=null&&posting!=null&&fee!==posting);
 if(unitConflict){issues.push("FEE_ASSET_MISMATCH");checks.push({id:"fee_asset_alignment",status:"REVIEW_REQUIRED",difference:null});}
 const fee_asset_alignment=unitConflict?"REVIEW_REQUIRED":fee!=null&&posting!=null?"DECLARED_MATCH":"UNKNOWN";
 function compare(id,keys,signs){
  const values=keys.map(k=>input[k]);
  if(values.some(v=>v!=null&&!unit(v))){issues.push(id);checks.push({id,status:"REVIEW_REQUIRED",difference:null});return;}
  if(values.some(v=>v==null)){unknown.push(id);checks.push({id,status:"UNKNOWN",difference:null});return;}
  const difference=values.reduce((sum,v,i)=>sum+BigInt(v)*BigInt(signs[i]),0n);
  if(difference!==0n)issues.push(id);
  checks.push({id,status:difference===0n?"PASS":"REVIEW_REQUIRED",difference:difference.toString()});
 }
 compare("lp_units",["closing_lp_units","opening_lp_units","added_lp_units","removed_lp_units"],[1,-1,-1,1]);
 compare("fee_receivable",["closing_fee_receivable","opening_fee_receivable","accrued_fee","received_fee_cash","written_off_fee"],[1,-1,-1,1,1]);
 compare("fee_cash_posting",["received_fee_cash","reconciled_cash_posting"],[1,-1]);
 return {schema_version:"cook-synthetic-lp-statement.1",position_id:input.position_id,status:issues.length?"REVIEW_REQUIRED":unknown.length?"INCOMPLETE":"ARITHMETIC_MATCH",
  checks,issues,unknown,fee_asset_alignment,position_value:null,ownership_attestation:"UNKNOWN",source_mode:"SYNTHETIC",execution_enabled:false};
}
