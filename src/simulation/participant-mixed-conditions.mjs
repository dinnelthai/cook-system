import {canonicalJson} from "../core/canonical-json.mjs";
import {reviewParticipantObservationCoverage} from "./participant-observation-model.mjs";
import {reviewParticipantStates} from "./participant-state-review.mjs";
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const passive=new Set(["issuer_dev","kol_broadcaster","mev_ordering","observer"]);
/** Fixed mixed data-quality cohorts on a completed synthetic fixture.
 * No observation is fed back into trading, no inferred behavior or ownership,
 * no new actor decisions. Reuse the canonical replay and observation clock. */
export function reviewMixedParticipantConditions(report,{seed=42}={}){
 if(!Number.isSafeInteger(seed)||report?.status!=="SYNTHETIC_ONLY"||report.execution_enabled!==false||
   !Array.isArray(report.agent_states)||report.agent_states.length<4||report.agent_states.length>256)throw Error("INVALID_MIXED_PARTICIPANT_FIXTURE");
 const before=canonicalJson(report),state=reviewParticipantStates(report);
 if(state.status!=="INTERNALLY_CONSISTENT")throw Error("INVALID_CANONICAL_FIXTURE");
 const events=report.detector_input.events;
 if(!events.length||events.length*report.agent_states.length>3000000)throw Error("MIXED_PARTICIPANT_WORK_LIMIT");
 const first=events[0].event_time_ms,last=events.at(-1).event_time_ms;
 const agents=[...report.agent_states].sort((a,b)=>cmp(a.agent_id,b.agent_id));
 const modes=[
  {id:"COMPLETE",observation_latency_ms:0,missing_record_bps:0,delivery_jitter_ms:0},
  {id:"DELAYED",observation_latency_ms:5000,missing_record_bps:0,delivery_jitter_ms:0},
  {id:"OUTAGE",observation_latency_ms:0,missing_record_bps:10000,delivery_jitter_ms:0},
  {id:"IRREGULAR",observation_latency_ms:250,missing_record_bps:0,delivery_jitter_ms:5000}
 ];
 const assignment=new Map(agents.map((a,i)=>[a.agent_id,modes[i%4]]));
 const profiles=agents.map(a=>{const {id,...profile}=assignment.get(a.agent_id);return {agent_id:a.agent_id,...profile};});
 const checkpoints=[...new Set([first,last,last+5250])];
 const observation=reviewParticipantObservationCoverage(report,{seed,profiles,checkpoints});
 const checks=[],check=(id,passed)=>checks.push({id,passed:passed===true});
 const cohortRows=modes.map(m=>{
  const rows=observation.observers.filter(o=>assignment.get(o.agent_id).id===m.id);
  return {cohort:m.id,observer_count:rows.length,first_received_count:rows.reduce((n,o)=>n+o.samples[0].received_record_count,0),
   final_received_count:rows.reduce((n,o)=>n+o.samples.at(-1).received_record_count,0),
   final_missing_count:rows.reduce((n,o)=>n+o.samples.at(-1).missing_after_due_count,0),
   final_pending_count:rows.reduce((n,o)=>n+o.samples.at(-1).not_yet_due_record_count,0)};
 });
 check("all_fixed_cohorts_present",cohortRows.every(r=>r.observer_count>0));
 check("mixed_observation_accounting",observation.observers.every(o=>o.samples.every(s=>
  s.oracle_record_count===s.received_record_count+s.not_yet_due_record_count+s.missing_after_due_count)));
 check("no_future_observation",observation.observers.every(o=>o.samples.every(s=>
  s.received_record_count<=events.filter(e=>e.event_time_ms+o.profile.observation_latency_ms<=s.checkpoint_ms).length&&
  (s.latest_observed_event_age_ms===null||s.latest_observed_event_age_ms>=0))));
 check("delayed_first_observation",observation.observers.filter(o=>assignment.get(o.agent_id).id==="DELAYED").every(o=>o.samples[0].received_record_count===0));
 check("independent_cohort_recovery",cohortRows.every(r=>r.cohort==="OUTAGE"?
  r.final_received_count===0&&r.final_missing_count===events.length*r.observer_count&&r.final_pending_count===0:
  r.final_received_count===events.length*r.observer_count&&r.final_missing_count===0&&r.final_pending_count===0));
 const openings=new Map(report.opening_agent_states.map(a=>[a.agent_id,a]));
 const passiveAgents=agents.filter(a=>passive.has(a.role_class));
 const tradingActors=new Set(events.filter(e=>["CURVE_BUY_EXECUTED","CURVE_SELL_EXECUTED"].includes(e.event_kind)).map(e=>e.payload.actor_address));
 check("passive_fixture_roles_unchanged",passiveAgents.every(a=>{
  const o=openings.get(a.agent_id);
  return o&&o.quote_balance_base_units===a.quote_balance_base_units&&o.token_balance_base_units===a.token_balance_base_units&&!tradingActors.has(a.agent_id);
 }));
 check("canonical_fixture_unmodified",canonicalJson(report)===before);
 check("observation_not_behavior_feedback",observation.observation_feedback_to_behavior===false&&observation.execution_enabled===false);
 return {schema_version:"cook-mixed-participant-conditions.1",status:checks.every(c=>c.passed)?"SYNTHETIC_REGRESSION_PASS":"REVIEW_REQUIRED",
  checks,cohorts:cohortRows,passive_fixture_account_count:passiveAgents.length,observation_feedback_to_behavior:false,
  real_market_validated:false,execution_enabled:false};
}
