import {listProjectOrders,listProjectArchive,getOrderReviewEvents,getOrderReceiptReview} from "./project-client.mjs";
const known=new Set(["RECORDED","OUTCOME_UNKNOWN","REPORTED_SUCCESS","REPORTED_FAILURE","REVIEW_REQUIRED"]);
export function summarizeOrderReviews(orders){
 const counts={total:orders.length,review:0,unknown:0,reported_success:0,reported_failure:0,stale:0};
 for(const o of orders){
  if(o.stale)counts.stale++;
  if(o.status==="REVIEW_REQUIRED"||!known.has(o.status))counts.review++;
  else if(["RECORDED","OUTCOME_UNKNOWN"].includes(o.status))counts.unknown++;
  else if(o.status==="REPORTED_SUCCESS")counts.reported_success++;
  else if(o.status==="REPORTED_FAILURE")counts.reported_failure++;
 }
 return counts;
}
export function filterOrderReviews(orders,filter){
 if(filter==="ALL")return orders;
 if(filter==="EXCEPTIONS")return orders.filter(o=>o.stale||o.status==="REVIEW_REQUIRED"||o.status==="REPORTED_FAILURE"||!known.has(o.status));
 if(filter==="UNKNOWN")return orders.filter(o=>["RECORDED","OUTCOME_UNKNOWN"].includes(o.status));
 return [];
}
export function mountOrderReview(container,{project,isActive,esc,table,note,download}){
 let orders=[],links=[],filter="ALL",ticket=0,selected=null,detail=null,loaded=false;
 const current=()=>isActive()&&container.isConnected;
 function render(){
  if(!current())return;
  const counts=summarizeOrderReviews(orders),shown=filterOrderReviews(orders,filter);
  container.innerHTML='<h3>订单审计台账</h3>'+note("历史/合成记录；不代表实时订单、成交认证或财务结算。执行关闭。")+
    '<div class="row"><button id="order-refresh">刷新台账</button><button id="order-export"'+(loaded?"":" disabled")+'>导出台账</button><label>筛选 <select id="order-filter">'+[["ALL","全部"],["EXCEPTIONS","异常 / 旧版本"],["UNKNOWN","结果未知"]].map(([id,label])=>'<option value="'+id+'"'+(filter===id?" selected":"")+'>'+label+'</option>').join("")+'</select></label></div>'+
    (loaded?table(["全部","待复核","结果未知","报告成功","报告失败","旧版本"],[[counts.total,counts.review,counts.unknown,counts.reported_success,counts.reported_failure,counts.stale]])+
    table(["订单 ID","来源","Signature","状态","Slot","版本","复核原因"],shown.map(o=>[o.order_id,o.source_mode,o.signature,o.status,o.reported_slot??"—",o.revision+(o.stale?" · 旧项目版本":""),(o.review_reasons??[]).join(" / ")])):"")+
    '<p id="order-load-status" role="status" class="muted">'+(loaded?(orders.length?"已读取项目台账": "当前无已登记订单；未导入历史订单。"):"尚未读取台账")+'</p>'+
    '<div class="row"><label>订单 <select id="order-select"><option value="">选择记录</option>'+shown.map(o=>'<option value="'+esc(o.order_id)+'"'+(selected?.order_id===o.order_id?" selected":"")+'>'+esc(o.order_id+" · "+o.status)+'</option>').join("")+'</select></label><button id="order-events" disabled>查看事件</button></div>'+
    '<div class="row"><label>已关联报告 <select id="order-report-select"><option value="">选择报告</option>'+links.map(a=>'<option value="'+esc(a.archive_id)+'">'+esc("工作区 v"+a.payload.workspace_revision+" · "+a.payload.scope.openingCutoff+" → "+a.payload.scope.closingCutoff)+'</option>').join("")+'</select></label><button id="order-receipt" disabled>只读回执复核</button><button id="order-detail-export" disabled>导出复核明细</button></div><p id="order-detail-status" role="status"></p><pre id="order-detail" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>';
  const select=container.querySelector("#order-select"),linkSelect=container.querySelector("#order-report-select"),eventsButton=container.querySelector("#order-events"),receiptButton=container.querySelector("#order-receipt"),exportButton=container.querySelector("#order-detail-export");
  function reset(){ticket++;detail=null;container.querySelector("#order-detail").textContent="";container.querySelector("#order-detail-status").textContent="";exportButton.disabled=true;}
  function buttons(){eventsButton.disabled=!selected;receiptButton.disabled=!selected||selected.stale||selected.source_mode!=="ARCHIVED_HISTORICAL"||!linkSelect.value;}
  select.onchange=()=>{reset();selected=shown.find(o=>o.order_id===select.value)??null;buttons();};
  linkSelect.onchange=()=>{reset();buttons();};
  container.querySelector("#order-filter").onchange=x=>{ticket++;filter=x.target.value;selected=null;detail=null;render();};
  container.querySelector("#order-refresh").onclick=load;
  container.querySelector("#order-export").onclick=()=>download("project-order-review.json",JSON.stringify({project_id:project.project_id,project_revision:project.revision,orders,source_attestation:"UNKNOWN",execution_enabled:false,settlement_allowed:false},null,2));
  async function show(kind){
   if(!selected)return;
   const own=++ticket,o=selected,a=linkSelect.value;
   detail=null;exportButton.disabled=true;eventsButton.disabled=true;receiptButton.disabled=true;
   container.querySelector("#order-detail").textContent="";
   const status=container.querySelector("#order-detail-status");status.textContent="读取证据…";
   try{
    const value=kind==="EVENTS"?await getOrderReviewEvents(project.project_id,project.revision,o):await getOrderReceiptReview(project.project_id,project.revision,o,a);
    if(!current()||own!==ticket)return;
    detail={kind,project_id:project.project_id,project_revision:project.revision,order_id:o.order_id,order_revision:o.revision,source_attestation:"UNKNOWN",execution_enabled:false,settlement_allowed:false,data:value};
    container.querySelector("#order-detail").textContent=JSON.stringify(detail,null,2);status.textContent="证据已读取；未独立认证。";exportButton.disabled=false;
   }catch(error){if(current()&&own===ticket)status.textContent="读取失败："+error.message;}
   finally{if(current()&&own===ticket)buttons();}
  }
  eventsButton.onclick=()=>show("EVENTS");receiptButton.onclick=()=>show("RECEIPT");exportButton.onclick=()=>{if(detail)download("order-review-detail.json",JSON.stringify(detail,null,2));};
  buttons();
 }
 async function load(){
  const own=++ticket;loaded=false;orders=[];links=[];selected=null;detail=null;render();
  const status=container.querySelector("#order-load-status");status.textContent="读取项目订单及关联档案…";
  try{
   const [next,archive]=await Promise.all([listProjectOrders(project.project_id,project.revision),listProjectArchive(project.project_id)]);
   if(!current()||own!==ticket)return;
   if(archive.some(a=>a.project_id!==project.project_id||a.current_revision!==project.revision))throw Error("PROJECT_ARCHIVE_SCOPE_MISMATCH");
   orders=next;links=archive.filter(a=>a.kind==="HISTORICAL_REPORT_LINK"&&!a.stale&&a.project_revision===project.revision);loaded=true;render();
  }catch(error){if(current()&&own===ticket)status.textContent="台账不可用："+error.message;}
 }
 render();load();
}
