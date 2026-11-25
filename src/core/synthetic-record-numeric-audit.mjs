/** Retrospective numeric checks for completed illustrative simulator records.
 * No quote generation, strategy, transaction construction or live integration.
 * Fee evidence is a declared fixture convention, not actual fee attribution. */
const amount=(v,positive=false)=>typeof v==="string"&&v.length<=39&&/^(0|[1-9][0-9]*)$/.test(v)&&(!positive||v!=="0")?BigInt(v):null;
const SCALE=1000000000000n;
function scaledPrice(value){
 if(typeof value!=="string"||value.length>53||!/^(0|[1-9][0-9]*)(\.[0-9]{1,12})?$/.test(value))return null;
 const [whole,fraction=""]=value.split(".");
 return BigInt(whole)*SCALE+BigInt(fraction.padEnd(12,"0"));
}
export function auditSyntheticRecordNumbers(report){
 const d=report.detector_input,events=d.events;
 const trades=events.filter(e=>e.event_kind!=="PUBLIC_INFORMATION");
 const versions=new Set(events.map(e=>e.synthetic_metadata?.generator_version));
 const known=versions.size===1&&["participant-simulator.1","participant-simulator.2","participant-simulator.3"].includes([...versions][0]);
 const issues=[],signatures=new Set();
 let invariantChecked=0,invariantDecreases=0,invalidReservePath=false;
 let q=amount(d.initial_state?.quote_reserves_base_units,true),t=amount(d.initial_state?.token_reserves_base_units,true),fees=0n;
 const feeBps=report.summary?.fee_bps,feeKnown=known&&Number.isSafeInteger(feeBps)&&feeBps>=0&&feeBps<10000;
 if(q===null||t===null)issues.push("INVALID_OPENING_RESERVES");
 if(known&&!feeKnown)issues.push("INVALID_DECLARED_FEE_RATE");
 for(const e of trades){
  const p=e.payload??{},id=e.event_id,buy=e.event_kind==="CURVE_BUY_EXECUTED";
  const cash=amount(p.quote_amount_base_units,true),token=amount(p.token_amount_base_units,true);
  if(cash===null||token===null){issues.push("INVALID_NUMERIC_TRADE:"+id);continue;}
  if(typeof p.signature!=="string"||!p.signature.trim()||signatures.has(p.signature))issues.push("INVALID_OR_DUPLICATE_TRADE_SIGNATURE:"+id);
  signatures.add(p.signature);
  if(known){
   const price=scaledPrice(p.execution_price_decimal);
   // Cross-multiplication checks the declared 12-place truncation interval.
   if(price===null||price<=0n||price*token>cash*SCALE||(price+1n)*token<=cash*SCALE)issues.push("RECORDED_PRICE_MISMATCH:"+id);
   let fee=0n,feeValid=Array.isArray(p.fee_components)&&p.fee_components.length<=1;
   if(feeValid)for(const c of p.fee_components){
    const v=amount(c?.amount_base_units,true);
    if(v===null||c.fee_type!=="simulated_pool_fee"||c.mint!==d.market.quote_mint){feeValid=false;break;}
    fee+=v;
   }
   if(!feeValid)issues.push("INVALID_RECORDED_FEE_COMPONENT:"+id);
   else{
    fees+=fee;
    const gross=buy?cash:cash+fee,net=buy?cash-fee:cash;
    if(net<0n||feeKnown&&net!==gross*BigInt(10000-feeBps)/10000n)issues.push("RECORDED_FEE_ARITHMETIC_MISMATCH:"+id);
   }
  }
  if(q!==null&&t!==null){
   const priorProduct=q*t,priorPositive=q>0n&&t>0n;
   q+=buy?cash:-cash;t+=buy?-token:token;
   if(q<=0n||t<=0n){issues.push("NONPOSITIVE_RECORDED_RESERVE:"+id);invalidReservePath=true;}
   else if(priorPositive){invariantChecked++;if(q*t<priorProduct)invariantDecreases++;}
  }
 }
 if(q===null||t===null||q.toString()!==d.final_state?.quote_reserves_base_units||t.toString()!==d.final_state?.token_reserves_base_units)issues.push("RECORDED_RESERVE_ENDPOINT_MISMATCH");
 return {status:issues.length?"REVIEW_REQUIRED":trades.length&&known?"PASS":"UNKNOWN",
  issues,trade_count:trades.length,declared_fee_total_base_units:known&&!issues.length?fees.toString():null,
  fee_convention:known?"SYNTHETIC_EMBEDDED_POOL_FEE":"UNVERIFIED_GENERATOR",
  reserve_product_diagnostic:{status:!known||invalidReservePath||invariantChecked!==trades.length||!trades.length||issues.length?"UNKNOWN":invariantDecreases?"REVIEW_REQUIRED":"NO_DECREASE_OBSERVED",
   checked_record_count:invariantChecked,decrease_count:invariantDecreases,interpretation:"RECORDED_RESERVE_PRODUCT_ONLY_NOT_PROTOCOL_PARITY"},
  invariant_model_verified:false,independent_fee_attestation:"UNKNOWN",execution_enabled:false};
}
