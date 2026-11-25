export function creatorFeeLedgerRows(r){
 return [
  {label:"Creator Fee 应收汇总",headers:["指标","原始单位"],rows:[["期初应收",r.summary.opening_receivable_base_units],["已核对新增应收",r.summary.verified_recorded_accrual_base_units],["记录收款事件",r.summary.recorded_receipt_event_base_units],["核销",r.summary.recorded_writeoff_base_units],["预期期末应收",r.summary.expected_closing_receivable_base_units],["核对后现金到账",r.summary.verified_cash_income_base_units],["核对后期末应收",r.summary.verified_closing_receivable_base_units]]},
  {label:"Creator Fee 事件",headers:["事件","类型","金额","事件状态","到账关联","现金分录"],rows:r.fee_events.map(e=>[e.event_id,e.kind,e.reported_amount_base_units,e.event_status,e.cash_link_status,e.cash_posting_ids.join(", ")])},
  {label:"现金到账分录",headers:["分录","关联事件","金额","状态","关联状态"],rows:r.cash_postings.map(p=>[p.posting_id,p.fee_event_id,p.amount_base_units,p.status,p.link_status])},
  {label:"未匹配现金分录",headers:["分录","关联事件","金额","状态"],rows:r.unmatched_cash_postings.map(p=>[p.posting_id,p.fee_event_id,p.amount_base_units,p.status])},
  {label:"异常现金分录",headers:["分录","关联事件","金额","问题"],rows:r.problem_cash_postings.map(p=>[p.posting_id,p.fee_event_id,p.amount_base_units,p.link_status])},
  {label:"审计问题",headers:["问题","事件"],rows:r.issues.map(i=>[i.code,i.id??""])}
 ];
}
