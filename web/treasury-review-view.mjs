// Presentation only. Null values are unknown, never zero; no trading controls.
export function formatHistoricalLamports(value){
 if(typeof value!=="string"||!/^(0|-?[1-9][0-9]*)$/.test(value))return "—";
 const n=BigInt(value),negative=n<0n,a=negative?-n:n;
 return (negative?"-":"")+(a/1000000000n).toString()+"."+(a%1000000000n).toString().padStart(9,"0")+" SOL";
}
export function treasuryReviewSections(v){
 const m=formatHistoricalLamports,c=v.cash_flow??{},i=v.inventory??{},r=v.realized_pnl??{},f=v.creator_receivables??{},h=v.historical_valuation??{},b=v.budget_review??{};
 return [
  {heading:"历史资金流水",rows:[["期初现金",m(c.opening_cash_base_units)],["外部资金投入",m(c.external_capital_in_base_units)],["外部资金转出",m(c.external_capital_out_base_units)],["交易支出",m(c.recorded_trade_cash_cost_base_units)],["交易收入",m(c.recorded_net_trade_receipts_base_units)],["运营净现金流",m(c.operating_net_cash_flow_base_units)],["期末现金",m(c.observed_closing_cash_base_units)],["现金差异",m(c.closing_cash_difference_base_units)]]},
  {heading:"库存与历史损益",rows:[["期末 Token（原始单位）",i.closing_quantity_base_units??"—"],["剩余成本",m(i.remaining_cost_base_units)],["历史库存估值",m(i.supplied_historical_value_base_units)],["交易已实现损益",m(r.trade_realized_pnl_base_units)],["项目现金口径已实现损益",m(r.project_cash_basis_realized_pnl_base_units)],["历史库存估值减成本",m(h.closing_inventory_value_minus_cost_base_units)],["历史区间库存未实现变化",m(h.interval_inventory_unrealized_change_base_units)],["历史期末 NAV",m(h.closing_nav_base_units)],["NAV 变化未解释差额（非利润）",m(h.nav_bridge_residual_base_units)]]},
  {heading:"Creator Fee 子账",rows:[["期初应收",m(f.opening_receivable_base_units)],["新增应收",m(f.accrued_base_units)],["实际到账记录",m(f.cash_received_base_units)],["核销",m(f.written_off_base_units)],["期末应收",m(f.closing_receivable_base_units)],["子账状态",v.creator_fee_audit?.status??"UNKNOWN"],["池内费用是否等于到账","未建立等价关系"]]},
  {heading:"历史预算复核",rows:[["当前登记预算",m(b.configured_budget_base_units)],["报告区间外部投入",m(b.recorded_interval_capital_in_base_units)],["比较结果",b.status??"UNKNOWN"],["剩余预算","未知"],["实际项目总资产","未知"],["实时余额","未知"]]},
  {heading:"证据覆盖",rows:[["账户集合",v.account_set?.status??"UNKNOWN"],["登记账户标签数量",v.account_set?.coverage?.registered_wallet_count??"—"],["报告账户标签数量",v.account_set?.coverage?.declared_account_count??"—"],["标签匹配状态",v.account_set?.coverage?.status??"UNKNOWN"]]}
 ];
}
