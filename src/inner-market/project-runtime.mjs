import {reconcileRuntimeAccountCoverage} from "./runtime-account-coverage.mjs";
import {describeRuntimeMarkets} from "./runtime-market-state.mjs";
import {archiveApplicable} from "./project-evidence-scope.mjs";
const signed=v=>typeof v==="string"&&v.length<=160&&/^(0|-?[1-9][0-9]*)$/.test(v);
const unsigned=v=>signed(v)&&!v.startsWith("-");
const fields=[
 ["capital_in",v=>v.cash_flow?.external_capital_in_base_units,unsigned],
 ["cash",v=>v.cash_flow?.observed_closing_cash_base_units,unsigned],
 ["token_quantity",v=>v.inventory?.closing_quantity_base_units,unsigned],
 ["inventory_cost",v=>v.inventory?.remaining_cost_base_units,unsigned],
 ["inventory_value",v=>v.inventory?.supplied_historical_value_base_units,unsigned],
 ["creator_receivable",v=>v.creator_receivables?.closing_receivable_base_units,unsigned],
 ["creator_cash_income",v=>v.realized_pnl?.creator_cash_income_base_units,unsigned],
 ["realized_pnl",v=>v.realized_pnl?.project_cash_basis_realized_pnl_base_units,signed],
 ["unrealized_value_minus_cost",v=>v.historical_valuation?.closing_inventory_value_minus_cost_base_units,signed],
 ["other_assets",v=>v.other_assets_and_liabilities?.closing_other_assets_base_units,unsigned],
 ["liabilities",v=>v.other_assets_and_liabilities?.closing_liabilities_base_units,unsigned],
 ["nav",v=>v.historical_valuation?.closing_nav_base_units,signed]
];
/** One explicitly linked closed interval per row. Historical accounting is
 * not live capital, availability, ownership or a trading decision. */
export function buildProjectRuntime(project,{archives,intervals,lifecycle,configuration,risk,findings,receipts,operational}){
 const byId=new Map(),duplicate=new Set();
 for(const a of archives.filter(a=>archiveApplicable(project,a))){if(byId.has(a.archive_id))duplicate.add(a.archive_id);else byId.set(a.archive_id,a)}
 const issues=[],unknown=[];
 const rows=intervals.map(i=>{
  const refs=i.reviews.filter(r=>r.kind==="TREASURY_REVIEW");
  const linked=refs.map(r=>byId.get(r.archive_id)).filter(a=>a&&a.kind==="TREASURY_REVIEW"&&!duplicate.has(a.archive_id)&&a.payload.report_link_archive_id===i.archive_id&&a.payload.report_digest===i.report_digest);
  let conflict=linked.length!==refs.length||linked.some(a=>a.payload.status==="REVIEW_REQUIRED"||a.payload.mathematical_audit?.status==="REVIEW_REQUIRED");
  const assets=Object.fromEntries(fields.map(([k])=>[k,null]));
  for(const [k,get,valid] of fields){
   const values=linked.map(a=>get(a.payload));
   const known=values.filter(x=>x!=null);
   if(known.some(x=>!valid(x))||new Set(known).size>1){conflict=true;issues.push({code:"RUNTIME_ASSET_CONFLICT:"+k,reference:i.archive_id});}
   else if(linked.length&&known.length===linked.length&&linked.every(a=>a.payload.status==="PARTIAL"))assets[k]=known[0];
  }
  const account_coverage=reconcileRuntimeAccountCoverage(assets,linked);
  for(const code of account_coverage.issues)issues.push({code,reference:i.archive_id});
  for(const code of account_coverage.unknown)unknown.push({code,reference:i.archive_id});
  conflict=conflict||account_coverage.status==="REVIEW_REQUIRED";
  if(conflict){for(const c of account_coverage.checks){c.project_value=null;c.account_total=null;}for(const k of Object.keys(assets))assets[k]=null;issues.push({code:"RUNTIME_INTERVAL_CONFLICT",reference:i.archive_id});}
  const status=conflict?"REVIEW_REQUIRED":Object.values(assets).every(x=>x!==null)?"DECLARED_ENDPOINT_PRESENT":"INCOMPLETE";
  if(status==="INCOMPLETE")unknown.push({code:"RUNTIME_ASSET_COVERAGE_INCOMPLETE",reference:i.archive_id});
  return {report_link_archive_id:i.archive_id,report_digest:i.report_digest,opening_cutoff:i.opening_cutoff,closing_cutoff:i.closing_cutoff,
   status,assets,account_coverage,lp_assets:null,asset_unit_contract:"TOKEN_BASE_UNITS_FOR_TOKEN_QUANTITY; SOL_LAMPORTS_FOR_OTHER_FIELDS",archive_ids:linked.map(a=>a.archive_id)};
 });
 const market=describeRuntimeMarkets(project,{archives,intervals,lifecycle,operational});
 issues.push(...market.issues);unknown.push(...market.unknown);
 const blocked=market.status==="REVIEW_REQUIRED"||issues.length>0||findings.length>0||configuration.issues.length>0||risk.status==="REVIEW_REQUIRED";
 const work=[
  {id:"configuration",status:configuration.status},
  {id:"issuance_evidence",status:lifecycle.issuance.status},
  {id:"historical_market",status:lifecycle.markets.some(m=>m.status==="REVIEW_REQUIRED")?"REVIEW_REQUIRED":!lifecycle.markets.length?"MISSING":lifecycle.markets.every(m=>m.status==="OBSERVED_NOT_ATTESTED")?"OBSERVED_NOT_ATTESTED":"REGISTRATION_OR_EVIDENCE_INCOMPLETE"},
  {id:"financial_interval",status:rows.length?rows.some(r=>r.status==="REVIEW_REQUIRED")?"REVIEW_REQUIRED":rows.every(r=>r.status==="DECLARED_ENDPOINT_PRESENT")?"DECLARED_ENDPOINTS_PRESENT":"INCOMPLETE":"MISSING"},
  {id:"order_exceptions",status:receipts.some(r=>r.status!=="DECLARED_SAMPLE_MATCH")?"REVIEW_REQUIRED":receipts.length?"DECLARED_MATCH":"UNKNOWN"},
  {id:"independent_source",status:"NOT_RUN"}
 ];
 return {schema_version:"cook-project-runtime.1",project_id:project.project_id,project_revision:project.revision,
  recorded_stage:project.lifecycle.stage,recorded_operational_status:project.lifecycle.operational_status,
  status:blocked?"REVIEW_REQUIRED":"EVIDENCE_INCOMPLETE",work,asset_intervals:rows,
  market,
  risk:{historical_status:risk.status,configuration_issue_count:configuration.issues.length,open_order_count:receipts.filter(r=>r.status!=="DECLARED_SAMPLE_MATCH").length},
  live_assets:null,project_wide_nav:null,selected_interval:null,issues,unknown,real_data_connected:false,execution_enabled:false,settlement_allowed:false,lifecycle_mutated:false,source_attestation:"UNKNOWN"};
}
