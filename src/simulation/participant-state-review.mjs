import {createHash} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";
import {buildUnifiedSyntheticReview} from "../core/unified-synthetic-review.mjs";
import {reviewRecordedSyntheticSimulation} from "../core/synthetic-report-ledger.mjs";
const hash=x=>createHash("sha256").update(canonicalJson(x),"utf8").digest("hex");
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const shape=(q,t)=>q===0n&&t===0n?"EMPTY":q===0n?"TOKEN_ONLY":t===0n?"QUOTE_ONLY":"BOTH_ASSETS";
/** Reconstruct accounting states from a completed synthetic fixture only.
 * State labels describe balances and recorded activity, not intent, exit,
 * trading opportunities, participant policies or decisions. */
export function reviewParticipantStates(report,{checkpoints=null}={}){
 const review=buildUnifiedSyntheticReview(report);
 if(review.status!=="INTERNALLY_CONSISTENT")return {schema_version:"cook-participant-state-review.1",status:"REVIEW_REQUIRED",
  scenario_id:review.scenario_id,issues:review.issues,checkpoints:[],real_market_validated:false,execution_enabled:false};
 const {ledger_input:ledger}=reviewRecordedSyntheticSimulation(report),events=report.detector_input.events;
 const n=events.length,points=checkpoints??[...new Set([0,Math.floor(n/4),Math.floor(n/2),Math.floor(n*3/4),n])];
 if(!Array.isArray(points)||!points.length||points.length>64||points.some((x,i)=>!Number.isSafeInteger(x)||x<0||x>n||i>0&&x<=points[i-1]))throw Error("INVALID_PARTICIPANT_STATE_CHECKPOINTS");
 if(ledger.opening.length*points.length>64000)throw Error("PARTICIPANT_STATE_WORK_LIMIT");
 const accounts=new Map(ledger.opening.map(a=>[a.account_id,{q:BigInt(a.quote_base_units),t:BigInt(a.token_base_units),count:0,changes:0}]));
 const expected=Object.fromEntries(ledger.closing.map(a=>[a.account_id,[a.quote_base_units,a.token_base_units]]));
 const entries=new Map(ledger.entries.map(x=>[x.entry_id,x]));
 const total=()=>[...accounts.values()].reduce(([q,t],a)=>[q+a.q,t+a.t],[0n,0n]);
 const openingTotal=total(),samples=[];let cursor=0;
 for(const count of [...new Set([...points,n])]){
  while(cursor<count){
   const event=events[cursor++];
   if(event.event_kind==="PUBLIC_INFORMATION")continue;
   for(const suffix of [":actor",":pool"]){
    const row=entries.get(event.event_id+suffix),a=accounts.get(row.account_id),before=shape(a.q,a.t);
    a.q+=BigInt(row.quote_delta_base_units);a.t+=BigInt(row.token_delta_base_units);a.count++;
    if(a.q<0n||a.t<0n)throw Error("NEGATIVE_PARTICIPANT_STATE");
    if(before!==shape(a.q,a.t))a.changes++;
   }
   const now=total();
   if(now[0]!==openingTotal[0]||now[1]!==openingTotal[1])throw Error("PARTICIPANT_STATE_CONSERVATION_FAILURE");
  }
  if(points.includes(count)){
   const ordered=[...accounts].sort(([a],[b])=>cmp(a,b));
   const rows=ordered.map(([account_id,a])=>({account_id,quote_balance_base_units:a.q.toString(),token_balance_base_units:a.t.toString(),
    asset_state:shape(a.q,a.t),recorded_activity:a.count===0?"NO_RECORDED_ACTIVITY":"RECORDED_ACTIVITY",
    recorded_posting_count:a.count,asset_state_change_count:a.changes,intent:"UNKNOWN"}));
   const snapshot={processed_event_count:count,through_event_id:count?events[count-1].event_id:null,accounts:rows,
    aggregate_quote_base_units:openingTotal[0].toString(),aggregate_token_base_units:openingTotal[1].toString()};
   samples.push({...snapshot,digest:hash(snapshot)});
  }
 }
 for(const [key,a] of accounts){
  if(expected[key]?.[0]!==a.q.toString()||expected[key]?.[1]!==a.t.toString())throw Error("PARTICIPANT_STATE_ENDPOINT_MISMATCH");
 }
 return {schema_version:"cook-participant-state-review.1",scenario_id:review.scenario_id,status:"INTERNALLY_CONSISTENT",
  canonical_fixture_digest:hash(report),event_count:n,checkpoints:samples,issues:[],endpoint_checked:true,
  behavior_intent_inferred:false,real_market_validated:false,execution_enabled:false};
}
/** Compare a saved checkpoint to a fresh replay of the exact synthetic fixture.
 * This is a recomputation check, not a resumable simulation or authentication. */
export function verifyParticipantStateCheckpoint(report,saved){
 if(!saved||!Number.isSafeInteger(saved.processed_event_count))throw Error("INVALID_PARTICIPANT_STATE_CHECKPOINT");
 const r=reviewParticipantStates(report,{checkpoints:[saved.processed_event_count]});
 const expected=r.checkpoints[0];
 return {status:expected&&canonicalJson(expected)===canonicalJson(saved)?"RECOMPUTED_MATCH":"REVIEW_REQUIRED",
  source_attestation:"UNKNOWN",execution_enabled:false};
}
