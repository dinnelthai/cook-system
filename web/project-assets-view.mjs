import {getProject,getProjectBusinessReview,selectProjectRuntimeInterval} from "./project-client.mjs";
import {projectOverviewModel,projectIntervalMetrics} from "./project-overview-view.mjs";
import {projectWalletRegistrationRows} from "./project-operator-view.mjs";
// Historical project amounts and independent wallet tools never share a balance.
export function mountProjectAssets(host,{projectId,isActive,esc,table,note,openTerminal}){
 const current=()=>isActive()&&host.isConnected;
 const title='<h3>项目资产与资金证据</h3>';
 const back='<button type="button" id="asset-open-terminal">返回操作台</button>';
 const bindBack=()=>{host.querySelector("#asset-open-terminal").onclick=openTerminal;};
 if(!projectId){host.innerHTML=title+note("请在操作台选择项目，查看历史资产区间。")+back;bindBack();return;}
 let loadTicket=0;
 async function load(){
  const ticket=++loadTicket,valid=()=>current()&&loadTicket===ticket;
  host.innerHTML=title+'<p role="status">正在加载项目及历史资产证据…</p>'+back;bindBack();
  try{
   const project=await getProject(projectId);
   if(!valid())return;
   const v=await getProjectBusinessReview(projectId,project.revision);
   if(!valid())return;
   const model=projectOverviewModel(v);
   host.innerHTML='<div class="review-section-head"><div>'+title+'<p class="muted">'+esc(project.profile.name+" / "+project.profile.symbol+" · v"+project.revision)+'</p></div><div class="row">'+back+'<button id="asset-refresh">刷新项目</button></div></div>'+
    note("Linked historical intervals only; not independently verified. Live assets, available funds, current NAV and LP ownership are unknown. Do not aggregate across intervals.")+
    '<div class="secondary-workspace"><section class="workspace-content"><h4>历史资产区间</h4><label>选择历史区间<select id="asset-interval"><option value="">Select an interval</option>'+model.intervals.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.label)+'</option>').join("")+'</select></label>'+
    '<div id="asset-interval-body" class="workspace-empty" role="status">'+note("选择区间查看金额。")+'</div></section><aside class="workspace-side"><h4>已登记钱包</h4><p class="muted">仅登记用途与限额，不代表余额或所有权证明。</p>'+(project.wallet_groups.length?table(["Group","Purpose","Address","Role","登记状态","声明限额","归属证据"],projectWalletRegistrationRows(project)):'<p class="workspace-empty">暂无已登记钱包。</p>')+'</aside></div>';
   bindBack();host.querySelector("#asset-refresh").onclick=load;
   const select=host.querySelector("#asset-interval"),body=host.querySelector("#asset-interval-body");
   select.disabled=!v.runtime_context_id||!model.intervals.length;
   if(select.disabled)body.textContent="暂无关联历史区间，请先关联报告。";
   let intervalTicket=0;
   select.onchange=async()=>{
    const seq=++intervalTicket,archiveId=select.value;
    if(!archiveId){body.textContent="选择区间查看金额。";return;}
    body.textContent="正在加载所选区间…";
    try{
     const ctx=await selectProjectRuntimeInterval(projectId,project.revision,v.runtime_context_id,archiveId);
     if(!valid()||seq!==intervalTicket||!body.isConnected)return;
     const row=ctx.selected_interval;
     body.innerHTML=note(row.status+" · "+row.opening_cutoff+" → "+row.closing_cutoff)+
      table(["指标","历史声明金额","Unit","证据状态"],projectIntervalMetrics(row).map(m=>[m.label,m.display_value,m.display_unit,m.evidence_label]))+
      note("LP Position: "+(row.lp_evidence?.status??"Unknown")+"; ownership, valuation and NAV inclusion are unverified.")+
      (row.account_coverage?table(["项目 / 账户总额核对","Status"],row.account_coverage.checks.map(c=>[c.field,c.status])):"");
    }catch(error){if(valid()&&seq===intervalTicket&&body.isConnected)body.textContent="Interval unavailable. Refresh project: "+error.message;}
   };
  }catch(error){
   if(!valid())return;
   host.innerHTML=title+note("Project assets unavailable: "+error.message)+'<button id="asset-refresh">重试</button>'+back;
   host.querySelector("#asset-refresh").onclick=load;bindBack();
  }
 }
 load();
}
