import {archiveApplicable} from "./project-evidence-scope.mjs";
import {describeParticipantModel} from "../simulation/participant-model-contract.mjs";

const amount=v=>typeof v==="string"&&v.length<=160&&/^(0|[1-9][0-9]*)$/.test(v);
const count=v=>Number.isSafeInteger(v)&&v>=0;
const status=v=>typeof v==="string"?v:"UNKNOWN";

/** Review already-calculated canonical outputs, scoped to exact report links.
 * No new accounting, quote, behavior or intervention engine. */
export function reviewIntervalModelEvidence(project,intervals,archives){
 const scoped=archives.filter(a=>archiveApplicable(project,a)),byId=new Map(),duplicates=new Set();
 for(const a of scoped){if(byId.has(a.archive_id))duplicates.add(a.archive_id);else byId.set(a.archive_id,a)}
 const findings=[],unknown=[];
 const add=(list,code,reference)=>list.push({code,reference});
 for(const id of duplicates)add(findings,"DUPLICATE_MODEL_EVIDENCE_ARCHIVE_ID",id);
 const rows=intervals.map(i=>{
  const evidence=[];
  for(const link of i.reviews){
   if(!["TREASURY_REVIEW","MARKET_EVIDENCE_REVIEW"].includes(link.kind))continue;
   const a=byId.get(link.archive_id);
   if(!a||duplicates.has(link.archive_id)||a.kind!==link.kind||a.payload.report_digest!==i.report_digest||a.payload.report_link_archive_id!==i.archive_id){
    add(findings,"MODEL_EVIDENCE_LINK_CONFLICT",link.archive_id);continue;
   }
   const v=a.payload,issues=[],missing=[];
   const bad=code=>issues.push(code),absent=code=>missing.push(code);
   const row={archive_id:a.archive_id,kind:a.kind,status:"PARTIAL",reported_status:status(v.status)};
   if(v.status==="REVIEW_REQUIRED")bad("CANONICAL_REVIEW_REQUIRED");
   else if(v.status!=="PARTIAL")absent("CANONICAL_STATUS_UNRECOGNIZED");
   if(a.kind==="TREASURY_REVIEW"){
    const inv=v.inventory,math=v.mathematical_audit;
    const inventory={};
    for(const k of ["closing_quantity_base_units","remaining_cost_base_units","supplied_historical_value_base_units"]){
     const val=inv?.[k];
     if(val==null)absent("INVENTORY_FIELD_MISSING:"+k);
     else if(!amount(val))bad("INVENTORY_FIELD_INVALID:"+k);
     inventory[k]=amount(val)?val:null;
    }
    if(!math)absent("FINANCIAL_IDENTITY_AUDIT_MISSING");
    else if(math.status==="REVIEW_REQUIRED")bad("FINANCIAL_IDENTITY_AUDIT_CONFLICT");
    else if(math.status!=="ARITHMETIC_MATCH")absent("FINANCIAL_IDENTITY_AUDIT_INCOMPLETE");
    const c=math?.counts;
    if(c){
     const valid=[c.pass,c.review_required,c.unknown].every(count);
     if(!valid||!Array.isArray(math.checks)||math.checks.length!==c.pass+c.review_required+c.unknown||
       math.checks.filter(x=>x?.status==="PASS").length!==c.pass||
       math.checks.filter(x=>x?.status==="REVIEW_REQUIRED").length!==c.review_required||
       math.checks.filter(x=>x?.status==="UNKNOWN").length!==c.unknown||
       (math.status==="ARITHMETIC_MATCH"&&(c.unknown!==0||c.review_required!==0||c.pass===0)))bad("FINANCIAL_IDENTITY_COUNT_CONFLICT");
    }else absent("FINANCIAL_IDENTITY_COUNTS_MISSING");
    row.inventory=inventory;row.math_status=status(math?.status);
    row.account_coverage_status=status(v.account_set?.coverage?.status);
    row.valuation_status=status(v.historical_valuation?.status);
    row.creator_fee_status=status(v.creator_fee_audit?.status);
   }else{
    const c=v.participant_coverage;
    if(!c)absent("PARTICIPANT_COVERAGE_MISSING");
    else{
     const n=[c.record_count,c.reconciled_record_count,c.declared_address_record_count,c.missing_address_record_count];
     if(!n.every(count)||n[1]>n[0]||n[2]+n[3]!==n[1]||
       (c.status==="DECLARED_COMPLETE"&&(n[0]===0||n[1]!==n[0]||n[3]!==0))||
       (c.status==="NO_RECORDS"&&n[0]!==0))bad("PARTICIPANT_COVERAGE_COUNT_CONFLICT");
     if(c.status==="REVIEW_REQUIRED")bad("PARTICIPANT_COVERAGE_REVIEW_REQUIRED");
     else if(c.status!=="DECLARED_COMPLETE")absent("PARTICIPANT_COVERAGE_INCOMPLETE");
     if(c.independent_participant_count!=null)bad("UNATTESTED_INDEPENDENT_PARTICIPANT_COUNT");
    }
    const r=v.reserve_evidence;
    if(r?.status==="REVIEW_REQUIRED")bad("RESERVE_EVIDENCE_REVIEW_REQUIRED");
    else if(r?.status!=="DECLARED_FIELDS_PRESENT")absent("RESERVE_EVIDENCE_INCOMPLETE");
    if(v.candle_evidence_status==="REVIEW")bad("CANDLE_EVIDENCE_CONFLICT");
    else if(v.candle_evidence_status!=="PASS")absent("CANDLE_EVIDENCE_NOT_VERIFIED");
    row.participant_coverage_status=status(c?.status);
    row.record_count=count(c?.record_count)?c.record_count:null;
    row.reserve_evidence_status=status(r?.status);
    row.candle_evidence_status=status(v.candle_evidence_status);
    row.independent_participant_count=null;row.current_executable_depth=null;
   }
   row.status=issues.length?"REVIEW_REQUIRED":missing.length?"PARTIAL":"DECLARED_FIELDS_PRESENT";
   if(row.status==="REVIEW_REQUIRED"){
    // Withhold quantitative fields on conflicting evidence.
    if(row.inventory)for(const k of Object.keys(row.inventory))row.inventory[k]=null;
    if("record_count" in row)row.record_count=null;
   }
   for(const code of issues)add(findings,code,a.archive_id);
   for(const code of missing)add(unknown,code,a.archive_id);
   evidence.push(row);
  }
  return {report_link_archive_id:i.archive_id,report_digest:i.report_digest,opening_cutoff:i.opening_cutoff,closing_cutoff:i.closing_cutoff,evidence};
 });
 return {schema_version:"cook-interval-model-evidence.1",status:findings.length?"REVIEW_REQUIRED":"EVIDENCE_INCOMPLETE",
  intervals:rows,findings,unknown,participant_model:describeParticipantModel(),
  live_inventory:null,independent_demand:null,real_market_validated:false,source_attestation:"UNKNOWN",execution_enabled:false};
}
