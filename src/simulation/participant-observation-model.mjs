import {buildUnifiedSyntheticReview} from "../core/unified-synthetic-review.mjs";
import {createFixtureRandomStream} from "./fixture-random-stream.mjs";
import {createOfflineObservationClock} from "./offline-observation-clock.mjs";
const id=x=>typeof x==="string"&&x.length>0&&x.length<=128&&x.trim()===x;
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const cmp=(a,b)=>a<b?-1:a>b?1:0;
/** Invented observer QA profiles, not fitted role behavior or order policies.
 * Profiles operate only on an already completed synthetic fixture. */
export function createObserverProfiles(report,seed=42){
 if(!Number.isSafeInteger(seed)||report?.status!=="SYNTHETIC_ONLY"||report.execution_enabled!==false||
    !Array.isArray(report.agent_states)||report.agent_states.length<1||report.agent_states.length>256)throw Error("INVALID_OBSERVER_FIXTURE");
 const ids=report.agent_states.map(a=>a.agent_id);
 if(ids.some(a=>!id(a))||new Set(ids).size!==ids.length)throw Error("INVALID_OBSERVER_FIXTURE");
 return ids.sort(cmp).map(agent_id=>{
  const random=createFixtureRandomStream(seed,"observer-qa-profile",agent_id);
  return {agent_id,observation_latency_ms:[0,250,1000,5000][Math.floor(random()*4)],
   missing_record_bps:[0,500,2000][Math.floor(random()*3)],
   delivery_jitter_ms:[0,100,1000,5000][Math.floor(random()*4)]};
 });
}
/** Retrospective per-observer data coverage. The test oracle knows the complete
 * synthetic history. Neither the observer nor an actual live feed has that oracle.
 * Never feeds observations into trade generation or issuer decisions. */
export function reviewParticipantObservationCoverage(report,{seed=42,profiles=null,checkpoints=null}={}){
 if(!Number.isSafeInteger(seed))throw Error("INVALID_OBSERVER_SEED");
 const audit=buildUnifiedSyntheticReview(report);
 if(audit.status!=="INTERNALLY_CONSISTENT")throw Error("INVALID_CANONICAL_FIXTURE");
 const events=report.detector_input.events;
 const agents=createObserverProfiles(report,seed);
 const expected=new Set(agents.map(a=>a.agent_id));
 const rows=profiles??agents;
 if(!Array.isArray(rows)||rows.length!==expected.size||new Set(rows.map(a=>a?.agent_id)).size!==expected.size||
    rows.some(a=>!a||Object.keys(a).some(k=>!["agent_id","observation_latency_ms","missing_record_bps","delivery_jitter_ms"].includes(k))||
    !expected.has(a.agent_id)||!integer(a.observation_latency_ms,0,60000)||!integer(a.missing_record_bps,0,10000)||!integer(a.delivery_jitter_ms??0,0,60000)))throw Error("INVALID_OBSERVER_PROFILE");
 const end=events.at(-1)?.event_time_ms??0;
 const maxDelay=Math.max(...rows.map(a=>a.observation_latency_ms+(a.delivery_jitter_ms??0)));
 const points=checkpoints??[...new Set([0,Math.floor(end/4),Math.floor(end/2),Math.floor(end*3/4),end,end+Math.max(60000,maxDelay)])];
 if(!Array.isArray(points)||!points.length||points.length>64||points.some((x,i)=>!integer(x,0,Number.MAX_SAFE_INTEGER)||i>0&&x<=points[i-1]))throw Error("INVALID_OBSERVER_CHECKPOINTS");
 if(events.length*rows.length>3000000)throw Error("OBSERVER_WORK_LIMIT");
 const observers=[];
 for(const profile of [...rows].sort((a,b)=>cmp(a.agent_id,b.agent_id))){
  const random=createFixtureRandomStream(seed,"observer-qa-delivery",profile.agent_id);
  const jitter=createFixtureRandomStream(seed,"observer-qa-jitter",profile.agent_id);
  const deliveries=events.map(event=>({time:event.event_time_ms,received:random()*10000>=profile.missing_record_bps,
   arrival:event.event_time_ms+profile.observation_latency_ms+Math.floor(jitter()*((profile.delivery_jitter_ms??0)+1))}));
  if(deliveries.some(d=>!Number.isSafeInteger(d.arrival)))throw Error("OBSERVER_TIMESTAMP_OVERFLOW");
  const clock=createOfflineObservationClock();
  deliveries.forEach((d,i)=>clock.schedule(d.arrival,i));
  let oracleCursor=0,deliveryCursor=0,received=0,lost=0,last=null;
  const samples=[];
  for(const time of points){
   while(oracleCursor<deliveries.length&&deliveries[oracleCursor].time<=time)oracleCursor++;
   for(const item of clock.advanceTo(time)){
    const d=deliveries[item.index];deliveryCursor++;
    if(d.received){received++;last=last===null?d.time:Math.max(last,d.time);}else lost++;
   }
   const delayed=oracleCursor-deliveryCursor;
   samples.push({checkpoint_ms:time,oracle_record_count:oracleCursor,received_record_count:received,
    not_yet_due_record_count:delayed,missing_after_due_count:lost,latest_observed_event_age_ms:last===null?null:time-last,
    status:lost>0?"INCOMPLETE":delayed>0?"DELAYED":oracleCursor===0?"NO_EVENTS_DUE":"MATCHED_TEST_ORACLE"});
  }
  observers.push({agent_id:profile.agent_id,profile:{...profile},samples});
 }
 return {schema_version:"cook-participant-observation-coverage.1",scenario_id:report.detector_input.scenario_id,seed,
  status:"SYNTHETIC_QA_ONLY",observer_count:observers.length,checkpoint_count:points.length,observers,
  canonical_event_count:events.length,observation_clock:"DISCRETE_EVENT_QUEUE",oracle_test_only:true,observation_feedback_to_behavior:false,real_market_validated:false,execution_enabled:false};
}
