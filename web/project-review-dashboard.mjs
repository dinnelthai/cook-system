import {getProject,getProjectBusinessReview,selectProjectRuntimeInterval} from "./project-client.mjs";
import {projectOverviewModel,projectIntervalMetrics} from "./project-overview-view.mjs";
import {formatHistoricalSol} from "./terminal-display.mjs";
import {lifecycleLabel,operationalLabel} from "./project-operator-view.mjs";

const fields=[["trade_realized_pnl_base_units","交易已实现损益"],["creator_cash_income_base_units","Creator 到账收入"],["other_cash_income_base_units","其他现金收入"],["separate_expenses_base_units","独立费用"],["project_cash_basis_realized_pnl_base_units","项目现金口径已实现损益"]];
export function operatingComponentRows(review,interval){
 if(!interval||interval.status==="REVIEW_REQUIRED")return [];
 return (review.operating_components?.rows??[]).filter(r=>r.report_link_archive_id===interval.report_link_archive_id&&r.report_digest===interval.report_digest).map(r=>({
  archive_id:r.archive_id,status:r.status,values:fields.map(([k,label])=>[label,r.status==="REVIEW_REQUIRED"?"—":formatHistoricalSol(r.components?.[k]),"SOL"])
 }));
}
export function mountScopedProjectReview(host,{projectId,isActive,esc,table,note,download}){
 let loadTicket=0;
 const current=()=>isActive()&&host.isConnected;
 async function load(){
  const ticket=++loadTicket,valid=()=>current()&&ticket===loadTicket;
  host.innerHTML='<h3>项目复盘</h3><p role="status">读取项目复盘快照…</p>';
  try{
   const project=await getProject(projectId);
   if(!valid())return;
   const v=await getProjectBusinessReview(projectId,project.revision);
   if(!valid())return;
   const m=projectOverviewModel(v);
   host.innerHTML='<div class="review-section-head"><div><h3>'+esc(project.profile.name+" · v"+project.revision)+'</h3><p class="muted">项目历史复盘</p></div><div class="row"><button id="scoped-review-refresh">刷新复盘</button><button id="scoped-review-export">导出项目复盘证据</button></div></div>'+
    note(lifecycleLabel(project.lifecycle.stage)+" · "+operationalLabel(project.lifecycle.operational_status)+" · 历史证据未独立认证")+
    '<div class="review-kpis">'+[["财务复核",v.treasury.status],["市场证据",v.market.status],["结算复核",v.close.status],["订单待复核",v.orders.unresolved_count]].map(([label,value])=>'<div class="project-stat"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join("")+'</div>'+
    '<div class="secondary-workspace"><section class="workspace-content">'+
    '<h4>历史区间复盘</h4><label>选择区间<select id="scoped-review-interval"><option value="">请选择历史区间</option>'+m.intervals.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.label)+'</option>').join("")+'</select></label><div id="scoped-review-body" class="workspace-empty" role="status">尚未选择区间，金额未知。</div></section><aside class="workspace-side">'+
    '<h4>风险与证据</h4><div class="review-risk-summary">'+["critical","warning","unknown"].map((k,i)=>'<div><span>'+["严重","警告","未知"][i]+'</span><strong class="risk-'+k+'">'+esc(v.global_risk.counts[k])+'</strong></div>').join("")+'</div><details open><summary>完整风险清单</summary>'+table(["级别","类别","原因"],v.global_risk.findings.map(r=>[r.severity,r.category,r.code]))+'</details>'+
    '<details><summary>生命周期与数据覆盖</summary>'+table(["阶段"],[[v.recorded_stage]])+table(["缺失或阻断项"],v.lifecycle.blockers.map(x=>[x]))+table(["验收条件","状态"],v.data_integration.gates.map(x=>[x.id,x.status]))+'</details></aside></div>';
   host.querySelector("#scoped-review-refresh").onclick=load;
   host.querySelector("#scoped-review-export").onclick=()=>download("project-scoped-review.json",JSON.stringify(v,null,2));
   const select=host.querySelector("#scoped-review-interval"),body=host.querySelector("#scoped-review-body");let intervalTicket=0;
   select.disabled=!v.runtime_context_id||!m.intervals.length;
   if(select.disabled)body.textContent="暂无关联的历史区间。";
   select.onchange=async()=>{
    const seq=++intervalTicket,id=select.value;
    if(!id){body.textContent="尚未选择区间，金额未知。";return;}
    body.textContent="读取历史区间…";
    try{
     const ctx=await selectProjectRuntimeInterval(projectId,project.revision,v.runtime_context_id,id);
     if(!valid()||seq!==intervalTicket||!body.isConnected)return;
     const row=ctx.selected_interval,components=operatingComponentRows(v,row);
     body.innerHTML=note(row.status+" · "+row.opening_cutoff+" → "+row.closing_cutoff)+table(["资产指标","数值","单位","证据"],projectIntervalMetrics(row).map(x=>[x.label,x.display_value,x.display_unit,x.evidence_label]))+
      '<h4>历史经营收益构成</h4>'+note("各归档独立展示；不跨区间或跨证据求和，不代表因果归因。")+
      (components.length?components.map(c=>'<details open><summary>'+esc(c.archive_id+" · "+c.status)+'</summary>'+table(["指标","金额","单位"],c.values)+'</details>').join(""):note("尚无可展示的经营收益证据。"));
    }catch(error){if(valid()&&seq===intervalTicket&&body.isConnected)body.textContent="区间读取失败，请刷新："+error.message;}
   };
  }catch(error){
   if(!valid())return;
   host.innerHTML='<h3>项目复盘</h3>'+note("项目复盘不可用："+error.message)+'<button id="scoped-review-refresh">重新读取</button>';
   host.querySelector("#scoped-review-refresh").onclick=load;
  }
 }
 load();
}
