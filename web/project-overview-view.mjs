// Historical display only. No automatic interval selection or asset calculation.
const labels={configuration:"项目配置",issuance_evidence:"发行证据",historical_market:"历史市场",financial_interval:"财务区间",order_exceptions:"订单异常",independent_source:"独立数据核验"};
const states={REVIEW_REQUIRED:"待复核",EVIDENCE_INCOMPLETE:"证据不足",INCOMPLETE:"不完整",MISSING:"缺失",NOT_RUN:"未验收",UNKNOWN:"未知",WARNING:"警告",DECLARED_ENDPOINT_PRESENT:"声明期末数据齐备",DECLARED_MATCH:"声明一致",DECLARED_EVIDENCE_PRESENT:"声明证据存在",DECLARED_ENDPOINTS_PRESENT:"声明期末数据齐备",REGISTRATION_OR_EVIDENCE_INCOMPLETE:"登记或证据不完整",OBSERVED_NOT_ATTESTED:"已记录，未认证",CONFIGURATION_INCOMPLETE:"配置不完整",DECLARATIONS_PRESENT:"声明齐备",REVIEW_RECOMMENDED:"建议复核"};
const display=v=>states[v]??v??"未知";
const raw=v=>typeof v==="string"&&/^(0|-?[1-9][0-9]*)$/.test(v)?v:"—";
const names=[["cash","期末现金","lamports"],["nav","期末 NAV","lamports"],["realized_pnl","区间已实现损益","lamports"],["token_quantity","期末 Token 库存","Token 原始单位"],["inventory_cost","库存成本","lamports"],["creator_receivable","Creator 应收","lamports"]];
export function projectOverviewModel(review){
 const r=review?.runtime;
 if(!r||r.execution_enabled!==false||r.live_assets!==null||r.project_revision!==review.project_revision||r.project_id!==review.project_id)throw Error("INVALID_PROJECT_OVERVIEW");
 return {stage:review.recorded_stage,status:display(review.status),counts:{critical:review.risk.critical,warning:review.risk.warning,unknown:review.risk.unknown},
 work:r.work.map(x=>({label:labels[x.id]??x.id,status:display(x.status)})),
 intervals:r.asset_intervals.map(x=>({id:x.report_link_archive_id,label:x.opening_cutoff+" → "+x.closing_cutoff})),
 market:{status:display(r.market.status),interval_count:r.market.curve_intervals?.length??0,pool_count:r.market.historical_pools?.length??0,active_venue:"未知"},
 live_assets:"未接入",execution:"已禁用"};
}
export function projectIntervalMetrics(row){
 const blocked=!row||row.status==="REVIEW_REQUIRED";
 return names.map(([id,label,unit])=>({id,label,unit,value:blocked?"—":raw(row.assets?.[id])}));
}
