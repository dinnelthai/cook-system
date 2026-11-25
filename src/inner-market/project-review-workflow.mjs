/** Presentation only: distinguish preparation, recorded market phase and report review.
 * No real launch/exit/settlement or trading authorization. */
export function describeProjectReviewWorkflow({state,loaded,metadata=null,reviewStage="REVIEW"}){
 if(typeof loaded!=="boolean"||!["REVIEW","SETTLED","ARCHIVED"].includes(reviewStage))throw Error("INVALID_WORKFLOW_CONTEXT");
 const sample=state.source_mode==="SYNTHETIC",ready=loaded&&state.status==="REPORT_READY";
 const eligible=ready&&sample&&state.settlement_allowed===true;
 const settled=eligible&&["SETTLED","ARCHIVED"].includes(reviewStage);
 const archived=eligible&&reviewStage==="ARCHIVED";
 const phase=loaded?state.market_state?.snapshot?.lifecycle:null;
 const row=(label,status,note)=>({label,status,note});
 return {review_status:!loaded?"项目准备":archived?"合成归档":settled?"合成结算":ready?"历史审阅":"待复核",
  steps:[
   row("项目准备",metadata?.name&&metadata?.symbol?"会话资料已填写":loaded?"报告身份已载入":"待填写","项目资料不代表发行"),
   row("发行记录","未独立核验","当前报告不证明发行事件"),
   row("内盘市场",phase==="bonding_curve"?"区间快照已载入":phase==="complete_pending_migration"?"记录显示待迁移":"未获得支持的快照","仅历史观察"),
   row("毕业与外盘",phase==="complete_pending_migration"?"记录显示待迁移":"未知","未核验迁移及外盘证据"),
   row("资金与库存",!loaded?"待载入":ready?"内部一致":"待复核","原始单位；来源与归属仍未知"),
   row("退出与结算",settled?"合成测试已结算":eligible?"可测试报告结算":"不可执行","不提交订单或资产转移"),
   row("复盘与归档",archived?"合成测试归档":loaded?"可保存历史记录":"待载入","档案保存不等于实际项目结算")
  ],test_settlement_allowed:eligible&&reviewStage==="REVIEW",test_archive_allowed:settled,source_attestation:"UNKNOWN",execution_enabled:false};
}
