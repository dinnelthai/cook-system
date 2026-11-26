import {listProjectOrders,listProjectArchive,getOrderReviewEvents,getOrderReceiptReview,importProjectOrderReceipts} from "./project-client.mjs";
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
 if(filter==="REPORTED_SUCCESS"||filter==="REPORTED_FAILURE")return orders.filter(o=>o.status===filter);
 return [];
}
export function orderReviewPage(orders,{filter="ALL",query="",page=1,pageSize=20}={}){
 if(!Number.isSafeInteger(page)||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100)throw Error("INVALID_ORDER_PAGE");
 const q=String(query).trim().toLowerCase(),matched=filterOrderReviews(orders,filter).filter(o=>!q||[o.order_id,o.signature,o.status].some(v=>String(v??"").toLowerCase().includes(q)));
 const pages=Math.max(1,Math.ceil(matched.length/pageSize)),current=Math.max(1,Math.min(page,pages));
 return {rows:matched.slice((current-1)*pageSize,current*pageSize),total:matched.length,page:current,pages};
}
export function mountOrderReview(container,{project,isActive,esc,table,note,download,onSummary=()=>{}}){
 let orders=[],links=[],filter="ALL",ticket=0,selected=null,detail=null,loaded=false,query="",page=1,loading=false,loadError="";
 const current=()=>isActive()&&container.isConnected;
 function render(){
  if(!current())return;
  const counts=summarizeOrderReviews(orders),result=orderReviewPage(orders,{filter,query,page}),shown=result.rows;page=result.page;
  onSummary({project_id:project.project_id,revision:project.revision,counts:loaded?counts:null,state:loading?"Loading":loadError?"Unavailable":loaded?"Loaded":"Not loaded"});
  container.innerHTML='<h3>Order Review</h3>'+note("Historical or synthetic records; not live orders, independently verified fills, or settlement.")+
    '<div class="row"><button id="order-refresh">Refresh Orders</button><button id="order-export"'+(loaded?"":" disabled")+'>Export Orders</button><label>Filter <select id="order-filter">'+[["ALL","All"],["EXCEPTIONS","Exceptions / Stale"],["UNKNOWN","Unknown Outcome"],["REPORTED_SUCCESS","Reported Success"],["REPORTED_FAILURE","Reported Failure"]].map(([id,label])=>'<option value="'+id+'"'+(filter===id?" selected":"")+'>'+label+'</option>').join("")+'</select></label><label>Search <input type="search" id="order-search" placeholder="Order ID, signature or status" value="'+esc(query)+'"></label></div>'+
    (loaded?table(["All","Review Required","Unknown Outcome","Reported Success","Reported Failure","Stale"],[[counts.total,counts.review,counts.unknown,counts.reported_success,counts.reported_failure,counts.stale]])+
    table(["Order ID","Source","Signature","Status","Slot","Revision","Review Reason"],shown.map(o=>[o.order_id,o.source_mode,o.signature,o.status,o.reported_slot??"—",o.revision+(o.stale?" · Stale project revision":""),(o.review_reasons??[]).join(" / ")]))+
    '<div class="row log-pagination"><button type="button" id="order-prev" '+(result.page<=1?"disabled":"")+'>Previous</button><small>'+result.total+' records · Page '+result.page+' / '+result.pages+'</small><button type="button" id="order-next" '+(result.page>=result.pages?"disabled":"")+'>Next</button></div>':"")+
    '<p id="order-load-status" role="status" class="muted">'+esc(loading?"Loading project orders…":loadError|| (loaded?(orders.length?"Project orders loaded":"No recorded orders in this project."):"Orders not yet loaded"))+'</p>'+
    '<div class="row"><label>Order <select id="order-select"><option value="">Select Record</option>'+shown.map(o=>'<option value="'+esc(o.order_id)+'"'+(selected?.order_id===o.order_id?" selected":"")+'>'+esc(o.order_id+" · "+o.status)+'</option>').join("")+'</select></label><button id="order-events" disabled>View Events</button></div>'+
    '<div class="row"><label>Linked Report <select id="order-report-select"><option value="">Select Report</option>'+links.map(a=>'<option value="'+esc(a.archive_id)+'">'+esc("Workspace v"+a.payload.workspace_revision+" · "+a.payload.scope.openingCutoff+" → "+a.payload.scope.closingCutoff)+'</option>').join("")+'</select></label><button id="order-import" disabled>Import Historical Receipts</button><button id="order-receipt" disabled>Review & Archive Receipt</button><button id="order-detail-export" disabled>Export Review</button></div><p id="order-detail-status" role="status"></p><div id="order-summary"></div><details><summary>Raw Review Evidence (JSON)</summary><pre id="order-detail" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details>';
  const select=container.querySelector("#order-select"),linkSelect=container.querySelector("#order-report-select"),eventsButton=container.querySelector("#order-events"),receiptButton=container.querySelector("#order-receipt"),exportButton=container.querySelector("#order-detail-export");
  function reset(){ticket++;detail=null;container.querySelector("#order-summary").replaceChildren();container.querySelector("#order-detail").textContent="";container.querySelector("#order-detail-status").textContent="";exportButton.disabled=true;}
  const importButton=container.querySelector("#order-import");
  importButton.onclick=async()=>{
   if(!linkSelect.value)return;
   const own=++ticket;importButton.disabled=true;eventsButton.disabled=true;receiptButton.disabled=true;
   const status=container.querySelector("#order-detail-status");status.textContent="Importing historical receipts…";
   try{
    const result=await importProjectOrderReceipts(project.project_id,project.revision,linkSelect.value);
    if(!current()||own!==ticket)return;
    await load();
    if(current())container.querySelector("#order-detail-status").textContent="Imported: "+result.imported+", existing: "+result.already_present+", excluded non-trade receipts: "+result.excluded_receipt_count+".";
   }catch(error){if(current()&&own===ticket)status.textContent="Import failed: "+error.message;}
   finally{if(current()&&own===ticket)buttons();}
  };
  function buttons(){importButton.disabled=!linkSelect.value;eventsButton.disabled=!selected;receiptButton.disabled=!selected||(selected.stale&&selected.evidence_applicability!=="PROFILE_ONLY_COMPATIBLE")||selected.source_mode!=="ARCHIVED_HISTORICAL"||!linkSelect.value;}
  select.onchange=()=>{reset();selected=shown.find(o=>o.order_id===select.value)??null;buttons();};
  linkSelect.onchange=()=>{reset();buttons();};
  container.querySelector("#order-filter").onchange=x=>{ticket++;filter=x.target.value;page=1;selected=null;detail=null;render();};
  container.querySelector("#order-filter").disabled=loading;
  const search=container.querySelector("#order-search");search.disabled=loading;search.onchange=()=>{ticket++;query=search.value;page=1;selected=null;detail=null;render()};
  const prev=container.querySelector("#order-prev"),next=container.querySelector("#order-next");
  if(prev)prev.onclick=()=>{ticket++;page--;selected=null;detail=null;render()};if(next)next.onclick=()=>{ticket++;page++;selected=null;detail=null;render()};
  const refresh=container.querySelector("#order-refresh");refresh.disabled=loading;refresh.onclick=load;
  container.querySelector("#order-export").onclick=()=>download("project-order-review.json",JSON.stringify({project_id:project.project_id,project_revision:project.revision,orders,source_attestation:"UNKNOWN",execution_enabled:false,settlement_allowed:false},null,2));
  async function show(kind){
   if(!selected)return;
   const own=++ticket,o=selected,a=linkSelect.value;
   detail=null;exportButton.disabled=true;eventsButton.disabled=true;receiptButton.disabled=true;
   container.querySelector("#order-summary").replaceChildren();
   container.querySelector("#order-detail").textContent="";
   const status=container.querySelector("#order-detail-status");status.textContent="Loading evidence…";
   try{
    const value=kind==="EVENTS"?await getOrderReviewEvents(project.project_id,project.revision,o):await getOrderReceiptReview(project.project_id,project.revision,o,a);
    if(!current()||own!==ticket)return;
    detail={kind,project_id:project.project_id,project_revision:project.revision,order_id:o.order_id,order_revision:o.revision,source_attestation:"UNKNOWN",execution_enabled:false,settlement_allowed:false,data:value};
    const summary=container.querySelector("#order-summary");
    summary.innerHTML=table(["Order","Status","Signature","Revision"],[[o.order_id,o.status,o.signature,o.revision]])+
      (kind==="EVENTS"?table(["Recorded At","Event Revision","Event Type"],value.map(e=>[Number.isSafeInteger(e.recorded_at_ms)?new Date(e.recorded_at_ms).toISOString():"Unknown",e.revision,e.event?.type??"Unknown"])):
      table(["Check","Result"],[["Receipt Review",value.status],["Reason",value.reason],["Slot",value.receipt_slot??"Unknown"],["Reported Outcome",value.reported_receipt_outcome??"Unknown"],["Source Attestation","Unknown"],["Financial Consistency Attestation","Not established"]])+
      table(["Cash Record","Status","Reconciliation","Inventory Event"],(value.posting_references??[]).map(p=>[p.posting_id,p.recorded_status,p.reconciliation,p.inventory_event_id??"Unknown"])));
    container.querySelector("#order-detail").textContent=JSON.stringify(detail,null,2);status.textContent="Evidence loaded; not independently attested.";exportButton.disabled=false;
   }catch(error){if(current()&&own===ticket)status.textContent="Read failed: "+error.message;}
   finally{if(current()&&own===ticket)buttons();}
  }
  eventsButton.onclick=()=>show("EVENTS");receiptButton.onclick=()=>show("RECEIPT");exportButton.onclick=()=>{if(detail)download("order-review-detail.json",JSON.stringify(detail,null,2));};
  buttons();
 }
 async function load(){
  if(loading||!current())return;
  const own=++ticket;loading=true;loadError="";loaded=false;orders=[];links=[];selected=null;detail=null;render();
  const status=container.querySelector("#order-load-status");status.textContent="Loading project orders and linked archives…";
  try{
   const [next,archive]=await Promise.all([listProjectOrders(project.project_id,project.revision),listProjectArchive(project.project_id)]);
   if(!current()||own!==ticket)return;
   if(archive.some(a=>a.project_id!==project.project_id||a.current_revision!==project.revision))throw Error("PROJECT_ARCHIVE_SCOPE_MISMATCH");
   orders=next;links=archive.filter(a=>a.kind==="HISTORICAL_REPORT_LINK"&&(!a.stale||a.evidence_applicability==="PROFILE_ONLY_COMPATIBLE")&&a.current_revision===project.revision);loaded=true;
  }catch(error){if(current()&&own===ticket)loadError="Order review unavailable: "+error.message;}
  finally{if(current()&&own===ticket){loading=false;render();}}
 }
 render();load();
}
