import test from "node:test";
import assert from "node:assert/strict";
import {runParticipantSimulation} from "../src/simulation/participant-simulator.mjs";
import {analyzeMarketQuality} from "../src/core/market-quality-engine.mjs";
test("participant simulation is deterministic and keeps role labels outside detector input",()=>{
 const a=runParticipantSimulation({scenarioId:"test-run",seed:7,steps:120}),b=runParticipantSimulation({scenarioId:"test-run",seed:7,steps:120});
 assert.deepEqual(a.detector_input.events,b.detector_input.events);assert.equal(a.status,"SYNTHETIC_ONLY");assert.ok(a.summary.trade_count>0);
 assert.ok(a.detector_input.events.every(e=>e.provenance==="synthetic"&&!Object.hasOwn(e,"simulated_actor_ref")));
 assert.ok(a.ground_truth.length>0);assert.equal(a.execution_enabled,false);
 assert.equal(analyzeMarketQuality({events:a.detector_input.events}).execution_enabled,false);
});
test("different seeds create different synthetic paths",()=>{
 const a=runParticipantSimulation({scenarioId:"test-run",seed:7,steps:100}),b=runParticipantSimulation({scenarioId:"test-run",seed:8,steps:100});
 assert.notDeepEqual(a.detector_input.events,b.detector_input.events);
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
