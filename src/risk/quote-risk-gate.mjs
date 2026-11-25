import {mkdir,open,rename,unlink,rmdir} from "node:fs/promises";
import {readBoundedRegularFile} from "../core/bounded-private-file.mjs";
import {dirname,join} from "node:path";
import {randomUUID} from "node:crypto";
const SCALE=1000000000000n;
const amount=(v,n)=>{if(typeof v!=="string"||v.length>78||!/^(0|[1-9][0-9]*)$/.test(v))throw Error("invalid "+n);return BigInt(v);};
function price(v,n="price"){
 if(typeof v!=="string"||v.length>64||!/^(0|[1-9][0-9]*)(\.[0-9]{1,12})?$/.test(v))throw Error("invalid "+n);
 const [a,b=""]=v.split(".");const result=BigInt(a)*SCALE+BigInt((b+"0".repeat(12)).slice(0,12));if(result<=0n)throw Error(n+" must be positive");return result;
}
function format(v){const a=(v/SCALE).toString(),b=(v%SCALE).toString().padStart(12,"0").replace(/0+$/,"");return b?a+"."+b:a;}
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
/** Paper quote planner only. It cannot create, sign or submit orders. */
export function evaluateQuotePlan({market,portfolio,policy,riskState=null,nowMs}={}){
 if(!market||!portfolio||!policy||!Number.isSafeInteger(nowMs)||nowMs<0)throw Error("INVALID_QUOTE_PLAN_INPUT");
 for(const k of ["max_market_age_ms","base_spread_bps","min_spread_bps","max_spread_bps","max_inventory_skew_bps","max_drawdown_bps"])
  if(!Number.isSafeInteger(policy[k])||policy[k]<0)throw Error("INVALID_QUOTE_POLICY:"+k);
 if(policy.min_spread_bps>policy.max_spread_bps||policy.base_spread_bps>10000||policy.max_spread_bps>10000||policy.max_inventory_skew_bps>=10000||policy.max_drawdown_bps>10000)throw Error("INVALID_SPREAD_POLICY");
 const reasons=[],halted=riskState?.halted!==false,mid=price(market.mid_price_decimal),observed=market.observed_at_ms;
 if(riskState?.halted!==true&&riskState?.halted!==false)reasons.push("HALT_STATE_UNKNOWN");
 if(!Number.isSafeInteger(observed)||observed<0||observed>nowMs)reasons.push("MARKET_TIMESTAMP_INVALID");
 else if(nowMs-observed>policy.max_market_age_ms)reasons.push("MARKET_DATA_STALE");
 if(!["complete","synthetic"].includes(market.data_completeness))reasons.push("MARKET_DATA_NOT_COMPLETE");
 if(!["IDENTITY_MATCHED_NOT_AUTHENTICATED","SYNTHETIC_ONLY"].includes(market.source_status))reasons.push("SOURCE_NOT_SUFFICIENT_FOR_PAPER_PLAN");
 if(halted)reasons.push("EMERGENCY_HALT_ACTIVE");
 if(!Number.isSafeInteger(portfolio.current_drawdown_bps)||portfolio.current_drawdown_bps<0||portfolio.current_drawdown_bps>policy.max_drawdown_bps)reasons.push("DRAWDOWN_LIMIT");
 const maxInventory=amount(portfolio.max_inventory_value_quote_base_units,"max inventory"),inventory=amount(portfolio.inventory_value_quote_base_units,"inventory value");
 if(maxInventory===0n)reasons.push("MAX_INVENTORY_ZERO");
 const quoteBalance=amount(portfolio.quote_balance_base_units,"quote balance"),baseInventory=amount(portfolio.base_inventory_base_units,"base inventory");
 const maxOrder=amount(policy.max_order_notional_base_units,"max order notional"),maxBaseOrder=amount(policy.max_base_order_base_units,"max base order");
 const volatility=Number.isSafeInteger(market.volatility_bps)&&market.volatility_bps>=0&&market.volatility_bps<=10000?market.volatility_bps:0;
 if(!Number.isSafeInteger(market.volatility_bps)||market.volatility_bps<0||market.volatility_bps>10000)reasons.push("MARKET_VOLATILITY_INVALID");
 const spread=clamp(policy.base_spread_bps+volatility,policy.min_spread_bps,policy.max_spread_bps);
 const inventoryFraction=maxInventory===0n?10000n:(inventory*10000n/maxInventory>10000n?10000n:inventory*10000n/maxInventory);
 const skew=Number(BigInt(policy.max_inventory_skew_bps)*inventoryFraction/10000n),reservation=mid*BigInt(10000-skew)/10000n,half=BigInt(Math.floor(spread/2));
 const bid=reservation*(10000n-half)/10000n,ask=reservation*(10000n+half)/10000n;
 // Reject invalid fixed-precision paper prices rather than silently displaying them as usable.
 if(bid<=0n||ask<=bid)reasons.push("PAPER_PRICE_PRECISION_INVALID");
 const buyNotional=quoteBalance<maxOrder?quoteBalance:maxOrder,sellBase=baseInventory<maxBaseOrder?baseInventory:maxBaseOrder;
 // A nominal spend check is a necessary paper-only bound, not a post-fill valuation.
 const buyWithinNominalLimit=inventory<=maxInventory&&buyNotional<=maxInventory-inventory;
 const buyAllowed=reasons.length===0&&inventory<maxInventory&&buyNotional>0n&&buyWithinNominalLimit;
 const sellAllowed=reasons.length===0&&baseInventory>0n&&maxBaseOrder>0n;
 return {schema_version:"cook-paper-quote-plan.1",status:reasons.length?"BLOCKED":buyAllowed||sellAllowed?"PAPER_PLAN_READY":"NO_QUOTE_CAPACITY",
  market_id:market.market_id??null,observed_at_ms:observed??null,age_ms:Number.isSafeInteger(observed)?nowMs-observed:null,
  quote:{bid_price_decimal:format(bid),ask_price_decimal:format(ask),spread_bps:spread,inventory_skew_bps:skew,
   buy:{enabled:buyAllowed,notional_base_units:buyAllowed?buyNotional.toString():"0",nominal_limit_status:buyWithinNominalLimit?"WITHIN_DECLARED_LIMIT":"WOULD_EXCEED_DECLARED_LIMIT"},
   sell:{enabled:sellAllowed,base_amount_base_units:sellAllowed?sellBase.toString():"0"}},
  reasons,limits:{max_inventory_value_quote_base_units:maxInventory.toString(),inventory_value_quote_base_units:inventory.toString(),
   max_order_notional_base_units:maxOrder.toString(),max_drawdown_bps:policy.max_drawdown_bps},
  paper_only:true,execution_enabled:false,transaction_signing_enabled:false,transaction_submission_enabled:false};
}
export function createEmergencyHaltController({readState,writeState,withWriteLock=fn=>fn()}={}){
 if(typeof readState!=="function"||typeof writeState!=="function")throw Error("HALT_STORAGE_ADAPTER_REQUIRED");
 let pending=Promise.resolve();
 const serialize=fn=>{const task=pending.then(()=>withWriteLock(fn));pending=task.catch(()=>{});return task;};
 async function current(){try{return await readState();}catch{return null;}}
 return {
  async load(){try{const s=await readState();if(!s||s.schema_version!=="cook-emergency-halt.1"||typeof s.halted!=="boolean"||typeof s.reason!=="string"||!s.reason.trim()||!Number.isSafeInteger(s.at_ms)||s.at_ms<0||(!s.halted&&s.operator_confirmed!==true))return {halted:true,reason:"HALT_STATE_INVALID"};return s;}catch{return {halted:true,reason:"HALT_STATE_UNAVAILABLE"};}},
  async halt({reason,atMs}){if(typeof reason!=="string"||!reason.trim()||!Number.isSafeInteger(atMs)||atMs<0)throw Error("INVALID_HALT_REQUEST");const s={schema_version:"cook-emergency-halt.1",halted:true,reason,at_ms:atMs};return serialize(async()=>{const old=await current();if(Number.isSafeInteger(old?.at_ms)&&old.at_ms>=s.at_ms){if(old.at_ms===Number.MAX_SAFE_INTEGER)throw Error("HALT_STATE_VERSION_EXHAUSTED");s.at_ms=old.at_ms+1;}await writeState(s);return s;});},
  async resume({operatorConfirmed,reason,atMs}){if(operatorConfirmed!==true)throw Error("EXPLICIT_OPERATOR_CONFIRMATION_REQUIRED");if(typeof reason!=="string"||!reason.trim()||!Number.isSafeInteger(atMs)||atMs<0)throw Error("INVALID_RESUME_REQUEST");const s={schema_version:"cook-emergency-halt.1",halted:false,reason,at_ms:atMs,operator_confirmed:true};return serialize(async()=>{const old=await current();if(old?.schema_version!=="cook-emergency-halt.1"||old.halted!==true||typeof old.reason!=="string"||!old.reason.trim()||!Number.isSafeInteger(old.at_ms)||old.at_ms<0||s.at_ms<=old.at_ms)throw Error("HALT_STATE_STALE_OR_UNVERIFIED");await writeState(s);return s;});}
 };
}
export function createFileHaltStorage(path){
 if(typeof path!=="string"||!path.trim())throw Error("HALT_FILE_PATH_REQUIRED");
 const lock=path+".lock";
 return {
  async withWriteLock(fn){
   await mkdir(dirname(path),{recursive:true,mode:0o700});
   let held=false;
   for(let i=0;i<80;i++){try{await mkdir(lock,{mode:0o700});held=true;break;}catch(e){if(e.code!=="EEXIST")throw e;await new Promise(resolve=>setTimeout(resolve,25));}}
   if(!held)throw Error("HALT_STATE_LOCK_TIMEOUT");
   try{return await fn();}finally{await rmdir(lock);}
  },
  async readState(){const bytes=await readBoundedRegularFile(path,16384);return JSON.parse(bytes.toString("utf8"));},
  async writeState(state){await mkdir(dirname(path),{recursive:true,mode:0o700});const temp=join(dirname(path),"."+randomUUID()+".halt.tmp"),f=await open(temp,"wx",0o600);
   try{await f.writeFile(JSON.stringify(state)+"\n","utf8");await f.sync();}finally{await f.close();}
   try{await rename(temp,path);}finally{await unlink(temp).catch(e=>{if(e.code!=="ENOENT")throw e;});}
  }
 };
}
