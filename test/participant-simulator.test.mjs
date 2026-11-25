import test from "node:test";
import assert from "node:assert/strict";
import {runParticipantSimulation} from "../src/simulation/participant-simulator.mjs";
import {analyzeMarketQuality} from "../src/core/market-quality-engine.mjs";
import {reviewRecordedSyntheticSimulation} from "../src/simulation/synthetic-report-ledger.mjs";
test("participant simulation is deterministic and keeps role labels outside detector input",()=>{
 const a=runParticipantSimulation({scenarioId:"test-run",seed:7,steps:120}),b=runParticipantSimulation({scenarioId:"test-run",seed:7,steps:120});
 assert.deepEqual(a.detector_input.events,b.detector_input.events);assert.equal(a.status,"SYNTHETIC_ONLY");assert.ok(a.summary.trade_count>0);
 assert.ok(a.detector_input.events.every(e=>e.provenance==="synthetic"&&!Object.hasOwn(e,"simulated_actor_ref")));
 assert.ok(a.ground_truth.length>0);assert.equal(a.execution_enabled,false);
 assert.equal(analyzeMarketQuality({events:a.detector_input.events}).execution_enabled,false);
});
test("different seeds create different synthetic paths",()=>{
 const a=runParticipantSimulation({scenarioId:"test-run",seed:7,steps:100}),b=runParticipantSimulation({scenarioId:"test-run",seed:8,steps:100});
 const observedPath=r=>r.detector_input.events.map(e=>({kind:e.event_kind,time:e.event_time_ms,payload:e.payload}));
 assert.notDeepEqual(observedPath(a),observedPath(b));
});

test("offline simulation conserves aggregate quote and token balances across fixed seeds",()=>{
 const quoteInitial=1000000000000n+24000000000n;
 const tokenInitial=1000000000000n+350000000000n;
 for(const seed of [7,8,701,702]){
  const r=runParticipantSimulation({scenarioId:"conservation",seed,steps:240});
  const final=r.detector_input.final_state;
  assert.equal(r.agent_states.reduce((n,a)=>n+BigInt(a.quote_balance_base_units),BigInt(final.quote_reserves_base_units)),quoteInitial);
  assert.equal(r.agent_states.reduce((n,a)=>n+BigInt(a.token_balance_base_units),BigInt(final.token_reserves_base_units)),tokenInitial);
 }
});

test("synthetic conservation report matches aggregate opening and closing balances",()=>{
 for(const seed of [0,7,8,701,702]){
  const r=runParticipantSimulation({scenarioId:"conservation-report",seed,steps:120});
  assert.equal(r.conservation_audit.status,"BALANCED");
  assert.equal(r.conservation_audit.quote_difference_base_units,"0");
  assert.equal(r.conservation_audit.token_difference_base_units,"0");
  assert.equal(r.conservation_audit.real_market_validated,false);
 }
});

test("recorded offline simulation can be reconciled per account from opening records and events",()=>{
 for(const seed of [7,8,701]){
  const r=runParticipantSimulation({scenarioId:"ledger-review",seed,steps:240}),v=reviewRecordedSyntheticSimulation(r);
  assert.equal(v.audit.status,"INTERNALLY_CONSISTENT");assert.equal(v.audit.account_count,r.agent_states.length+1);
  assert.equal(v.ledger_input.entries.length,r.summary.trade_count*2);
  assert.ok(v.audit.accounts.every(a=>a.quote_difference_base_units==="0"&&a.token_difference_base_units==="0"));
 }
});
test("offsetting synthetic closing balance changes are detected by the recorded ledger review",()=>{
 const r=runParticipantSimulation({scenarioId:"ledger-review",seed:7,steps:240});
 const a=r.agent_states[0],b=r.agent_states[1];a.quote_balance_base_units=(BigInt(a.quote_balance_base_units)+1n).toString();b.quote_balance_base_units=(BigInt(b.quote_balance_base_units)-1n).toString();
 const v=reviewRecordedSyntheticSimulation(r);assert.equal(v.audit.status,"REVIEW_REQUIRED");assert.equal(v.audit.issues.length,2);
});
test("legacy missing openings and duplicated or cross-scenario recorded events are rejected",()=>{
 for(const mutate of [r=>delete r.opening_agent_states,r=>r.detector_input.events.push(r.detector_input.events[0]),r=>r.detector_input.events[0].synthetic_metadata.scenario_id="other"]){
  const r=runParticipantSimulation({scenarioId:"ledger-review",seed:7,steps:120});mutate(r);assert.throws(()=>reviewRecordedSyntheticSimulation(r));
 }
});

test("offline simulation discloses uncalibrated model and unused parameters outside detector input",()=>{
 const r=runParticipantSimulation({scenarioId:"contract",seed:7,steps:30});
 assert.equal(r.model_contract.status,"UNCALIBRATED_SYNTHETIC_FIXTURE");
 assert.equal(r.model_contract.historical_calibration_status,"NOT_PERFORMED");
 assert.equal(r.model_contract.real_market_accuracy,"UNKNOWN");
 assert.equal(r.model_contract.actual_arbitrage_verified,false);
 assert.equal(r.model_contract.actual_mev_verified,false);
 assert.ok(r.model_contract.parameters.declared_but_unused.includes("holding_horizon_ms"));
 assert.deepEqual(r.model_contract.parameters.timestamp_only,["execution_latency_ms"]);
 assert.equal(Object.hasOwn(r.detector_input,"model_contract"),false);
});
test("model contract is detached and full fixed-input report is reproducible",()=>{
 const args={scenarioId:"contract-repeat",seed:7,steps:30};
 const a=runParticipantSimulation(args),b=runParticipantSimulation(args);assert.deepEqual(a,b);
 a.model_contract.parameters.declared_but_unused.length=0;
 assert.ok(runParticipantSimulation(args).model_contract.parameters.declared_but_unused.length>0);
});

test("v2 separates random domains and records a coherent event sequence",()=>{
 const r=runParticipantSimulation({seed:0,steps:240});
 assert.equal(r.model_contract.scheduling,"SEEDED_SHUFFLED_ROUNDS");
 assert.equal(r.model_contract.domain_separated_random_streams,true);
 assert.ok(r.detector_input.events.every((e,i)=>e.ordering.event_sequence===i&&(i===0||e.event_time_ms>=r.detector_input.events[i-1].event_time_ms)));
 assert.equal(reviewRecordedSyntheticSimulation(r).audit.status,"INTERNALLY_CONSISTENT");
 assert.notDeepEqual(r.detector_input.events,runParticipantSimulation({seed:4294967296,steps:240}).detector_input.events);
});
