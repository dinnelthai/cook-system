export function filterDiagnosticEntries(entries,{level="ALL",query=""}={}){
 if(!["ALL","INFO","WARN","ERROR"].includes(level))throw Error("INVALID_LOG_LEVEL");
 const q=String(query).trim().toLowerCase();
 return [...entries].reverse().filter(e=>(level==="ALL"||e.level===level)&&(!q||String(e.event).toLowerCase().includes(q)||String(e.time).toLowerCase().includes(q)||JSON.stringify(e.detail??{}).toLowerCase().includes(q)));
}
export function mountSettings(host,{diagnostics,reportStatus,screenHeading,panel,note,table,stat,esc,exportDiagnostics,fetchImpl=globalThis.fetch}){
 let level="ALL",query="",limit=50,logs=diagnostics.snapshot();
 host.innerHTML=screenHeading("设置","连接状态 · 诊断")+
 '<div class="settings-workspace"><aside class="settings-side">'+panel("服务状态",table(["服务","Status"],[["浏览器应用","已初始化"],["历史报告引擎",reportStatus],["Localnet RPC","未检查"],["项目交易","不可用"]])+
 '<button id="rpc-health" type="button">检查本地连接</button><div id="rpc-health-result" role="status"></div>')+
 note("Diagnostics retain up to 1,000 structured events in this tab. Raw inputs, wallet addresses, private keys, RPC URLs and raw error messages are not stored.")+
 '</aside><section class="settings-content"><h3>会话诊断</h3><div class="stats" data-settings-stats></div>'+
 panel("日志工具",'<div class="row"><button id="log-download" class="primary">导出诊断 JSON</button><button id="log-refresh">刷新</button><button id="log-clear">清空日志</button></div>')+
 panel("近期事件",'<div class="row settings-filter"><label>级别<select data-log-level><option value="ALL">全部</option><option>INFO</option><option>WARN</option><option>ERROR</option></select></label><label>搜索<input type="search" data-log-query placeholder="事件、UTC 时间或详情"></label><label>行数<select data-log-limit><option>50</option><option>100</option><option>250</option><option>1000</option></select></label></div><p class="muted" data-log-count role="status"></p><div data-log-table></div>')+'</section></div>';
 const q=s=>host.querySelector(s);
 function draw(){
  q("[data-settings-stats]").innerHTML=stat("事件数",logs.entries.length)+stat("警告数",logs.entries.filter(x=>x.level==="WARN").length)+stat("错误数",logs.entries.filter(x=>x.level==="ERROR").length)+stat("丢弃数",logs.dropped_count);
  const rows=filterDiagnosticEntries(logs.entries,{level,query});
  q("[data-log-count]").textContent="显示 "+Math.min(limit,rows.length)+" / "+rows.length+" 条匹配事件 · 存储："+logs.persistence_status;
  q("[data-log-table]").innerHTML=table(["UTC","Level","Event","Detail"],rows.slice(0,limit).map(x=>[x.time,x.level,x.event,JSON.stringify(x.detail)]));
 }
 q("[data-log-level]").onchange=e=>{level=e.target.value;draw()};
 q("[data-log-query]").oninput=e=>{query=e.target.value;draw()};
 q("[data-log-limit]").onchange=e=>{limit=Number(e.target.value);draw()};
 q("#log-refresh").onclick=()=>{logs=diagnostics.snapshot();draw()};
 q("#log-clear").onclick=()=>{if(globalThis.confirm("清空会话诊断日志？")){diagnostics.clear();logs=diagnostics.snapshot();draw()}};
 q("#log-download").onclick=async()=>{await exportDiagnostics();if(host.isConnected){logs=diagnostics.snapshot();draw()}};
 q("#rpc-health").onclick=async()=>{const button=q("#rpc-health"),output=q("#rpc-health-result");button.disabled=true;output.textContent="检查中…";try{
 const response=await fetchImpl("/api/terminal/health",{cache:"no-store",signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error("HEALTH_UNAVAILABLE");
 const result=await response.json();if(!output.isConnected)return;output.innerHTML=table(["Check","Status"],[["报告接口",result.report_bridge],["RPC",result.rpc?.status],["最终确认 Slot",result.rpc?.slot],["Version",result.rpc?.version],["创世哈希",result.rpc?.genesis_hash],["网络身份","等待独立验证"]]);
 }catch{if(output.isConnected)output.textContent="本地健康检查接口不可用，请重试。"}finally{if(button.isConnected)button.disabled=false}};
 draw();
}
