// Offline order evidence review. No executable orders, routing, signing or retries.
const id=x=>typeof x==="string"&&x.length>=1&&x.length<=128&&x.trim()===x;
const slot=x=>Number.isSafeInteger(x)&&x>=0;
const signature=x=>typeof x==="string"&&/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(x);
function exact(x,keys){
 if(!x||typeof x!=="object"||Array.isArray(x)||Object.keys(x).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(x,k)))throw Error("INVALID_ORDER_REVIEW_EVENT");
}
export function applyOrderReviewEvent(previous,event){
 exact(event,["type","payload"]);
 const p=event.payload;
 if(event.type==="REGISTER_OBSERVATION"){
  if(previous)throw Error("ORDER_ALREADY_REGISTERED");
  exact(p,["order_id","project_id","project_revision","project_head_hash","source_mode","signature"]);
  if(!id(p.order_id)||!id(p.project_id)||!Number.isSafeInteger(p.project_revision)||p.project_revision<1||
     typeof p.project_head_hash!=="string"||!/^[a-f0-9]{64}$/.test(p.project_head_hash)||
     !["SYNTHETIC","ARCHIVED_HISTORICAL"].includes(p.source_mode)||!signature(p.signature))throw Error("INVALID_ORDER_REVIEW_SCOPE");
  return {...structuredClone(p),revision:1,status:"RECORDED",reported_slot:null,reported_outcome:null,review_reasons:[],
    source_attestation:"UNKNOWN",settlement_allowed:false,execution_enabled:false};
 }
 if(!previous)throw Error("ORDER_NOT_FOUND");
 const next=structuredClone(previous);
 if(event.type==="OBSERVE_OUTCOME"){
  exact(p,["outcome","slot","reference"]);
  if(!["SUCCESS","FAILURE","UNKNOWN"].includes(p.outcome)||!id(p.reference)||
      (p.outcome==="UNKNOWN"?p.slot!==null:!slot(p.slot)))throw Error("INVALID_ORDER_OUTCOME");
  if(next.status==="REVIEW_REQUIRED")throw Error("ORDER_REVIEW_REQUIRED");
  if(p.outcome==="UNKNOWN"){
   if(next.reported_outcome!==null)throw Error("ORDER_OUTCOME_CANNOT_BE_DOWNGRADED");
   next.status="OUTCOME_UNKNOWN";
  }else if(next.reported_outcome!==null&&(next.reported_outcome!==p.outcome||next.reported_slot!==p.slot)){
   next.status="REVIEW_REQUIRED";next.review_reasons.push("CONFLICTING_REPORTED_OUTCOME");
  }else{
   next.reported_outcome=p.outcome;next.reported_slot=p.slot;
   next.status=p.outcome==="SUCCESS"?"REPORTED_SUCCESS":"REPORTED_FAILURE";
  }
 }else if(event.type==="FLAG_REVIEW"){
  exact(p,["reason"]);
  if(!["MISSING_RECEIPT","IDENTITY_CONFLICT","BALANCE_CONFLICT","OPERATOR_REVIEW"].includes(p.reason))throw Error("INVALID_ORDER_REVIEW_REASON");
  next.status="REVIEW_REQUIRED";
  if(!next.review_reasons.includes(p.reason))next.review_reasons.push(p.reason);
 }else throw Error("UNSUPPORTED_ORDER_REVIEW_EVENT");
 next.revision++;
 return next;
}
