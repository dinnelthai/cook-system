import {archiveApplicable} from "./project-evidence-scope.mjs";
const signed=v=>typeof v==="string"&&v.length<=160&&/^(0|-?[1-9][0-9]*)$/.test(v);
const unsigned=v=>signed(v)&&!v.startsWith("-");
const stages=["LAUNCHED","GRADUATION_PENDING","PUMPSWAP_ACTIVE"];
const validFact=f=>f&&typeof f.signature==="string"&&f.signature.length>0&&Number.isSafeInteger(f.slot)&&f.slot>=0;
const key=f=>JSON.stringify([f.signature,f.slot]);
/** Independent comparison of existing historical review outputs, not a new
 * ledger, settlement authority, or liquidity/market action planner. */
export function reviewProjectContinuity(project,intervals,archives){
 const scoped=archives.filter(a=>archiveApplicable(project,a)),byId=new Map(),duplicate=new Set();
 for(const a of scoped){if(byId.has(a.archive_id))duplicate.add(a.archive_id);else byId.set(a.archive_id,a)}
 const findings=[],unknown=[];
 const add=(list,code,reference)=>list.push({code,reference});
 for(const id of duplicate)add(findings,"CONTINUITY_DUPLICATE_ARCHIVE",id);
 const rows=intervals.map(i=>{
  const checks=[];
  function compare(id,values,{nonnegative=true}={}){
   const refs=values.map(v=>v.ref),known=values.filter(v=>v.value!=null),valid=nonnegative?unsigned:signed;
   const bad=known.some(v=>!valid(v.value));
   const different=!bad&&new Set(known.map(v=>v.value)).size>1;
   const status=bad||different?"REVIEW_REQUIRED":known.length!==values.length||known.length<2?"UNKNOWN":"DECLARED_MATCH";
   if(status==="REVIEW_REQUIRED")add(findings,"CONTINUITY_"+id.toUpperCase()+"_CONFLICT",i.archive_id);
   else if(status==="UNKNOWN")add(unknown,"CONTINUITY_"+id.toUpperCase()+"_INCOMPLETE",i.archive_id);
   checks.push({id,status,archive_ids:refs,compared_values:known.length,declared_value:status==="DECLARED_MATCH"?known[0].value:null});
  }
  const linked=kind=>i.reviews.filter(x=>x.kind===kind).flatMap(x=>{
   const a=byId.get(x.archive_id);
   return a&&!duplicate.has(x.archive_id)&&a.kind===kind&&a.payload.report_digest===i.report_digest&&a.payload.report_link_archive_id===i.archive_id?[a]:[];
  });
  const treasury=linked("TREASURY_REVIEW"),close=linked("PROJECT_CLOSE_REVIEW");
  const T=treasury.filter(a=>a.payload.status==="PARTIAL"),C=close.filter(a=>["PARTIAL","REVIEW_REQUIRED"].includes(a.payload.status));
  const tv=fn=>T.map(a=>({ref:a.archive_id,value:fn(a.payload)}));
  const cv=fn=>C.map(a=>({ref:a.archive_id,value:fn(a.payload)}));
  const residual=(v,kind)=>Array.isArray(v.residuals)?v.residuals.find(x=>x.kind===kind)?.value:null;
  const across=(id,t,c,opts)=>{
   if(!T.length||!C.length){add(unknown,"CONTINUITY_"+id.toUpperCase()+"_INCOMPLETE",i.archive_id);checks.push({id,status:"UNKNOWN",archive_ids:[...T,...C].map(a=>a.archive_id),compared_values:0,declared_value:null});return;}
   compare(id,[...tv(t),...cv(c)],opts);
  };
  across("cash_difference",v=>v.cash_flow?.closing_cash_difference_base_units,v=>v.cash_difference_base_units,{nonnegative:false});
  across("token_inventory",v=>v.inventory?.closing_quantity_base_units,v=>residual(v,"TOKEN_INVENTORY"));
  across("creator_receivable",v=>v.creator_receivables?.closing_receivable_base_units,v=>residual(v,"CREATOR_RECEIVABLE"));
  across("other_assets",v=>v.other_assets_and_liabilities?.closing_other_assets_base_units,v=>residual(v,"OTHER_ASSETS"));
  across("liabilities",v=>v.other_assets_and_liabilities?.closing_liabilities_base_units,v=>residual(v,"LIABILITIES"));
  if(T.length){
   compare("creator_cash_receipt",[...tv(v=>v.cash_flow?.creator_fee_cash_receipts_base_units),...tv(v=>v.creator_receivables?.cash_received_base_units),...tv(v=>v.creator_fee_audit?.summary?.verified_cash_income_base_units)]);
   compare("creator_receivable_subledger",[...tv(v=>v.creator_receivables?.closing_receivable_base_units),...tv(v=>v.creator_fee_audit?.summary?.verified_closing_receivable_base_units)]);
  }
  return {report_link_archive_id:i.archive_id,report_digest:i.report_digest,opening_cutoff:i.opening_cutoff,closing_cutoff:i.closing_cutoff,
   checks,status:checks.some(c=>c.status==="REVIEW_REQUIRED")?"REVIEW_REQUIRED":checks.every(c=>c.status==="DECLARED_MATCH")?"DECLARED_MATCH":"UNKNOWN"};
 });
 const histories=scoped.filter(a=>a.kind==="GRADUATION_HISTORY_REVIEW"&&!duplicate.has(a.archive_id));
 const milestoneRows=stages.map(stage=>{
  const records=histories.flatMap(a=>(Array.isArray(a.payload.milestones)?a.payload.milestones:[]).filter(m=>m.stage===stage).map(m=>({...m,ref:a.archive_id})));
  const facts=records.filter(m=>["RECORDED_NOT_ATTESTED","REPLAY_MATCH_NOT_ATTESTED","MIGRATION_LINK_ONLY"].includes(m.status)&&validFact(m.evidence));
  const conflict=records.some(m=>m.status==="REVIEW_REQUIRED")||new Set(facts.map(m=>key(m.evidence))).size>1;
  if(conflict)add(findings,"CONTINUITY_MILESTONE_CONFLICT:"+stage,null);
  else if(!facts.length)add(unknown,"CONTINUITY_MILESTONE_MISSING:"+stage,null);
  return {stage,status:conflict?"REVIEW_REQUIRED":facts.length?"DECLARED_FACT_PRESENT":"UNKNOWN",archive_ids:records.map(r=>r.ref),fact:!conflict&&facts.length?{signature:facts[0].evidence.signature,slot:facts[0].evidence.slot}:null};
 });
 for(let j=1;j<milestoneRows.length;j++){
  const prev=milestoneRows[j-1],cur=milestoneRows[j];
  if(prev.fact&&cur.fact&&prev.fact.slot>cur.fact.slot)add(findings,"CONTINUITY_MILESTONE_SLOT_ORDER_CONFLICT",null);
 }
 if(milestoneRows[0].fact&&project.token.issuance_signature!==milestoneRows[0].fact.signature)add(findings,"CONTINUITY_ISSUANCE_SIGNATURE_CONFLICT",null);
 return {schema_version:"cook-project-continuity-review.1",status:findings.length?"REVIEW_REQUIRED":"EVIDENCE_INCOMPLETE",intervals:rows,milestones:milestoneRows,findings,unknown,
  migration_financial_parity:"UNKNOWN",liquidity_health:"UNKNOWN",lp_position_ownership:"UNKNOWN",project_wide_settlement:"UNKNOWN",
  source_attestation:"UNKNOWN",execution_enabled:false,settlement_allowed:false,lifecycle_mutated:false};
}
