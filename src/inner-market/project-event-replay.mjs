import {canonicalJson} from "../core/canonical-json.mjs";
import {assertProjectAggregate,createProjectAggregate,applyProjectCommand} from "./project-aggregate.mjs";
const equal=(a,b)=>canonicalJson(a)===canonicalJson(b);
const tokenConfiguration=t=>({supply_base_units:t.supply_base_units,decimals:t.decimals,creator_wallet_address:t.creator_wallet_address});
/** Reconstruct normalized command input from the existing v1 event payloads.
 * Original pre-normalization request bytes are not retained; their digests
 * cannot be independently recomputed. Replaying a label is not attestation. */
function commandFromEvent(event){
 const p=event.payload;
 switch(event.event_type){
  case "UPDATE_PROFILE":return {profile:p.profile};
  case "UPDATE_DRAFT_CONFIGURATION":return {profile:p.profile,network:p.network,token:tokenConfiguration(p.token),wallet_group:p.wallet_groups.find(g=>g.group_id==="dev-wallets")??null};
  case "SET_NETWORK_IDENTITY":return {network:p.network};
  case "SET_TOKEN_CONFIGURATION":return tokenConfiguration(p.token);
  case "UPSERT_WALLET_GROUP":return {group:p.group};
  case "RECORD_ISSUANCE_EVIDENCE":return {mint:p.mint,signature:p.signature};
  case "VERIFY_ISSUANCE":
  case "CLEAR_REVIEW":return {evidence:p.evidence};
  case "BIND_MARKET":{
   const {market_id,venue,market_account,identity}=p.market;
   return {market:{market_id,venue,market_account,identity}};
  }
  case "VERIFY_MARKET":return {market_id:p.market_id,evidence:p.evidence};
  case "SET_BUDGET_LIMITS":return {limits:p.limits};
  case "SET_OPERATIONAL_STATUS":return {status:p.status};
  case "AUTHORIZE_LOCALNET_EXECUTION":return {approved_by:p.execution_policy.authorization.approved_by,approval_ref:p.execution_policy.authorization.approval_ref};
  case "REVOKE_LOCALNET_EXECUTION":return {reason:p.reason};
  case "TRANSITION_LIFECYCLE":return {to:p.to,evidence:p.evidence,settlement:p.settlement};
  default:throw Error("PROJECT_EVENT_REPLAY_UNSUPPORTED");
 }
}
/** Pure retrospective replay. Never writes state, calls RPC or grants execution.
 * The caller must independently check hashes and store isolation. */
export function replayProjectEvents(events){
 if(!Array.isArray(events)||!events.length)throw Error("PROJECT_EVENT_REPLAY_EMPTY");
 const first=events[0];let project,metadataCompatibleSince=1;
 try{
  const original=assertProjectAggregate(first.payload.aggregate);
  if(first.event_type!=="PROJECT_CREATED"||first.revision!==1||original.revision!==1||first.project_id!==original.project_id||
     first.occurred_at_ms!==original.created_at_ms||first.source!=="application"||
     !equal(first.payload,{aggregate:original})||original.wallet_groups.length>1)throw Error("INVALID_CREATION_EVENT");
  project=createProjectAggregate({project_id:original.project_id,profile:original.profile,network:original.network,
   token:original.token,wallet_group:original.wallet_groups[0]??null,limits:original.limits},{now:()=>first.occurred_at_ms});
  if(!equal(project,original))throw Error("INVALID_CREATION_STATE");
 }catch{throw Error("PROJECT_EVENT_REPLAY_CREATION_INVALID");}
 for(let i=1;i<events.length;i++){
  const event=events[i];
  try{
   if(event.project_id!==project.project_id||event.revision!==i+1||event.source!=="application"||
      !Number.isSafeInteger(event.occurred_at_ms)||event.occurred_at_ms<project.updated_at_ms)throw Error("INVALID_EVENT_SCOPE");
   const applied=applyProjectCommand(project,{type:event.event_type,payload:commandFromEvent(event)},{now:()=>event.occurred_at_ms});
   if(applied.event_type!==event.event_type||applied.aggregate.revision!==event.revision||!equal(applied.payload,event.payload))throw Error("EVENT_PAYLOAD_MISMATCH");
   if(event.event_type!=="UPDATE_PROFILE"||applied.aggregate.profile.symbol!==project.profile.symbol)metadataCompatibleSince=event.revision;
   project=applied.aggregate;
  }catch{throw Error("PROJECT_EVENT_REPLAY_TRANSITION_INVALID");}
 }
 return {aggregate:project,event_count:events.length,metadata_compatible_since_revision:metadataCompatibleSince,semantic_replay:"MATCHABLE",original_request_attestation:"UNKNOWN",source_attestation:"UNKNOWN",execution_enabled:false};
}
