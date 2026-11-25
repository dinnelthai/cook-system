import {auditSyntheticLedger} from "../core/synthetic-ledger-audit.mjs";
/** Retrospective accounting of existing offline simulator output only.
 * Uses recorded gross-buy/net-sell cash movements; pool fees are already
 * embedded in those movements. No trade generation, sizing or valuation. */
export function reviewRecordedSyntheticSimulation(report){
 if(report?.schema_version!=="cook-participant-simulation.1"||report.status!=="SYNTHETIC_ONLY"||report.execution_enabled!==false||report.live_rpc_enabled!==false||report.transaction_signing_enabled!==false)throw Error("SYNTHETIC_REPORT_REQUIRED");
 const d=report.detector_input,s=d?.scenario_id;
 if(d?.market?.network!=="synthetic"||d.execution_enabled!==false||!Array.isArray(d.events)||d.events.length>11000||!Array.isArray(report.opening_agent_states)||!Array.isArray(report.agent_states))throw Error("MISSING_SYNTHETIC_LEDGER_EVIDENCE");
 const row=(id,q,t)=>({scenario_id:s,account_id:id,quote_base_units:q,token_base_units:t});
 const agentRows=rows=>rows.map(a=>{if(typeof a.agent_id!=="string"||!a.agent_id.trim())throw Error("INVALID_AGENT_ID");return row("agent:"+a.agent_id,a.quote_balance_base_units,a.token_balance_base_units)});
 const opening=[row("pool",d.initial_state?.quote_reserves_base_units,d.initial_state?.token_reserves_base_units),...agentRows(report.opening_agent_states)];
 const closing=[row("pool",d.final_state?.quote_reserves_base_units,d.final_state?.token_reserves_base_units),...agentRows(report.agent_states)];
 const entries=[],seen=new Set();
 const positive=v=>{if(typeof v!=="string"||!/^[1-9][0-9]*$/.test(v)||v.length>39)throw Error("INVALID_RECORDED_TRADE_AMOUNT");return BigInt(v)};
 for(const e of d.events){
  if(e?.provenance!=="synthetic"||e.synthetic_metadata?.scenario_id!==s||e.synthetic_metadata?.random_seed!==d.seed||e.market?.network!=="synthetic"||e.market?.token_mint!==d.market.token_mint||e.market?.quote_mint!==d.market.quote_mint||typeof e.event_id!=="string"||!e.event_id.trim()||seen.has(e.event_id))throw Error("INVALID_OR_DUPLICATE_SIMULATION_EVENT");
  seen.add(e.event_id);
  if(e.event_kind==="PUBLIC_INFORMATION")continue;
  if(!["CURVE_BUY_EXECUTED","CURVE_SELL_EXECUTED"].includes(e.event_kind))throw Error("UNSUPPORTED_RECORDED_EVENT");
  const p=e.payload;
  if(typeof p?.actor_address!=="string"||!p.actor_address.trim()||p.quote_mint!==d.market.quote_mint)throw Error("INVALID_RECORDED_ACTOR");
  const buy=e.event_kind==="CURVE_BUY_EXECUTED",q=positive(p.quote_amount_base_units)*(buy?-1n:1n),t=positive(p.token_amount_base_units)*(buy?1n:-1n);
  entries.push({scenario_id:s,entry_id:e.event_id+":actor",account_id:"agent:"+p.actor_address,quote_delta_base_units:q.toString(),token_delta_base_units:t.toString()},
   {scenario_id:s,entry_id:e.event_id+":pool",account_id:"pool",quote_delta_base_units:(-q).toString(),token_delta_base_units:(-t).toString()});
 }
 const ledgerInput={sourceMode:"SYNTHETIC",scenarioId:s,opening,closing,entries};
 return {ledger_input:ledgerInput,audit:auditSyntheticLedger(ledgerInput),fee_attribution:"EMBEDDED_IN_RECORDED_CASH_MOVEMENT_NOT_INDEPENDENTLY_VERIFIED"};
}
