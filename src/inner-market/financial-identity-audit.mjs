/** Independent cross-check of already calculated closed-interval accounting
 * outputs. No original accounting engine, valuation, forecasts or execution.
 * Missing values remain unknown. Base units are exact signed integers. */
const int=v=>typeof v==="string"&&v.length<=160&&/^(0|-?[1-9][0-9]*)$/.test(v)?BigInt(v):null;
export function auditFinancialIdentities(report){
 const c=report.cash_flow??{},p=report.realized_pnl??{},r=report.creator_receivables??{},a=report.assets??{},b=report.nav_bridge??{};
 const rows=[];
 function identity(id,left,terms){
  const raw=[left,...terms.map(([v])=>v)],values=raw.map(int);
  if(raw.some((x,i)=>x!=null&&values[i]===null)){rows.push({id,status:"REVIEW_REQUIRED",difference_base_units:null,reason:"MALFORMED_AMOUNT"});return;}
  if(values.some(x=>x===null)){rows.push({id,status:"UNKNOWN",difference_base_units:null});return;}
  const residual=values[0]-terms.reduce((s,term,i)=>s+values[i+1]*BigInt(term[1]),0n);
  rows.push({id,status:residual===0n?"PASS":"REVIEW_REQUIRED",difference_base_units:residual.toString()});
 }
 identity("net_capital",c.net_external_capital_base_units,[[c.external_capital_in_base_units,1],[c.external_capital_out_base_units,-1]]);
 identity("net_trade_cash",c.net_trade_cash_flow_base_units,[[c.recorded_net_trade_receipts_base_units,1],[c.recorded_trade_cash_cost_base_units,-1]]);
 identity("operating_cash",c.operating_net_cash_flow_base_units,[[c.recorded_net_trade_receipts_base_units,1],[c.recorded_trade_cash_cost_base_units,-1],[c.creator_fee_cash_receipts_base_units,1],[c.other_income_base_units,1],[c.total_separate_expenses_base_units,-1]]);
 identity("expected_closing_cash",c.expected_closing_cash_base_units,[[c.opening_cash_base_units,1],[c.net_external_capital_base_units,1],[c.operating_net_cash_flow_base_units,1]]);
 identity("closing_cash",c.observed_closing_cash_base_units,[[c.opening_cash_base_units,1],[c.net_external_capital_base_units,1],[c.operating_net_cash_flow_base_units,1]]);
 identity("cash_difference",c.closing_cash_difference_base_units,[[c.observed_closing_cash_base_units,1],[c.expected_closing_cash_base_units,-1]]);
 identity("creator_receivable",r.closing_receivable_base_units,[[r.opening_receivable_base_units,1],[r.accrued_base_units,1],[r.cash_received_base_units,-1],[r.written_off_base_units,-1]]);
 identity("creator_cash_crosscheck",r.cash_received_base_units,[[c.creator_fee_cash_receipts_base_units,1]]);
 identity("realized_cash_basis",p.project_cash_basis_realized_pnl_base_units,[[p.trade_realized_pnl_base_units,1],[p.creator_cash_income_base_units,1],[p.other_cash_income_base_units,1],[p.separate_expenses_base_units,-1]]);
 identity("closing_inventory_mark_minus_cost",a.closing_inventory_unrealized_value_minus_cost_base_units,[[a.closing_inventory_supplied_value_base_units,1],[a.remaining_inventory_cost_base_units,-1]]);
 identity("closing_nav",a.closing_nav_base_units,[[a.closing_cash_base_units,1],[a.closing_inventory_supplied_value_base_units,1],[a.closing_creator_receivable_base_units,1],[a.closing_other_assets_base_units,1],[a.closing_liabilities_base_units,-1]]);
 identity("capital_adjusted_nav",a.capital_adjusted_nav_change_base_units,[[a.closing_nav_base_units,1],[a.opening_nav_base_units,-1],[c.net_external_capital_base_units,-1]]);
 identity("separate_expense_total",c.total_separate_expenses_base_units,[[c.issuance_expenses_base_units,1],[c.operating_expenses_base_units,1],[c.failed_tx_expenses_base_units,1],[c.other_expenses_base_units,1]]);
 identity("realized_creator_cash_crosscheck",p.creator_cash_income_base_units,[[c.creator_fee_cash_receipts_base_units,1]]);
 identity("realized_other_income_crosscheck",p.other_cash_income_base_units,[[c.other_income_base_units,1]]);
 identity("realized_expense_crosscheck",p.separate_expenses_base_units,[[c.total_separate_expenses_base_units,1]]);
 identity("balance_sheet_cash_crosscheck",a.closing_cash_base_units,[[c.observed_closing_cash_base_units,1]]);
 identity("balance_sheet_receivable_crosscheck",a.closing_creator_receivable_base_units,[[r.closing_receivable_base_units,1]]);
 identity("interval_inventory_unrealized_change",a.interval_inventory_unrealized_change_base_units,[[a.closing_inventory_unrealized_value_minus_cost_base_units,1],[a.opening_inventory_unrealized_value_minus_cost_base_units,-1]]);
 identity("nav_bridge_residual",b.unexplained_by_cash_basis_pnl_and_inventory_unrealized_change_base_units,[[a.capital_adjusted_nav_change_base_units,1],[p.project_cash_basis_realized_pnl_base_units,-1],[a.interval_inventory_unrealized_change_base_units,-1]]);
 identity("nav_bridge_receivable_change",b.receivable_change_base_units,[[r.closing_receivable_base_units,1],[r.opening_receivable_base_units,-1]]);
 identity("nav_bridge_remaining",b.remaining_unexplained_base_units,[[b.unexplained_by_cash_basis_pnl_and_inventory_unrealized_change_base_units,1],[b.receivable_change_base_units,-1],[b.other_asset_change_base_units,-1],[b.liability_change_base_units,1]]);
 // An arithmetic match is not proof that the unexplained economic residual is zero.
 // Gross amounts are nonnegative; net cash, PnL and NAV remain signed.
 for(const [section,obj,keys] of [
  ["cash_flow",c,["opening_cash_base_units","expected_closing_cash_base_units","observed_closing_cash_base_units","external_capital_in_base_units","external_capital_out_base_units","recorded_net_trade_receipts_base_units","recorded_trade_cash_cost_base_units","creator_fee_cash_receipts_base_units","other_income_base_units","total_separate_expenses_base_units","issuance_expenses_base_units","operating_expenses_base_units","failed_tx_expenses_base_units","other_expenses_base_units"]],
  ["creator_receivables",r,["opening_receivable_base_units","closing_receivable_base_units","accrued_base_units","cash_received_base_units","written_off_base_units"]],
  ["assets",a,["closing_cash_base_units","closing_token_quantity_base_units","remaining_inventory_cost_base_units","closing_inventory_supplied_value_base_units","closing_creator_receivable_base_units","closing_other_assets_base_units","closing_liabilities_base_units"]],
  ["realized_pnl",p,["creator_cash_income_base_units","other_cash_income_base_units","separate_expenses_base_units"]]
 ])for(const key of keys){
  const raw=obj[key],value=int(raw);
  if(raw!=null&&(value===null||value<0n))rows.push({id:"nonnegative/"+section+"/"+key,status:"REVIEW_REQUIRED",difference_base_units:null,reason:value===null?"MALFORMED_AMOUNT":"NEGATIVE_GROSS_AMOUNT"});
 }
 const counts={pass:rows.filter(x=>x.status==="PASS").length,review_required:rows.filter(x=>x.status==="REVIEW_REQUIRED").length,unknown:rows.filter(x=>x.status==="UNKNOWN").length};
 return {schema_version:"cook-financial-identity-audit.1",status:counts.review_required?"REVIEW_REQUIRED":counts.unknown?"PARTIAL":"ARITHMETIC_MATCH",counts,checks:rows,source_attestation:"UNKNOWN",execution_enabled:false};
}
