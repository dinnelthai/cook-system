import {getProject,getProjectBusinessReview,selectProjectRuntimeInterval} from "./project-client.mjs";
import {projectOverviewModel,projectIntervalMetrics} from "./project-overview-view.mjs";
import {projectWalletRegistrationRows} from "./project-operator-view.mjs";
// Historical project amounts and independent wallet tools never share a balance.
export function mountProjectAssets(host,{projectId,isActive,esc,table,note,openTerminal}){
 const current=()=>isActive()&&host.isConnected;
 const title='<h3>项目资产与资金证据</h3>';
 const back='<button type="button" id="asset-open-terminal">返回项目操作台</button>';
 const bindBack=()=>{host.querySelector("#asset-open-terminal").onclick=openTerminal;};
 if(!projectId){host.innerHTML=title+note("尚未选择项目。请在操作台选择 Project 后查看其独立历史资产区间。")+back;bindBack();return;}
 let loadTicket=0;
 async function load(){
  const ticket=++loadTicket,valid=()=>current()&&loadTicket===ticket;
  host.innerHTML=title+'<p role="status">读取当前项目及历史资产证据…</p>'+back;bindBack();
  try{
   const project=await getProject(projectId);
   if(!valid())return;
   const v=await getProjectBusinessReview(projectId,project.revision);
   if(!valid())return;
   const model=projectOverviewModel(v);
   host.innerHTML=title+'<p>'+esc(project.profile.name+" / "+project.profile.symbol+" · v"+project.revision)+'</p>'+
    note("仅展示当前 Project 已关联的历史区间；未独立认证。实时资产、可用资金、当前 NAV 和 LP 归属未知。禁止跨区间汇总。")+
    '<div class="row">'+back+'<button id="asset-refresh">刷新项目</button></div>'+
    '<h4>已登记钱包</h4>'+table(["分组","用途","地址","角色","登记状态","声明额度","归属证据"],projectWalletRegistrationRows(project))+
    '<h4>历史资产区间</h4><label>选择历史区间<select id="asset-interval"><option value="">请选择（不会自动选取）</option>'+model.intervals.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.label)+'</option>').join("")+'</select></label>'+
    '<div id="asset-interval-body" role="status">'+note("尚未选择区间，金额不显示。")+'</div>';
   bindBack();host.querySelector("#asset-refresh").onclick=load;
   const select=host.querySelector("#asset-interval"),body=host.querySelector("#asset-interval-body");
   select.disabled=!v.runtime_context_id||!model.intervals.length;
   if(select.disabled)body.textContent="暂无可选的历史区间。";
   let intervalTicket=0;
   select.onchange=async()=>{
    const seq=++intervalTicket,archiveId=select.value;
    if(!archiveId){body.textContent="尚未选择区间，金额不显示。";return;}
    body.textContent="读取所选历史区间…";
    try{
     const ctx=await selectProjectRuntimeInterval(projectId,project.revision,v.runtime_context_id,archiveId);
     if(!valid()||seq!==intervalTicket||!body.isConnected)return;
     const row=ctx.selected_interval;
     body.innerHTML=note(row.status+" · "+row.opening_cutoff+" → "+row.closing_cutoff)+
      table(["指标","历史声明金额","单位","证据状态"],projectIntervalMetrics(row).map(m=>[m.label,m.display_value,m.display_unit,m.evidence_label]))+
      note("LP 头寸："+(row.lp_evidence?.status??"未知")+"；归属、估值和 NAV 纳入情况未验证，不额外计入。")+
      (row.account_coverage?table(["项目 / 账户合计核对","状态"],row.account_coverage.checks.map(c=>[c.field,c.status])):"");
    }catch(error){if(valid()&&seq===intervalTicket&&body.isConnected)body.textContent="区间不可用，请刷新项目："+error.message;}
   };
  }catch(error){
   if(!valid())return;
   host.innerHTML=title+note("项目资产不可用："+error.message)+'<button id="asset-refresh">重新读取</button>'+back;
   host.querySelector("#asset-refresh").onclick=load;bindBack();
  }
 }
 load();
}
