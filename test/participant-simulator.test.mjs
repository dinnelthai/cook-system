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
