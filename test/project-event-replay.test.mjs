import test from "node:test";
import assert from "node:assert/strict";
import {createProjectAggregate,applyProjectCommand} from "../src/inner-market/project-aggregate.mjs";
import {replayProjectEvents} from "../src/inner-market/project-event-replay.mjs";
const base={project_id:"replay-qa",profile:{name:"Replay",symbol:"QA"}};
function fixture(){
 let project=createProjectAggregate(base,{now:()=>100});
 const events=[{event_type:"PROJECT_CREATED",project_id:project.project_id,revision:1,source:"application",occurred_at_ms:100,payload:{aggregate:project}}];
 for(const [type,payload] of [["UPDATE_PROFILE",{profile:{name:"Updated"}}],["SET_BUDGET_LIMITS",{limits:{max_drawdown_bps:100}}],["SET_OPERATIONAL_STATUS",{status:"REVIEW_REQUIRED"}],["CLEAR_REVIEW",{evidence:{kind:"FINAL_RECONCILIATION",source:"internal_audit",verification:"VERIFIED",reference:"synthetic-audit"}}]]){
  const at=100+events.length;const r=applyProjectCommand(project,{type,payload},{now:()=>at});project=r.aggregate;
  events.push({event_type:r.event_type,project_id:project.project_id,revision:project.revision,source:"application",occurred_at_ms:at,payload:r.payload});
 }
 return {project,events};
}
test("pure replay recreates normalized state without source attestation",()=>{
 const {project,events}=fixture(),before=structuredClone(events);
 const r=replayProjectEvents(events);
 assert.deepEqual(r.aggregate,project);assert.deepEqual(events,before);
 assert.equal(r.execution_enabled,false);assert.equal(r.original_request_attestation,"UNKNOWN");
});
test("replay rejects inconsistent payloads, chronology and initial state",()=>{
 const {events}=fixture();
 for(const mutate of [e=>e[1].payload.extra=true,e=>e[2].occurred_at_ms=0,e=>e[3].revision=8]){
  const bad=structuredClone(events);mutate(bad);assert.throws(()=>replayProjectEvents(bad),/PROJECT_EVENT_REPLAY_TRANSITION_INVALID/);
 }
 const bad=structuredClone(events);bad[0].payload.aggregate.lifecycle.stage="READY";
 assert.throws(()=>replayProjectEvents(bad),/PROJECT_EVENT_REPLAY_CREATION_INVALID/);
});
