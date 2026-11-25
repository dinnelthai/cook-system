import {canonicalJson} from "../core/canonical-json.mjs";
import {replayProjectEvents} from "./project-event-replay.mjs";
/** Retrospective timeline of an existing local journal. A recorded stage is
 * neither verified chain evidence nor permission to transition or execute. */
export function describeRecordedProjectTimeline(project,events){
 const replay=replayProjectEvents(events);
 if(canonicalJson(project)!==canonicalJson(replay.aggregate))throw Error("PROJECT_SNAPSHOT_REPLAY_MISMATCH");
 const first=events[0];
 const stages=[{stage:first.payload.aggregate.lifecycle.stage,revision:1,occurred_at_ms:first.occurred_at_ms,evidence_reference:null}];
 const operational=[{status:first.payload.aggregate.lifecycle.operational_status,revision:1,occurred_at_ms:first.occurred_at_ms}];
 for(const event of events.slice(1)){
  const p=event.payload;
  if(event.event_type==="TRANSITION_LIFECYCLE")stages.push({stage:p.to,revision:event.revision,occurred_at_ms:event.occurred_at_ms,evidence_reference:p.evidence?.reference??null});
  if(["SET_OPERATIONAL_STATUS","CLEAR_REVIEW"].includes(event.event_type))operational.push({status:p.status,revision:event.revision,occurred_at_ms:event.occurred_at_ms});
 }
 return {status:"RECORDED_PATH_REPLAY_MATCH",project_id:project.project_id,project_revision:project.revision,stages,explicit_operational_events:operational,
  recorded_operational_status:project.lifecycle.operational_status,source_attestation:"UNKNOWN",execution_enabled:false};
}
/** Disclose open exceptions; never infer recovery or permit any action. */
export function describeLifecycleExceptions(project,lifecycle,risk){
 if(project.project_id!==lifecycle.project_id||project.revision!==lifecycle.project_revision||
    project.project_id!==risk.project_id||project.revision!==risk.project_revision)throw Error("PROJECT_REVIEW_SCOPE_CONFLICT");
 const critical=risk.findings.filter(f=>f.severity==="CRITICAL").map(f=>f.code);
 const stopped=["EXIT_IN_PROGRESS","SETTLEMENT_PENDING","CLOSED","ARCHIVED"].includes(project.lifecycle.stage);
 const blockers=[...new Set([...lifecycle.blockers,...critical])];
 return {project_id:project.project_id,project_revision:project.revision,
  status:critical.length||project.lifecycle.operational_status==="REVIEW_REQUIRED"?"REVIEW_REQUIRED":"EVIDENCE_INCOMPLETE",
  recorded_stop_stage:stopped?project.lifecycle.stage:null,
  recorded_operational_status:project.lifecycle.operational_status,
  unresolved_order_count:lifecycle.unresolved_order_count,stale_order_count:lifecycle.stale_order_count,
  blockers,critical_findings:critical,independent_recovery_verified:false,settlement_allowed:false,
  source_attestation:"UNKNOWN",execution_enabled:false,lifecycle_mutated:false};
}
