import {auditRecordedSyntheticBatch,assertRawSyntheticBatch} from "../src/core/synthetic-batch-audit.mjs";
const names={accounting:"资产账簿",posting_order_balances:"分录顺序余额",record_counts:"记录数量",generator_identity:"生成器身份",event_order:"事件顺序",record_numeric_consistency:"成交数值一致性",fee_attribution:"手续费归属",historical_calibration:"历史校准",market_behavior_validity:"行为真实性"};
/** Recompute from original synthetic inputs; presentation only. */
export function reviewSyntheticBatchInput(input){
 assertRawSyntheticBatch(input);
 const audit=auditRecordedSyntheticBatch(input),s=audit.summary;
 return {audit,metrics:[["报告总数",s.report_count],["内部一致",s.consistent_count],["需复核",s.review_required_count],["拒绝",s.rejected_count],["储备乘积诊断异常",audit.reserve_product_diagnostics.review_required],["储备乘积诊断未知或未评估",audit.reserve_product_diagnostics.unknown+audit.reserve_product_diagnostics.not_evaluated]],
 comparison:audit.comparison.map(r=>[names[r.id]??r.id,r.pass,r.review_required,r.unknown,r.not_evaluated]),
 rows:audit.results.map(r=>[r.scenario_id??"未知",r.status,r.observed_record_counts?.event_count??"—",r.observed_record_counts?.trade_count??"—",r.reason??(r.issues?.join(" / ")||"—")]),
 issues:audit.issue_counts.map(r=>[r.code,r.report_count])};
}
