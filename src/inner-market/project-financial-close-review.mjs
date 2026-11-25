import {auditFinancialIdentities} from "./financial-identity-audit.mjs";
import {computeTerminalState} from "./terminal-state.mjs";
const diff=(a,b)=>a==null||b==null?null:(BigInt(a)-BigInt(b)).toString();
/** Closed interval financial review, not a liquidation plan, execution quote,
 * or certification of ownership or source evidence. All monetary units are the
 * report's declared quote base units. Do not aggregate unrelated intervals. */
export function buildProjectFinancialCloseReview(input){
 const {state,cash,fees,projectPnl,nav}=computeTerminalState(input);
 const ready=state.status==="REPORT_READY",sample=state.source_mode==="SYNTHETIC",a=state.treasury,t=cash.confirmed_postings_by_kind;
 const shown=v=>ready?v??null:null;
 const endpoints=ready&&state.performance.endpoint_status==="INTERNALLY_CONSISTENT";
 const opening=endpoints?input.nav.endpointEvidence.opening:null,closing=endpoints?input.nav.endpointEvidence.closing:null;
 const closingValue=endpoints?closing?.inventoryValueBaseUnits??null:null,openingValue=endpoints?opening?.inventoryValueBaseUnits??null:null;
 const closingUnrealized=diff(closingValue,a.remaining_cost_basis_base_units),openingUnrealized=opening?diff(openingValue,input.inventory.opening.costBasis):null;
 const closingNav=endpoints?nav.closing_nav_base_units:null,openingNav=endpoints?nav.opening_nav_base_units:null;
 const valuationStatus=endpoints?"SUPPLIED_ENDPOINT_ARITHMETIC_CONSISTENT":state.performance.endpoint_status==="REVIEW_REQUIRED"?"REVIEW_REQUIRED":"UNAVAILABLE";
 const cashFlow={
  opening_cash_base_units:shown(cash.opening_cash_base_units),
  external_capital_in_base_units:shown(t.CAPITAL_IN),
  external_capital_out_base_units:shown(t.CAPITAL_OUT),
  net_external_capital_base_units:shown(cash.capital_net_flow_base_units),
  recorded_trade_cash_cost_base_units:shown(t.TRADE_CASH_COST),
  recorded_net_trade_receipts_base_units:shown(t.TRADE_NET_RECEIPT),
  net_trade_cash_flow_base_units:shown(diff(t.TRADE_NET_RECEIPT,t.TRADE_CASH_COST)),
  creator_fee_cash_receipts_base_units:shown(t.CREATOR_FEE_RECEIVED),
  other_income_base_units:shown(t.OTHER_INCOME),
  issuance_expenses_base_units:shown(t.ISSUANCE_EXPENSE),
  operating_expenses_base_units:shown(t.OPERATING_EXPENSE),
  failed_tx_expenses_base_units:shown(t.FAILED_TX_EXPENSE),
  other_expenses_base_units:shown(t.OTHER_EXPENSE),
  total_separate_expenses_base_units:shown(cash.confirmed_expenses_base_units),
  operating_net_cash_flow_base_units:shown(cash.operating_net_cash_flow_base_units),
  expected_closing_cash_base_units:shown(cash.expected_closing_cash_base_units),
  observed_closing_cash_base_units:shown(cash.observed_closing_cash_base_units),
  closing_cash_difference_base_units:shown(cash.cash_difference_base_units)
 };
 const realized={
  trade_realized_pnl_base_units:shown(projectPnl.trade_realized_pnl_base_units),
  creator_cash_income_base_units:shown(a.creator_cash_income_base_units),
  other_cash_income_base_units:shown(t.OTHER_INCOME),
  separate_expenses_base_units:shown(cash.confirmed_expenses_base_units),
  project_cash_basis_realized_pnl_base_units:shown(a.realized_project_pnl_base_units)
 };
 const receivables={
  opening_receivable_base_units:shown(fees.opening_receivable_base_units),
  accrued_base_units:shown(fees.accrued_base_units),
  cash_received_base_units:shown(fees.verified_cash_income_base_units),
  written_off_base_units:shown(fees.written_off_base_units),
  closing_receivable_base_units:shown(fees.verified_closing_receivable_base_units)
 };
 const assets={
  closing_cash_base_units:shown(a.closing_cash_base_units),
  closing_token_quantity_base_units:shown(a.closing_token_balance_base_units),
  remaining_inventory_cost_base_units:shown(a.remaining_cost_basis_base_units),
  closing_inventory_supplied_value_base_units:closingValue,
  closing_inventory_unrealized_value_minus_cost_base_units:closingUnrealized,
  opening_inventory_unrealized_value_minus_cost_base_units:openingUnrealized,
  interval_inventory_unrealized_change_base_units:diff(closingUnrealized,openingUnrealized),
  closing_creator_receivable_base_units:shown(fees.verified_closing_receivable_base_units),
  closing_other_assets_base_units:closing?.otherAssetsBaseUnits??null,
  closing_liabilities_base_units:closing?.liabilitiesBaseUnits??null,
  opening_nav_base_units:openingNav,closing_nav_base_units:closingNav,
  capital_adjusted_nav_change_base_units:endpoints?nav.capital_adjusted_nav_change_base_units:null
 };
 const residual=assets.capital_adjusted_nav_change_base_units==null||realized.project_cash_basis_realized_pnl_base_units==null||assets.interval_inventory_unrealized_change_base_units==null?null:(BigInt(assets.capital_adjusted_nav_change_base_units)-BigInt(realized.project_cash_basis_realized_pnl_base_units)-BigInt(assets.interval_inventory_unrealized_change_base_units)).toString();
 // Explain the historical NAV residual without assuming it is profit or zero.
 const components={receivable_change_base_units:diff(receivables.closing_receivable_base_units,receivables.opening_receivable_base_units),
  other_asset_change_base_units:endpoints?diff(closing.otherAssetsBaseUnits,opening.otherAssetsBaseUnits):null,
  liability_change_base_units:endpoints?diff(closing.liabilitiesBaseUnits,opening.liabilitiesBaseUnits):null};
 const remaining=residual===null||Object.values(components).some(v=>v===null)?null:
  (BigInt(residual)-BigInt(components.receivable_change_base_units)-BigInt(components.other_asset_change_base_units)+BigInt(components.liability_change_base_units)).toString();
 const report={schema_version:"cook-project-financial-close-review.1",scope:structuredClone(state.scope),source_mode:state.source_mode,status:!ready?"REVIEW_REQUIRED":!endpoints?"ACCOUNTING_CONSISTENT_VALUATION_UNAVAILABLE":"SUPPLIED_ACCOUNTING_AND_ENDPOINTS_CONSISTENT",
  cash_flow:cashFlow,realized_pnl:realized,creator_receivables:receivables,assets,valuation_status:valuationStatus,
  nav_bridge:{unexplained_by_cash_basis_pnl_and_inventory_unrealized_change_base_units:residual,
   ...components,remaining_unexplained_base_units:remaining,interpretation:"RESIDUAL_NOT_PROFIT_OR_RECONCILIATION_PROOF; MAY_INCLUDE_RECEIVABLES_OTHER_ASSETS_LIABILITIES_AND_COST_BASIS_ADJUSTMENTS"},
  review_checks:state.checks.map(({id,status,evidence})=>({id,status,evidence})),issues:state.issues,
  source_attestation:"UNKNOWN",ownership_attestation:"UNKNOWN",valuation_attestation:"UNKNOWN",
  lifetime_funding_base_units:null,liquidation_value_base_units:null,actual_settlement_allowed:false,synthetic_test_settlement_allowed:sample&&state.settlement_allowed===true,execution_enabled:false,
  notes:["Opening cash is not lifetime funding. External capital is not profit.","Net trade receipts are not realized PnL; trade fees are already included in trade cash amounts.","Creator accruals and receivables are not cash receipts.","Inventory value is a supplied historical endpoint, not a realizable sale value. No independent valuation or source verification."]};
 const mathematical_audit=auditFinancialIdentities(report);
 if(mathematical_audit.status==="REVIEW_REQUIRED")return {...report,status:"REVIEW_REQUIRED",issues:[...report.issues,"FINANCIAL_IDENTITY_MISMATCH"],synthetic_test_settlement_allowed:false,mathematical_audit};
 return {...report,mathematical_audit};
}
