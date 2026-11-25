import {archiveApplicable} from "./project-evidence-scope.mjs";
/** Historical pool review coverage and retrospective order exception queue.
 * Never infer ownership, liquidity availability, or a safe retry. */
export function describeOperationalEvidence(project,archives,receipts){
 const findings=[],unknown=[],pools=[];
 for(const a of archives.filter(a=>a.kind==="GRADUATION_HISTORY_REVIEW"&&archiveApplicable(project,a))){
  const v=a.payload;
  if(!Array.isArray(v.pool_evidence)){unknown.push({code:"POOL_EVIDENCE_NOT_RETAINED",reference:a.archive_id});continue;}
  const seen=new Set();
  for(const p of v.pool_evidence){
   const valid=typeof p.pool_address==="string"&&p.pool_address.length>0&&!seen.has(p.pool_address)&&
    ["PASS","FAIL","UNKNOWN"].includes(p.replay_status)&&["PASS","FAIL","UNKNOWN"].includes(p.snapshot_status);
   seen.add(p.pool_address);
   const binding=project.markets.filter(m=>m.venue==="PUMP_SWAP");
   const linked=p.linked_to_migration===true;
   const conflict=!valid||p.replay_status==="FAIL"||p.snapshot_status==="FAIL"||v.status==="REVIEW_REQUIRED"||
    (linked&&binding.length>0&&!binding.some(m=>m.market_account===p.pool_address));
   const matching=valid&&p.replay_status==="PASS"&&p.snapshot_status==="PASS"&&linked&&!conflict;
   const status=conflict?"REVIEW_REQUIRED":matching?"DECLARED_REPLAY_MATCH":"UNKNOWN";
   if(conflict)findings.push({code:"OUTER_POOL_EVIDENCE_CONFLICT",reference:a.archive_id});
   else if(!matching)unknown.push({code:"OUTER_POOL_EVIDENCE_INCOMPLETE",reference:a.archive_id});
   pools.push({archive_id:a.archive_id,pool_address:typeof p.pool_address==="string"?p.pool_address:null,status,
    snapshot_slot:matching&&Number.isSafeInteger(p.snapshot_slot)&&p.snapshot_slot>=0?p.snapshot_slot:null,
    lp_ownership:"UNKNOWN",live_depth:null});
  }
 }
 const exceptions=receipts.filter(r=>r.status!=="DECLARED_SAMPLE_MATCH").map(r=>({order_id:r.order_id,order_revision:r.order_revision,
  evidence_status:r.status,review_reason:r.status==="REVIEW_REQUIRED"?"CONFLICTING_RECEIPT_EVIDENCE":r.status==="STALE"?"STALE_PROJECT_SCOPE":
  r.status==="UNRESOLVED"?"OUTCOME_UNRESOLVED":"RECEIPT_COVERAGE_INCOMPLETE",retry_allowed:false}));
 return {schema_version:"cook-operational-evidence.1",status:findings.length||exceptions.some(e=>e.evidence_status==="REVIEW_REQUIRED")?"REVIEW_REQUIRED":"EVIDENCE_INCOMPLETE",
  pools,order_exceptions:exceptions,findings,unknown,
  live_liquidity_assessed:false,lp_position_ownership:"UNKNOWN",independent_recovery_verified:false,
  real_data_connected:false,execution_enabled:false,settlement_allowed:false};
}
