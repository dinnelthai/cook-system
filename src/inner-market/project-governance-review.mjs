import {assertProjectAggregate} from "./project-aggregate.mjs";
import {archiveApplicable} from "./project-evidence-scope.mjs";
import {reviewProjectConfiguration} from "./project-offline-workflow.mjs";
const signed=v=>typeof v==="string"&&v.length<=160&&/^(0|-?[1-9][0-9]*)$/.test(v);
const unsigned=v=>signed(v)&&!v.startsWith("-");
/** Registration-only portfolio audit. Shared registrations are not proof of
 * ownership or coordinated activity. No balance aggregation or ranking. */
export function describeProjectDirectory(input){
 if(!Array.isArray(input)||input.length>1000)throw Error("PROJECT_DIRECTORY_LIMIT");
 const projects=input.map(assertProjectAggregate),ids=new Set(),mintMap=new Map(),walletMap=new Map();
 function add(map,k,id){if(!map.has(k))map.set(k,new Set());map.get(k).add(id)}
 for(const p of projects){
  if(ids.has(p.project_id))throw Error("DUPLICATE_DIRECTORY_PROJECT_ID");ids.add(p.project_id);
  const n=p.network;
  // Missing genesis cannot establish a common network.
  if(!n.genesis_hash)continue;
  const scope=[n.chain_id,n.cluster,n.genesis_hash];
  if(p.token.mint)add(mintMap,JSON.stringify([...scope,p.token.mint]),p.project_id);
  for(const g of p.wallet_groups)for(const m of g.members)add(walletMap,JSON.stringify([...scope,m.wallet_address]),p.project_id);
 }
 const overlaps=(map,code)=>[...map.values()].filter(s=>s.size>1).map(s=>({code,project_ids:[...s].sort()}));
 const findings=[...overlaps(mintMap,"DUPLICATE_MINT_REGISTRATION"),...overlaps(walletMap,"SHARED_WALLET_REGISTRATION")];
 const rows=projects.map(p=>({project_id:p.project_id,project_revision:p.revision,stage:p.lifecycle.stage,
  configuration_status:reviewProjectConfiguration(p).status,network_scope_present:!!p.network.genesis_hash,
  registration_overlap_count:findings.filter(f=>f.project_ids.includes(p.project_id)).length}));
 return {schema_version:"cook-project-directory.1",status:findings.length||rows.some(r=>r.configuration_status==="REVIEW_REQUIRED")?"REVIEW_REQUIRED":"EVIDENCE_INCOMPLETE",
  project_count:rows.length,projects:rows,findings,portfolio_nav:null,portfolio_cash:null,
  ownership_attestation:"UNKNOWN",source_attestation:"UNKNOWN",execution_enabled:false};
}

/** Review prerequisites for a transparent issuance, not a token selection
 * score, price forecast or recommendation to launch. */
export function describeLaunchReview(project,configuration){
 const p=assertProjectAggregate(project);
 const checks=[
  {id:"project_description",status:p.profile.description.trim()?"DECLARED_PRESENT":"MISSING"},
  {id:"public_contact",status:p.profile.website||p.profile.telegram||p.profile.twitter?"DECLARED_PRESENT":"MISSING"},
  {id:"configuration",status:configuration.status},
  ...["independent_demand_research","issuer_conflict_disclosures","token_rights_and_authorities","legal_and_platform_review","community_support_plan"].map(id=>({id,status:"NOT_ASSESSED"}))
 ];
 return {status:configuration.issues.length?"REVIEW_REQUIRED":"EVIDENCE_INCOMPLETE",checks,
  launch_recommended:null,market_demand:null,expected_return:null,execution_enabled:false};
}

/** Historical accounting components are canonical outputs, not causal
 * attribution. Keep each archive independent even for identical intervals. */
export function describeHistoricalOperatingComponents(project,intervals,archives){
 const scoped=archives.filter(a=>archiveApplicable(project,a)),byId=new Map(),duplicate=new Set();
 for(const a of scoped){if(byId.has(a.archive_id))duplicate.add(a.archive_id);else byId.set(a.archive_id,a)}
 const findings=[],unknown=[],rows=[];
 for(const i of intervals)for(const r of i.reviews.filter(r=>r.kind==="TREASURY_REVIEW")){
  const a=byId.get(r.archive_id);
  if(!a||duplicate.has(r.archive_id)||a.kind!==r.kind||a.payload.report_digest!==i.report_digest||a.payload.report_link_archive_id!==i.archive_id)continue;
  const v=a.payload,p=v.realized_pnl??{},fields={};
  const definitions=[["trade_realized_pnl_base_units",signed],["creator_cash_income_base_units",unsigned],["other_cash_income_base_units",unsigned],["separate_expenses_base_units",unsigned],["project_cash_basis_realized_pnl_base_units",signed]];
  let invalid=false,missing=false;
  for(const [k,valid] of definitions){
   if(p[k]==null)missing=true;else if(!valid(p[k]))invalid=true;
   fields[k]=v.status==="PARTIAL"&&valid(p[k])?p[k]:null;
  }
  if(v.status==="REVIEW_REQUIRED"||v.mathematical_audit?.status==="REVIEW_REQUIRED"||invalid){
   findings.push({code:"OPERATING_COMPONENTS_CONFLICT",reference:a.archive_id});
   for(const k of Object.keys(fields))fields[k]=null;
  }else if(v.status!=="PARTIAL"||missing||v.mathematical_audit?.status!=="ARITHMETIC_MATCH"){
   unknown.push({code:"OPERATING_COMPONENTS_INCOMPLETE",reference:a.archive_id});
  }
  const state=invalid||v.status==="REVIEW_REQUIRED"||v.mathematical_audit?.status==="REVIEW_REQUIRED"?"REVIEW_REQUIRED":
    missing||v.status!=="PARTIAL"||v.mathematical_audit?.status!=="ARITHMETIC_MATCH"?"PARTIAL":"DECLARED_COMPONENTS_PRESENT";
  rows.push({archive_id:a.archive_id,report_digest:i.report_digest,report_link_archive_id:i.archive_id,opening_cutoff:i.opening_cutoff,closing_cutoff:i.closing_cutoff,
   status:state,components:fields});
 }
 return {status:findings.length?"REVIEW_REQUIRED":"EVIDENCE_INCOMPLETE",rows,findings,unknown,
  project_wide_pnl:null,causal_attribution:"NOT_ESTABLISHED",source_attestation:"UNKNOWN",execution_enabled:false};
}
