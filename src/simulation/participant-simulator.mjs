import {auditSyntheticConservation} from "./synthetic-conservation.mjs";
import {createFixtureRandomStream,shuffledFixtureRound} from "./fixture-random-stream.mjs";
import {describeParticipantModel} from "./participant-model-contract.mjs";
import {validateSyntheticParticipantInputs,readFixtureAmount} from "./participant-input-contract.mjs";
const asBig=readFixtureAmount;
const decimalRatio=(n,d)=>{const q=n*1000000000000n/d,s=q.toString().padStart(13,"0"),fraction=s.slice(-12).replace(/0+$/,"");return fraction?s.slice(0,-12)+"."+fraction:s.slice(0,-12);};
function defaultAgents(scenarioId){
 return [["issuer","issuer_dev","1000000000","100000000000",0.9,3600000],["holder","early_holder","1000000000","250000000000",0.7,1800000],
 ["fast","fast_entry","5000000000","0",0.3,30000],["independent-a","independent_trader","5000000000","0",0.5,300000],
 ["independent-b","independent_trader","5000000000","0",0.4,600000],["retail-a","retail","1000000000","0",0.6,900000],
 ["retail-b","retail","1000000000","0",0.8,900000],["arbitrage","arbitrage","5000000000","0",0.2,10000],
 ["kol","kol_broadcaster","0","0",0.2,0],["mev-observer","mev_ordering","0","0",0.2,0],["observer","observer","0","0",0.5,0]]
 .map(([agent_id,role_class,quote,token,risk,horizon],i)=>({schema_version:"1.0.0",scenario_id:scenarioId,agent_id,role_class,
  quote_balance_base_units:quote,token_balance_base_units:token,risk_aversion:risk,holding_horizon_ms:horizon,
  observation_latency_ms:i*7,execution_latency_ms:i*3,observation_noise:{profile:i%3?"low":"none",scale:i%3?0.02:0},
  public_information_sensitivity:role_class==="retail"?0.7:role_class==="fast_entry"?0.9:0.2,
  transaction_cost_sensitivity:0.5,random_stream_id:scenarioId+":"+agent_id}));
}
/** Deterministic offline simulation. Ground-truth labels are kept outside detector input.
 * No live RPC, wallet signing, self-trading, wash-trading or deceptive-volume logic. */
export function runParticipantSimulation({scenarioId="offline-scenario",seed=42,steps=240,agents=null,initialQuoteReserve="1000000000000",initialTokenReserve="1000000000000",feeBps=30}={}){
 const config=validateSyntheticParticipantInputs({scenarioId,seed,steps,agents:agents??defaultAgents(scenarioId),initialQuoteReserve,initialTokenReserve,feeBps});
 const states=config.agents.map(a=>({...a,quote:asBig(a.quote_balance_base_units),token:asBig(a.token_balance_base_units)}));
 let quote=asBig(initialQuoteReserve,"initial quote reserve"),token=asBig(initialTokenReserve,"initial token reserve");
 if(quote<=0n||token<=0n)throw Error("INVALID_SIMULATION_RESERVES");
 const openingAgentStates=states.map(a=>({agent_id:a.agent_id,quote_balance_base_units:a.quote.toString(),token_balance_base_units:a.token.toString()}));
 const openingTotals={quote:(quote+states.reduce((sum,a)=>sum+a.quote,0n)).toString(),token:(token+states.reduce((sum,a)=>sum+a.token,0n)).toString()};
 const scheduleRandom=createFixtureRandomStream(seed,"schedule"),publicRandom=createFixtureRandomStream(seed,"public-information");
 const orderedAgents=[...states].sort((a,b)=>a.agent_id<b.agent_id?-1:a.agent_id>b.agent_id?1:0);
 const streams=new Map(states.map(a=>[a.agent_id,createFixtureRandomStream(seed,"participant",a.agent_id)]));
 let round=[];
 const events=[],groundTruth=states.map(a=>({schema_version:"1.0.0",scenario_id:scenarioId,agent_id:a.agent_id,simulated_role:a.role_class,
  latent_controller_group:null,ground_truth_behavior_labels:[a.role_class==="arbitrage"?"legitimate_arbitrage":a.role_class==="early_holder"?"early_inventory_holder":a.role_class==="kol_broadcaster"?"organic_public_signal_response":"unknown"]}));
 const market={chain_id:"solana",network:"synthetic",token_mint:"synthetic-token-"+scenarioId,quote_mint:"synthetic-quote",curve_program_id:"synthetic-constant-product",market_phase:"bonding_curve"};
 let sentiment="neutral",seq=0,tradeCount=0,skippedDegenerateRecords=0;
 const push=(kind,time,payload)=>{
  events.push({schema_version:"1.0.0",event_id:scenarioId+":event:"+seq,provenance:"synthetic",event_kind:kind,market,event_time_ms:time,
   ordering:{event_sequence:seq,ordering_confidence:"synthetic"},source:{source_type:"simulator",source_id:"participant-simulator.3"},payload,
   quality:{is_complete:true,validation_status:"valid",warnings:[]},
   synthetic_metadata:{scenario_id:scenarioId,random_seed:seed,generator_version:"participant-simulator.3"}});
  seq++;
 };
 for(let step=0;step<steps;step++){
  const time=step*1000,kol=states.find(a=>a.role_class==="kol_broadcaster");
  if(kol&&step%30===0){sentiment=publicRandom()<0.5?"positive":"negative";push("PUBLIC_INFORMATION",time,{topic:"public_market_update",sentiment,source_reliability:0.5,evidence_reference:"synthetic-public-event"});}
  if(step%states.length===0)round=shuffledFixtureRound(orderedAgents,scheduleRandom);
  const agent=round[step%states.length],random=streams.get(agent.agent_id);
  if(["kol_broadcaster","observer","mev_ordering","issuer_dev"].includes(agent.role_class))continue;
  let side=null,amount=0n;const r=random();
  if(agent.role_class==="early_holder"&&agent.token>0n&&r<0.3){side="sell";amount=agent.token/100n||1n;}
  else if(agent.role_class==="arbitrage"&&r<0.65){side=random()<0.5?"buy":"sell";amount=side==="buy"?agent.quote/100n:agent.token/100n;}
  else if(agent.role_class==="retail"&&sentiment==="positive"&&r<0.55){side="buy";amount=agent.quote/100n;}
  else if(agent.role_class==="fast_entry"&&sentiment!=="neutral"&&r<0.7){side=sentiment==="positive"?"buy":"sell";amount=side==="buy"?agent.quote/80n:agent.token/80n;}
  else if(agent.role_class==="independent_trader"&&r<0.5){side=random()<0.5?"buy":"sell";amount=side==="buy"?agent.quote/120n:agent.token/120n;}
  if(!side||amount<=0n)continue;
  let tokenAmount=0n,quoteAmount=0n,fee=0n;
  if(side==="buy"){
   amount=amount>agent.quote?agent.quote:amount;const effective=amount*BigInt(10000-feeBps)/10000n,k=quote*token;
   const nextToken=k/(quote+effective),out=token-nextToken;
   // Do not emit invalid records or mutate balances for degenerate arithmetic.
   if(effective<=0n||nextToken<=0n||out<=0n||decimalRatio(amount,out)==="0"){skippedDegenerateRecords++;continue;}
   tokenAmount=out;quoteAmount=amount;fee=amount-effective;quote+=amount;token-=out;agent.quote-=amount;agent.token+=out;
  }else{
   amount=amount>agent.token?agent.token:amount;const k=quote*token,nextQuote=k/(token+amount),gross=quote-nextQuote;
   const net=gross*BigInt(10000-feeBps)/10000n;
   if(net<=0n||quote-net<=0n||decimalRatio(net,amount)==="0"){skippedDegenerateRecords++;continue;}
   tokenAmount=amount;quoteAmount=net;fee=gross-net;token+=amount;quote-=net;agent.token-=amount;agent.quote+=net;
  }
  const executionPrice=decimalRatio(quoteAmount,tokenAmount);
  push(side==="buy"?"CURVE_BUY_EXECUTED":"CURVE_SELL_EXECUTED",time+(agent.execution_latency_ms??0),{
   signature:"synthetic-signature-"+tradeCount,actor_address:agent.agent_id,token_amount_base_units:tokenAmount.toString(),
   quote_amount_base_units:quoteAmount.toString(),quote_mint:market.quote_mint,execution_price_decimal:executionPrice,
   fee_components:fee>0n?[{fee_type:"simulated_pool_fee",amount_base_units:fee.toString(),mint:market.quote_mint}]:[]});
  tradeCount++;
 }
 const detectorInput={scenario_id:scenarioId,seed,market,events,initial_state:{quote_reserves_base_units:initialQuoteReserve,token_reserves_base_units:initialTokenReserve},
  final_state:{quote_reserves_base_units:quote.toString(),token_reserves_base_units:token.toString()},execution_enabled:false};
 const agentStates=states.map(a=>({agent_id:a.agent_id,role_class:a.role_class,quote_balance_base_units:a.quote.toString(),token_balance_base_units:a.token.toString()}));
 const conservation=auditSyntheticConservation({openingTotals,finalState:detectorInput.final_state,agentStates});
 return {schema_version:"cook-participant-simulation.1",status:"SYNTHETIC_ONLY",detector_input:detectorInput,ground_truth:groundTruth,
  opening_agent_states:openingAgentStates,agent_states:agentStates,conservation_audit:conservation,model_contract:describeParticipantModel(),fixture_diagnostics:{skipped_degenerate_records:skippedDegenerateRecords,validated_input_contract:true},
  summary:{steps,trade_count:tradeCount,event_count:events.length,agent_count:states.length,fee_bps:feeBps},
  execution_enabled:false,live_rpc_enabled:false,transaction_signing_enabled:false};
}
