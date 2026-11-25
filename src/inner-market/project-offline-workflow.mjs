import {assertProjectAggregate} from "./project-aggregate.mjs";

/** Static configuration audit only. Caps are declarations, not balances,
 * reserved funding, available capital, or permission to trade. */
export function reviewProjectConfiguration(input){
 const p=assertProjectAggregate(input),issues=[],missing=[];
 const {limits:l,token:t,network:n}=p;
 const check=(condition,code)=>{if(!condition)missing.push(code)};
 check(n.genesis_hash!==null,"GENESIS_NOT_CONFIGURED");
 check(t.supply_base_units!==null&&t.decimals!==null,"TOKEN_SUPPLY_NOT_CONFIGURED");
 check(t.creator_wallet_address!==null,"CREATOR_NOT_CONFIGURED");
 const members=p.wallet_groups.flatMap(g=>g.members);
 const active=members.filter(m=>m.enabled&&m.role!=="OBSERVER");
 const creator=active.find(m=>m.role==="DEV"&&m.wallet_address===t.creator_wallet_address);
 check(Boolean(creator),"ACTIVE_CREATOR_REGISTRATION_MISSING");
 for(const key of ["max_project_budget_base_units","max_order_size_base_units","max_wallet_exposure_base_units","max_drawdown_bps"]){
  check(l[key]!==null,"LIMIT_NOT_CONFIGURED:"+key);
 }
 const budget=l.max_project_budget_base_units===null?null:BigInt(l.max_project_budget_base_units);
 const order=l.max_order_size_base_units===null?null:BigInt(l.max_order_size_base_units);
 const exposure=l.max_wallet_exposure_base_units===null?null:BigInt(l.max_wallet_exposure_base_units);
 if(budget!==null&&order!==null&&order>budget)issues.push("ORDER_CAP_ABOVE_PROJECT_CAP");
 if(budget!==null&&exposure!==null&&exposure>budget)issues.push("WALLET_CAP_ABOVE_PROJECT_CAP");
 if(order!==null&&exposure!==null&&order>exposure)issues.push("ORDER_CAP_ABOVE_WALLET_CAP");
 let sum=0n,unconfigured=0;
 for(const m of active){
  if(m.allocation_limit_base_units===null){unconfigured++;continue}
  const v=BigInt(m.allocation_limit_base_units);sum+=v;
  if(budget!==null&&v>budget)issues.push("MEMBER_CAP_ABOVE_PROJECT_CAP");
  if(exposure!==null&&v>exposure)issues.push("MEMBER_CAP_ABOVE_WALLET_CAP");
 }
 if(unconfigured)missing.push("ACTIVE_MEMBER_CAPS_INCOMPLETE");
 // Overlapping caps are not additive reservations. Flag for human review only.
 const warnings=budget!==null&&sum>budget?["SUM_OF_DECLARED_CAPS_ABOVE_PROJECT_CAP"]: [];
 return {schema_version:"cook-project-configuration-review.1",project_id:p.project_id,project_revision:p.revision,
  status:issues.length?"REVIEW_REQUIRED":missing.length?"CONFIGURATION_INCOMPLETE":warnings.length?"REVIEW_RECOMMENDED":"DECLARATIONS_PRESENT",
  issues:[...new Set(issues)],missing,warnings,
  budget:{configured_project_cap_base_units:l.max_project_budget_base_units,configured_wallet_cap_base_units:l.max_wallet_exposure_base_units,
   configured_order_cap_base_units:l.max_order_size_base_units,sum_of_known_declared_member_caps_base_units:sum.toString(),
   members_missing_cap:unconfigured,available_balance:null,remaining_budget:null,actual_exposure:null},
  wallets:{registered_count:members.length,enabled_non_observer_count:active.length,creator_registered:!!creator,ownership_attestation:"UNKNOWN"},
  issuance:{registered_status:t.issuance_status,observed:false},source_attestation:"UNKNOWN",execution_enabled:false};
}

/** Projection only: preserve each independent evidence interval. No totals across
 * intervals, no inferred coverage, no automatic transitions. */
export function describeOfflineWorkflow({configuration,lifecycle,intervals,receipts,risk,findings}){
 const states=intervals.map(i=>{
  const kinds=["TREASURY_REVIEW","MARKET_EVIDENCE_REVIEW","PROJECT_CLOSE_REVIEW"];
  const rows=kinds.map(kind=>{
   const matches=i.reviews.filter(r=>r.kind===kind);
   return {kind,status:matches.some(r=>r.status==="REVIEW_REQUIRED")?"REVIEW_REQUIRED":matches.length?"DECLARED_PRESENT":"MISSING",
    archive_ids:matches.map(r=>r.archive_id)};
  });
  return {report_link_archive_id:i.archive_id,report_digest:i.report_digest,opening_cutoff:i.opening_cutoff,closing_cutoff:i.closing_cutoff,
   evidence:rows,status:rows.some(r=>r.status==="REVIEW_REQUIRED")?"REVIEW_REQUIRED":rows.some(r=>r.status==="MISSING")?"INCOMPLETE":"DECLARED_PRESENT"};
 });
 const conflict=configuration.issues.length>0||findings.length>0||risk.status==="REVIEW_REQUIRED"||states.some(s=>s.status==="REVIEW_REQUIRED");
 return {schema_version:"cook-offline-workflow.1",status:conflict?"REVIEW_REQUIRED":"EVIDENCE_INCOMPLETE",
  recorded_stage:lifecycle.recorded_stage,configuration_status:configuration.status,
  lifecycle_blockers:[...lifecycle.blockers],intervals:states,
  unresolved_order_count:receipts.filter(r=>r.status!=="DECLARED_SAMPLE_MATCH").length,
  independent_coverage:"UNKNOWN",cross_interval_totals:null,real_data_connected:false,
  execution_enabled:false,settlement_allowed:false,lifecycle_mutated:false};
}
