import {deduplicateEvents,sortForReplay} from "./event-order.mjs";
const stable=value=>value===null||typeof value!=="object"?JSON.stringify(value):Array.isArray(value)?"["+value.map(stable).join(",")+"]":"{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable(value[k])).join(",")+"}";
const marketScope=m=>stable({chain_id:m?.chain_id,network:m?.network,genesis_hash:m?.genesis_hash??null,token_mint:m?.token_mint,quote_mint:m?.quote_mint,curve_program_id:m?.curve_program_id});
const issue=(list,code,severity="REVIEW")=>{if(!list.some(x=>x.code===code))list.push({code,severity});};
/** Chain coordinates determine order. Block time is only a clock annotation. */
export function auditObservedEventTimeline({events,slotTimes=[],maxClockSkewMs=120000}={}){
 if(!Array.isArray(events)||!Array.isArray(slotTimes)||!Number.isSafeInteger(maxClockSkewMs)||maxClockSkewMs<0)throw Error("INVALID_TIMELINE_INPUT");
 const issues=[];if(events.some(e=>e?.provenance!=="observed_chain"))issue(issues,"MIXED_OR_NON_OBSERVED_PROVENANCE");
 let unique,ordered;
 try{
  unique=deduplicateEvents(events);
  if(new Set(unique.map(e=>marketScope(e.market))).size>1)issue(issues,"MIXED_MARKET_IDENTITY");
  if(unique.some(e=>e.market?.genesis_hash!=null&&(typeof e.market.genesis_hash!=="string"||!e.market.genesis_hash.trim()||e.market.genesis_hash.length>256||e.market.genesis_hash.trim()!==e.market.genesis_hash)))issue(issues,"INVALID_EVENT_GENESIS");
  ordered=sortForReplay(unique);
 }catch(error){
  issue(issues,error?.name==="ConflictingDuplicateEventError"?"CONFLICTING_EVENT_ID":"INCOMPLETE_OR_AMBIGUOUS_EVENT_ORDER");
  return {schema_version:"cook-event-timeline-audit.1",status:"REVIEW_REQUIRED",input_event_count:events.length,unique_event_count:null,ordered_event_ids:[],issues,ordering_basis:"slot/transaction/instruction/inner-instruction/event-sequence",block_time_used_for_ordering:false};
 }
 const times=new Map();
 for(const row of slotTimes){
  if(!row||!Number.isSafeInteger(row.slot)||row.slot<0||!Number.isSafeInteger(row.block_time_ms)||row.block_time_ms<0){issue(issues,"INVALID_SLOT_TIME_EVIDENCE");continue;}
  if(times.has(row.slot)&&times.get(row.slot)!==row.block_time_ms)issue(issues,"CONFLICTING_SLOT_TIME_EVIDENCE");
  times.set(row.slot,row.block_time_ms);
 }
 let previousEventTime=null,previousBlockTime=null,previousSlot=null;
 for(const event of ordered){
  const time=event.event_time_ms,slot=event.ordering.slot,blockTime=times.get(slot);
  if(!Number.isSafeInteger(time)||time<0){issue(issues,"INVALID_EVENT_TIME");continue;}
  if(previousEventTime!==null&&time<previousEventTime)issue(issues,"EVENT_TIME_NON_MONOTONIC","WARNING");
  if(blockTime!==undefined&&Math.abs(time-blockTime)>maxClockSkewMs)issue(issues,"EVENT_BLOCK_TIME_SKEW","WARNING");
  if(previousSlot!==null&&slot>previousSlot&&blockTime!==undefined&&previousBlockTime!==null&&blockTime<previousBlockTime)issue(issues,"SLOT_BLOCK_TIME_NON_MONOTONIC","WARNING");
  if(blockTime!==undefined){previousBlockTime=blockTime;previousSlot=slot;}
  previousEventTime=time;
 }
 const hard=issues.some(x=>x.severity==="REVIEW");
 return {schema_version:"cook-event-timeline-audit.1",status:hard?"REVIEW_REQUIRED":issues.length?"WARNING":"CONSISTENT",
  input_event_count:events.length,unique_event_count:unique.length,duplicate_event_count:events.length-unique.length,
  ordered_event_ids:ordered.map(e=>e.event_id),issues,ordering_basis:"slot/transaction/instruction/inner-instruction/event-sequence",
  block_time_used_for_ordering:false,source_attestation:"UNKNOWN"};
}
