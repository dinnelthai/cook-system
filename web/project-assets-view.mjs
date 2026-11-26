import {getProject,getProjectBusinessReview,selectProjectRuntimeInterval} from "./project-client.mjs";
import {projectOverviewModel,projectIntervalMetrics} from "./project-overview-view.mjs";
import {projectWalletRegistrationRows} from "./project-operator-view.mjs";
// Historical project amounts and independent wallet tools never share a balance.
export function mountProjectAssets(host,{projectId,isActive,esc,table,note,openTerminal}){
 const current=()=>isActive()&&host.isConnected;
 const title='<h3>Project Assets & Funding Evidence</h3>';
 const back='<button type="button" id="asset-open-terminal">Back to Terminal</button>';
 const bindBack=()=>{host.querySelector("#asset-open-terminal").onclick=openTerminal;};
 if(!projectId){host.innerHTML=title+note("Select a project in the terminal to inspect its historical asset intervals.")+back;bindBack();return;}
 let loadTicket=0;
 async function load(){
  const ticket=++loadTicket,valid=()=>current()&&loadTicket===ticket;
  host.innerHTML=title+'<p role="status">Loading project and historical asset evidence…</p>'+back;bindBack();
  try{
   const project=await getProject(projectId);
   if(!valid())return;
   const v=await getProjectBusinessReview(projectId,project.revision);
   if(!valid())return;
   const model=projectOverviewModel(v);
   host.innerHTML='<div class="review-section-head"><div>'+title+'<p class="muted">'+esc(project.profile.name+" / "+project.profile.symbol+" · v"+project.revision)+'</p></div><div class="row">'+back+'<button id="asset-refresh">Refresh Project</button></div></div>'+
    note("Linked historical intervals only; not independently verified. Live assets, available funds, current NAV and LP ownership are unknown. Do not aggregate across intervals.")+
    '<div class="secondary-workspace"><section class="workspace-content"><h4>Historical Asset Intervals</h4><label>Select Historical Interval<select id="asset-interval"><option value="">Select an interval</option>'+model.intervals.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.label)+'</option>').join("")+'</select></label>'+
    '<div id="asset-interval-body" class="workspace-empty" role="status">'+note("Select an interval to view amounts.")+'</div></section><aside class="workspace-side"><h4>Registered Wallets</h4><p class="muted">Registered purpose and limits only; not proof of balances or ownership.</p>'+(project.wallet_groups.length?table(["Group","Purpose","Address","Role","Registration Status","Declared Limit","Ownership Evidence"],projectWalletRegistrationRows(project)):'<p class="workspace-empty">No registered wallets.</p>')+'</aside></div>';
   bindBack();host.querySelector("#asset-refresh").onclick=load;
   const select=host.querySelector("#asset-interval"),body=host.querySelector("#asset-interval-body");
   select.disabled=!v.runtime_context_id||!model.intervals.length;
   if(select.disabled)body.textContent="No linked historical intervals. Link a report first.";
   let intervalTicket=0;
   select.onchange=async()=>{
    const seq=++intervalTicket,archiveId=select.value;
    if(!archiveId){body.textContent="Select an interval to view amounts.";return;}
    body.textContent="Loading selected interval…";
    try{
     const ctx=await selectProjectRuntimeInterval(projectId,project.revision,v.runtime_context_id,archiveId);
     if(!valid()||seq!==intervalTicket||!body.isConnected)return;
     const row=ctx.selected_interval;
     body.innerHTML=note(row.status+" · "+row.opening_cutoff+" → "+row.closing_cutoff)+
      table(["Metric","Historical Declared Amount","Unit","Evidence Status"],projectIntervalMetrics(row).map(m=>[m.label,m.display_value,m.display_unit,m.evidence_label]))+
      note("LP Position: "+(row.lp_evidence?.status??"Unknown")+"; ownership, valuation and NAV inclusion are unverified.")+
      (row.account_coverage?table(["Project / Account Total Check","Status"],row.account_coverage.checks.map(c=>[c.field,c.status])):"");
    }catch(error){if(valid()&&seq===intervalTicket&&body.isConnected)body.textContent="Interval unavailable. Refresh project: "+error.message;}
   };
  }catch(error){
   if(!valid())return;
   host.innerHTML=title+note("Project assets unavailable: "+error.message)+'<button id="asset-refresh">Retry</button>'+back;
   host.querySelector("#asset-refresh").onclick=load;bindBack();
  }
 }
 load();
}
