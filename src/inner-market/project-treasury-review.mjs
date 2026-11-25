import {createHash} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";
import {assertProjectAggregate} from "./project-aggregate.mjs";
import {matchProjectReport} from "./project-report-identity.mjs";
import {buildProjectFinancialCloseReview} from "./project-financial-close-review.mjs";
import {buildCreatorFeeLedgerReport} from "./creator-fee-ledger-report.mjs";
import {auditReportClosingAccounts} from "./historical-account-set-audit.mjs";
import {loadLinkedReport} from "./order-receipt-review.mjs";
const SOL="So11111111111111111111111111111111111111112";
const sha=x=>createHash("sha256").update(canonicalJson(x),"utf8").digest("hex");
/** One closed interval, no live balances, no cross-report addition, no
 * independently attested ownership, cost basis, valuation or trading authorization. */
export function buildProjectTreasuryReview(projectInput,input){
 const p=assertProjectAggregate(projectInput);
 if(p.network.quote_mint!==SOL||matchProjectReport(p,input).status!=="DECLARED_MATCH")throw Error("PROJECT_TREASURY_SCOPE_MISMATCH");
 const f=buildProjectFinancialCloseReview(input),a=auditReportClosingAccounts(input);
 const creator=buildCreatorFeeLedgerReport({scope:input.scope,creator:input.creator,cash:input.cash});
 const registered=[...new Set(p.wallet_groups.flatMap(g=>g.members.map(m=>m.wallet_address)))].sort();
 const accountEvidence=input.closingAccountEvidence;
 const declared=Array.isArray(accountEvidence?.expectedAccounts)?accountEvidence.expectedAccounts:[];
 const registeredSet=new Set(registered),declaredSet=new Set(declared);
 // accountId is a declared label, not a cryptographically established wallet owner.
 const coverage={registered_wallet_count:registered.length,declared_account_count:declared.length,
  matching_labels:registered.filter(x=>declaredSet.has(x)),missing_registered_labels:registered.filter(x=>!declaredSet.has(x)),
  unmatched_account_labels:declared.filter(x=>!registeredSet.has(x)),status:"UNKNOWN",ownership_attestation:"UNKNOWN"};
 if(declared.length&&registered.length)coverage.status=coverage.missing_registered_labels.length||coverage.unmatched_account_labels.length?"LABEL_SET_DIFFERS":"DECLARED_LABELS_MATCH";
 const issues=[...f.issues,...a.issues],unknown=[...a.missing,"PROJECT_WIDE_WALLET_COVERAGE_UNATTESTED","INDEPENDENT_COST_BASIS_UNATTESTED"];
 if(coverage.status!=="DECLARED_LABELS_MATCH")unknown.push("REGISTERED_ACCOUNT_LABEL_COVERAGE_INCOMPLETE");
 if(f.review_checks.find(x=>x.id==="archived_evidence")?.status!=="PASS")unknown.push("ARCHIVED_RECEIPT_EVIDENCE_INCOMPLETE");
 if(f.valuation_status!=="SUPPLIED_ENDPOINT_ARITHMETIC_CONSISTENT")unknown.push("HISTORICAL_VALUATION_UNAVAILABLE");
 if(f.evidence_coverage.creator_receipt_identity.status==="INCOMPLETE")unknown.push("CREATOR_RECEIPT_IDENTITY_INCOMPLETE");
 if(f.evidence_coverage.cost_basis==="INCOMPLETE")unknown.push("COST_BASIS_COVERAGE_INCOMPLETE");
 if(f.evidence_coverage.realized_pnl==="INCOMPLETE")unknown.push("REALIZED_PNL_COVERAGE_INCOMPLETE");
 for(const issue of creator.issues)issues.push(issue.code);
 if(f.mathematical_audit.status==="REVIEW_REQUIRED")issues.push("FINANCIAL_IDENTITY_MISMATCH");
 const blocked=f.status==="REVIEW_REQUIRED"||a.status==="REVIEW_REQUIRED"||creator.status==="REVIEW_REQUIRED"||f.mathematical_audit.status==="REVIEW_REQUIRED";
 // Budget is a project configuration, not a lifetime cash-flow or current exposure measure.
 // A closed interval can identify recorded gross capital inflow above the configured
 // budget but cannot prove available budget or total historical funding.
 const budget=p.limits.max_project_budget_base_units;
 const inflow=blocked?null:f.cash_flow.external_capital_in_base_units;
 const budgetCheck={configured_budget_base_units:budget,recorded_interval_capital_in_base_units:inflow,
  status:budget===null?"NOT_CONFIGURED":inflow===null?"UNKNOWN":BigInt(inflow)>BigInt(budget)?"RECORDED_INTERVAL_INFLOW_EXCEEDS_CONFIGURED_BUDGET":"INTERVAL_COMPARISON_ONLY",
  remaining_budget_base_units:null,lifetime_funding_base_units:null,current_exposure_base_units:null,
  policy_effective_during_interval:"UNKNOWN",source_attestation:"UNKNOWN"};
 if(budgetCheck.status==="RECORDED_INTERVAL_INFLOW_EXCEEDS_CONFIGURED_BUDGET")issues.push("REVIEW_RECORDED_CAPITAL_INFLOW_AGAINST_CURRENT_BUDGET");
 unknown.push("LIFETIME_FUNDING_AND_POLICY_EFFECTIVE_PERIOD_UNATTESTED");
 const show=x=>blocked?null:x;
 return {schema_version:"cook-project-treasury-review.1",project_id:p.project_id,project_revision:p.revision,
  scope:f.scope,report_digest:sha(input),status:blocked?"REVIEW_REQUIRED":"PARTIAL",
  reporting_basis:"ONE_DECLARED_CLOSED_INTERVAL",cash_flow:show(f.cash_flow),
  inventory:show({closing_quantity_base_units:f.assets.closing_token_quantity_base_units,
    remaining_cost_base_units:f.assets.remaining_inventory_cost_base_units,
    supplied_historical_value_base_units:f.assets.closing_inventory_supplied_value_base_units}),
  realized_pnl:show(f.realized_pnl),creator_receivables:show(f.creator_receivables),
  other_assets_and_liabilities:show({closing_other_assets_base_units:f.assets.closing_other_assets_base_units,
    closing_liabilities_base_units:f.assets.closing_liabilities_base_units,reporting_basis:"SUPPLIED_HISTORICAL_ENDPOINT_ONLY"}),
  historical_valuation:show({status:f.valuation_status,closing_nav_base_units:f.assets.closing_nav_base_units,
    capital_adjusted_nav_change_base_units:f.assets.capital_adjusted_nav_change_base_units,
    closing_inventory_value_minus_cost_base_units:f.assets.closing_inventory_unrealized_value_minus_cost_base_units,
    interval_inventory_unrealized_change_base_units:f.assets.interval_inventory_unrealized_change_base_units,
    nav_bridge_residual_base_units:f.nav_bridge.unexplained_by_cash_basis_pnl_and_inventory_unrealized_change_base_units,
    interpretation:"SUPPLIED_HISTORICAL_ENDPOINTS_ONLY_NOT_REALIZABLE_VALUE"}),
  creator_fee_audit:{status:creator.status,summary:show(creator.summary),pool_fee_bucket_cash_equivalence:"NOT_ESTABLISHED",
    source_attestation:"UNKNOWN",wallet_attribution:"UNKNOWN"},budget_review:budgetCheck,
  account_set:{status:a.status,totals:show(a.totals),expected_account_count:a.expected_account_count??null,observed_account_count:a.observed_account_count??null,coverage},
  mathematical_audit:f.mathematical_audit,evidence_coverage:f.evidence_coverage,issues:[...new Set(issues)],unknown:[...new Set(unknown)],project_wide_total:null,live_balance:null,available_to_trade:null,
  source_attestation:"UNKNOWN",ownership_attestation:"UNKNOWN",valuation_attestation:"UNKNOWN",settlement_allowed:false,execution_enabled:false};
}
export function createProjectTreasuryReviewer({path,enabled}={}){
 return (project,link)=>{
  if(!enabled)throw Error("WORKSPACE_DISABLED");
  return {...buildProjectTreasuryReview(project,loadLinkedReport(project,link,path)),report_link_archive_id:link.archive_id};
 };
}
