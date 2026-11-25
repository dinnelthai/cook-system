const roles=new Set(["issuer_dev","early_holder","fast_entry","independent_trader","retail","kol_broadcaster","arbitrage","mev_ordering","observer"]);
const id=(v,max)=>typeof v==="string"&&v.length>0&&v.length<=max&&v.trim()===v;
const int=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const finite=(v,min,max)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;
const MAX=10n**39n-1n;
/** Keep fixture amounts within the existing recorded-ledger format. */
export function readFixtureAmount(v){
 if(typeof v!=="string"||v.length>39||!/^(0|[1-9][0-9]*)$/.test(v))throw Error("INVALID_SIMULATION_AMOUNT");
 return BigInt(v);
}
/** Bounds and normalization only; no role policies or trade decisions. */
export function validateSyntheticParticipantInputs({scenarioId,seed,steps,agents,initialQuoteReserve,initialTokenReserve,feeBps}={}){
 if(!id(scenarioId,128)||!Number.isSafeInteger(seed)||!int(steps,1,10000)||!int(feeBps,0,9999))throw Error("INVALID_SIMULATION_CONFIG");
 if(!Array.isArray(agents)||agents.length<1||agents.length>256)throw Error("INVALID_SIMULATION_AGENT_SET");
 const q=readFixtureAmount(initialQuoteReserve),t=readFixtureAmount(initialTokenReserve);
 if(q===0n||t===0n)throw Error("INVALID_SIMULATION_RESERVES");
 let totalQ=q,totalT=t;const seen=new Set();
 const normalized=agents.map(a=>{
  if(!a||typeof a!=="object"||Array.isArray(a)||!id(a.agent_id,128)||seen.has(a.agent_id)||a.scenario_id!==scenarioId||!roles.has(a.role_class))throw Error("INVALID_SIMULATION_AGENT");
  seen.add(a.agent_id);
  totalQ+=readFixtureAmount(a.quote_balance_base_units);totalT+=readFixtureAmount(a.token_balance_base_units);
  const latency=a.execution_latency_ms??0;
  if(!int(latency,0,999))throw Error("INVALID_SIMULATION_AGENT_LATENCY");
  for(const k of ["risk_aversion","transaction_cost_sensitivity"])if(a[k]!==undefined&&!finite(a[k],0,1000000))throw Error("INVALID_SIMULATION_AGENT_PARAMETER");
  if(a.public_information_sensitivity!==undefined&&!finite(a.public_information_sensitivity,0,1))throw Error("INVALID_SIMULATION_AGENT_PARAMETER");
  for(const k of ["holding_horizon_ms","observation_latency_ms"])if(a[k]!==undefined&&!int(a[k],0,Number.MAX_SAFE_INTEGER))throw Error("INVALID_SIMULATION_AGENT_PARAMETER");
  if(a.observation_noise!==undefined&&(!a.observation_noise||!["none","low","medium","high","custom"].includes(a.observation_noise.profile)||!finite(a.observation_noise.scale,0,1000000)))throw Error("INVALID_SIMULATION_AGENT_PARAMETER");
  if(a.random_stream_id!==undefined&&!id(a.random_stream_id,512))throw Error("INVALID_SIMULATION_AGENT_PARAMETER");
  // Only necessary fields leave this validation boundary. Declared unused
  // parameters are validated, not passed into decision rules.
  return {agent_id:a.agent_id,role_class:a.role_class,scenario_id:a.scenario_id,quote_balance_base_units:a.quote_balance_base_units,
   token_balance_base_units:a.token_balance_base_units,execution_latency_ms:latency};
 });
 if(totalQ>MAX||totalT>MAX)throw Error("SIMULATION_AGGREGATE_AMOUNT_LIMIT");
 return {agents:normalized};
}
