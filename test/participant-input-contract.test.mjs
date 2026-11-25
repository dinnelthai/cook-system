import test from "node:test";
import assert from "node:assert/strict";
import {runParticipantSimulation} from "../src/simulation/participant-simulator.mjs";
import {buildUnifiedSyntheticReview} from "../src/core/unified-synthetic-review.mjs";
const agent=(id,role="observer",q="0",t="0")=>({scenario_id:"boundary",agent_id:id,role_class:role,quote_balance_base_units:q,token_balance_base_units:t});
const run=(agents,extra={})=>runParticipantSimulation({scenarioId:"boundary",seed:7,steps:120,agents,...extra});
test("input boundary rejects malformed configuration and excessive amounts",()=>{
 for(const a of [agent(" x"),agent("a","bad-role"),{...agent("a"),execution_latency_ms:1000},{...agent("a"),risk_aversion:NaN},{...agent("a"),observation_noise:{profile:"low",scale:-1}},agent("a","observer","9".repeat(40))])assert.throws(()=>run([a]));
 assert.throws(()=>run([agent("a"),agent("a")]),/INVALID_SIMULATION_AGENT/);
 assert.throws(()=>run([agent("a","observer","9".repeat(39))]),/AGGREGATE_AMOUNT_LIMIT/);
 assert.throws(()=>run([agent("a")],{initialQuoteReserve:"0"}),/INVALID_SIMULATION_RESERVES/);
 assert.throws(()=>run([agent("a")],{scenarioId:"x".repeat(129)}),/INVALID_SIMULATION_CONFIG/);
 assert.throws(()=>run(Array(257).fill(agent("a"))),/INVALID_SIMULATION_AGENT_SET/);
});
test("empty accounts produce an internally consistent empty event history",()=>{
 const r=run([agent("a"),agent("b")]);
 assert.equal(r.summary.trade_count,0);assert.equal(r.detector_input.events.length,0);
 assert.equal(buildUnifiedSyntheticReview(r).status,"INTERNALLY_CONSISTENT");
 assert.equal(r.execution_enabled,false);
});
test("tiny synthetic reserves and extreme fees do not create zero reserve or invalid price records",()=>{
 const profiles=[{initialQuoteReserve:"1",initialTokenReserve:"1",feeBps:9999},{initialQuoteReserve:"1",initialTokenReserve:"1000000000000000",feeBps:30},{initialQuoteReserve:"1000000000000000",initialTokenReserve:"1",feeBps:30}];
 for(const p of profiles){
  const r=run([agent("a","independent_trader","10000","10000"),agent("b","early_holder","0","10000")],p);
  assert.ok(BigInt(r.detector_input.final_state.quote_reserves_base_units)>0n);
  assert.ok(BigInt(r.detector_input.final_state.token_reserves_base_units)>0n);
  assert.ok(r.detector_input.events.every(e=>e.event_kind==="PUBLIC_INFORMATION"||Number(e.payload.execution_price_decimal)>0));
  assert.equal(buildUnifiedSyntheticReview(r).status,"INTERNALLY_CONSISTENT");
  assert.equal(r.fixture_diagnostics.validated_input_contract,true);
 }
});
test("unused parameter validation does not modify fixture decisions",()=>{
 const a=agent("a","independent_trader","10000","10000");
 const one=run([a]),two=run([{...a,risk_aversion:0.9,holding_horizon_ms:1234}]);
 assert.deepEqual(one,two);
});

test("every declared unused parameter is excluded from normalized fixture inputs",async()=>{
 const {validateSyntheticParticipantInputs}=await import("../src/simulation/participant-input-contract.mjs");
 const {describeParticipantModel}=await import("../src/simulation/participant-model-contract.mjs");
 const config={scenarioId:"boundary",seed:7,steps:120,initialQuoteReserve:"1000",initialTokenReserve:"1000",feeBps:30};
 const a=agent("a");
 const declarations={risk_aversion:0.9,holding_horizon_ms:1234,observation_latency_ms:500,
  observation_noise:{profile:"high",scale:2},public_information_sensitivity:0.7,transaction_cost_sensitivity:0.5,random_stream_id:"test-stream"};
 assert.deepEqual(Object.keys(declarations).sort(),describeParticipantModel().parameters.declared_but_unused.slice().sort());
 const base=validateSyntheticParticipantInputs({...config,agents:[a]});
 const supplied=validateSyntheticParticipantInputs({...config,agents:[{...a,...declarations}]});
 assert.deepEqual(base,supplied);
 for(const k of Object.keys(declarations))assert.equal(Object.hasOwn(supplied.agents[0],k),false);
 assert.equal(describeParticipantModel().execution_enabled,false);
});

test("timestamp-only input is bounded and not promoted to a behavior parameter",async()=>{
 const {validateSyntheticParticipantInputs}=await import("../src/simulation/participant-input-contract.mjs");
 const {describeParticipantModel}=await import("../src/simulation/participant-model-contract.mjs");
 const config={scenarioId:"boundary",seed:7,steps:120,initialQuoteReserve:"1000",initialTokenReserve:"1000",feeBps:30};
 const a=agent("a");
 assert.deepEqual(describeParticipantModel().parameters.timestamp_only,["execution_latency_ms"]);
 for(const offset of [0,999])assert.equal(validateSyntheticParticipantInputs({...config,agents:[{...a,execution_latency_ms:offset}]}).agents[0].execution_latency_ms,offset);
 for(const offset of [-1,1000,0.5])assert.throws(()=>validateSyntheticParticipantInputs({...config,agents:[{...a,execution_latency_ms:offset}]}),/INVALID_SIMULATION_AGENT_LATENCY/);
});
