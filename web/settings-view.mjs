export function filterDiagnosticEntries(entries,{level="ALL",query=""}={}){
 if(!["ALL","INFO","WARN","ERROR"].includes(level))throw Error("INVALID_LOG_LEVEL");
 const q=String(query).trim().toLowerCase();
 return [...entries].reverse().filter(e=>(level==="ALL"||e.level===level)&&(!q||String(e.event).toLowerCase().includes(q)||String(e.time).toLowerCase().includes(q)||JSON.stringify(e.detail??{}).toLowerCase().includes(q)));
}
export function mountSettings(host,{diagnostics,reportStatus,screenHeading,panel,note,table,stat,esc,exportDiagnostics,fetchImpl=globalThis.fetch}){
 let level="ALL",query="",limit=50,logs=diagnostics.snapshot();
 host.innerHTML=screenHeading("Settings","Connection status · Diagnostics")+
 '<div class="settings-workspace"><aside class="settings-side">'+panel("Service Status",table(["Service","Status"],[["Browser App","Initialized"],["Historical Report Engine",reportStatus],["Localnet RPC","Not checked"],["Project Trading","Unavailable"]])+
 '<button id="rpc-health" type="button">Check Local Connection</button><div id="rpc-health-result" role="status"></div>')+
 note("Diagnostics retain up to 1,000 structured events in this tab. Raw inputs, wallet addresses, private keys, RPC URLs and raw error messages are not stored.")+
 '</aside><section class="settings-content"><h3>Session Diagnostics</h3><div class="stats" data-settings-stats></div>'+
 panel("Log Tools",'<div class="row"><button id="log-download" class="primary">Export Diagnostics JSON</button><button id="log-refresh">Refresh</button><button id="log-clear">Clear Logs</button></div>')+
 panel("Recent Events",'<div class="row settings-filter"><label>Level<select data-log-level><option value="ALL">All</option><option>INFO</option><option>WARN</option><option>ERROR</option></select></label><label>Search<input type="search" data-log-query placeholder="Event, UTC time or detail"></label><label>Rows<select data-log-limit><option>50</option><option>100</option><option>250</option><option>1000</option></select></label></div><p class="muted" data-log-count role="status"></p><div data-log-table></div>')+'</section></div>';
 const q=s=>host.querySelector(s);
 function draw(){
  q("[data-settings-stats]").innerHTML=stat("Events",logs.entries.length)+stat("Warnings",logs.entries.filter(x=>x.level==="WARN").length)+stat("Errors",logs.entries.filter(x=>x.level==="ERROR").length)+stat("Dropped",logs.dropped_count);
  const rows=filterDiagnosticEntries(logs.entries,{level,query});
  q("[data-log-count]").textContent="Showing "+Math.min(limit,rows.length)+" of "+rows.length+" matching events · Storage: "+logs.persistence_status;
  q("[data-log-table]").innerHTML=table(["UTC","Level","Event","Detail"],rows.slice(0,limit).map(x=>[x.time,x.level,x.event,JSON.stringify(x.detail)]));
 }
 q("[data-log-level]").onchange=e=>{level=e.target.value;draw()};
 q("[data-log-query]").oninput=e=>{query=e.target.value;draw()};
 q("[data-log-limit]").onchange=e=>{limit=Number(e.target.value);draw()};
 q("#log-refresh").onclick=()=>{logs=diagnostics.snapshot();draw()};
 q("#log-clear").onclick=()=>{if(globalThis.confirm("Clear session diagnostic logs?")){diagnostics.clear();logs=diagnostics.snapshot();draw()}};
 q("#log-download").onclick=async()=>{await exportDiagnostics();if(host.isConnected){logs=diagnostics.snapshot();draw()}};
 q("#rpc-health").onclick=async()=>{const button=q("#rpc-health"),output=q("#rpc-health-result");button.disabled=true;output.textContent="Checking…";try{
 const response=await fetchImpl("/api/terminal/health",{cache:"no-store",signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error("HEALTH_UNAVAILABLE");
 const result=await response.json();if(!output.isConnected)return;output.innerHTML=table(["Check","Status"],[["Report Bridge",result.report_bridge],["RPC",result.rpc?.status],["Finalized Slot",result.rpc?.slot],["Version",result.rpc?.version],["Genesis Hash",result.rpc?.genesis_hash],["Network Identity","Independent verification pending"]]);
 }catch{if(output.isConnected)output.textContent="Local health endpoint unavailable. Retry."}finally{if(button.isConnected)button.disabled=false}};
 draw();
}
