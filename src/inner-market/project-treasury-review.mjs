import {createHash} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";
import {assertProjectAggregate} from "./project-aggregate.mjs";
import {matchProjectReport} from "./project-report-identity.mjs";
import {buildProjectFinancialCloseReview} from "./project-financial-close-review.mjs";
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
 const blocked=f.status==="REVIEW_REQUIRED"||a.status==="REVIEW_REQUIRED";
 const show=x=>blocked?null:x;
 return {schema_version:"cook-project-treasury-review.1",project_id:p.project_id,project_revision:p.revision,
  scope:f.scope,report_digest:sha(input),status:blocked?"REVIEW_REQUIRED":"PARTIAL",
  reporting_basis:"ONE_DECLARED_CLOSED_INTERVAL",cash_flow:show(f.cash_flow),
  inventory:show({closing_quantity_base_units:f.assets.closing_token_quantity_base_units,
    remaining_cost_base_units:f.assets.remaining_inventory_cost_base_units,
    supplied_historical_value_base_units:f.assets.closing_inventory_supplied_value_base_units}),
  realized_pnl:show(f.realized_pnl),creator_receivables:show(f.creator_receivables),
  account_set:{status:a.status,totals:show(a.totals),expected_account_count:a.expected_account_count??null,observed_account_count:a.observed_account_count??null,coverage},
  issues:[...new Set(issues)],unknown:[...new Set(unknown)],project_wide_total:null,live_balance:null,available_to_trade:null,
  source_attestation:"UNKNOWN",ownership_attestation:"UNKNOWN",valuation_attestation:"UNKNOWN",settlement_allowed:false,execution_enabled:false};
}
export function createProjectTreasuryReviewer({path,enabled}={}){
 return (project,link)=>{
  if(!enabled)throw Error("WORKSPACE_DISABLED");
  return {...buildProjectTreasuryReview(project,loadLinkedReport(project,link,path)),report_link_archive_id:link.archive_id};
 };
}
