import { buildHistoricalMvpReport } from "../src/inner-market/historical-mvp-report.mjs";
import { getParticipantCatalogue, evaluateParticipantStressCases } from "../src/inner-market/participant-stress-lab.mjs";
import { runParticipantExperiment } from "../src/inner-market/participant-experiment.mjs";
import { buildHistoricalDashboard } from "../src/inner-market/historical-dashboard.mjs";
import {createDiagnosticLog,errorKind} from "./diagnostic-log.mjs";
const main=document.querySelector("#main"),nav=document.querySelector("#nav");
const diagnostics=createDiagnosticLog();
const record=(event,detail={},level="INFO")=>diagnostics.record(event,detail,level);
record("app.start");
window.addEventListener("error",e=>record("runtime.error",{error_kind:errorKind(e.error)},"ERROR"));
window.addEventListener("unhandledrejection",e=>record("runtime.rejection",{error_kind:errorKind(e.reason)},"ERROR"));
function exportDiagnostics(){
 record("log.export");
 download("cook-diagnostics-"+new Date().toISOString().replace(/[:.]/g,"-")+".json",JSON.stringify(diagnostics.snapshot(),null,2));
}
function startupFailure(error){
 main.textContent="启动失败："+errorKind(error)+"。请导出诊断日志。";
 const button=document.createElement("button");button.textContent="导出诊断日志";button.onclick=exportDiagnostics;main.append(button);
}
function auditedReport(input){
 const start=performance.now();
 try{
  const r=buildHistoricalMvpReport(input);
  record("report.built",{source_mode:r.source_mode,status:r.status,issue_count:r.issues.length,issues:r.issues,buy_count:r.market_history.confirmed_buy_count,sell_count:r.market_history.confirmed_sell_count,duration_ms:Math.round(performance.now()-start)},r.status==="REPORT_READY"?"INFO":"WARN");
  return r;
 }catch(e){record("report.failed",{error_kind:errorKind(e),duration_ms:Math.round(performance.now()-start)},"ERROR");throw e;}
}
const pages=[["dashboard","00 市场与资产总览"],["create","01 发行资料"],["wallet","02 钱包账本"],["lab","03 历史成交测试"],["market","04 市场监控"],["profit","05 收益与风险"],["participants","06 竞争环境实验室"],["logs","07 诊断日志"]];
const fixture=await (async()=>{
 const start=performance.now();
 try{const response=await fetch("../fixtures/synthetic/inner-market-mvp.json");if(!response.ok)throw new Error("Fixture unavailable");const value=await response.json();record("fixture.loaded",{duration_ms:Math.round(performance.now()-start)});return value;}
 catch(e){record("fixture.failed",{error_kind:errorKind(e)},"ERROR");startupFailure(e);throw e;}
})();
const original=structuredClone(fixture);
let data=structuredClone(fixture),report,page="dashboard";
try{report=auditedReport(data)}catch(e){startupFailure(e);throw e;}
const esc=s=>String(s??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const stat=(name,value)=>'<div class="stat"><small>'+esc(name)+'</small><strong>'+esc(value)+'</strong></div>';
const table=(headers,rows)=>'<div class="scroll"><table><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join("")+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+esc(x)+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';
const note=s=>'<div class="notice">'+esc(s)+'</div>';
const panel=(title,body)=>'<section class="panel"><h3>'+esc(title)+'</h3>'+body+'</section>';
function download(name,text){record("file.export");const a=document.createElement("a");const url=URL.createObjectURL(new Blob([text],{type:"application/json"}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function render(){
 main.dataset.page=page;
 document.querySelector(".tag").textContent="OFFLINE · "+report.source_mode;
 nav.innerHTML=pages.map(([id,label])=>'<button data-page="'+id+'" class="'+(page===id?"active":"")+'"'+(page===id?' aria-current="page"':'')+'><span class="nav-num" aria-hidden="true">'+label.slice(0,2)+'</span><span>'+esc(label.slice(3))+'</span></button>').join("");
 nav.querySelectorAll("button").forEach(b=>b.onclick=()=>{page=b.dataset.page;record("page.open",{page});render()});
 const a=report.accounting,m=report.market_history;
 if(page==="dashboard"){
 const d=buildHistoricalDashboard(data),t=d.treasury,v=d.market;
 const sol=x=>{if(x==null)return "未知";if(d.scope.quoteAsset!=="SOL_LAMPORTS")return x+" base units";const n=BigInt(x),abs=n<0n?-n:n;return (n<0n?"-":"")+(abs/1000000000n).toString()+"."+(abs%1000000000n).toString().padStart(9,"0")+" SOL"};
 const known=x=>x==null?"未知":x;
 main.innerHTML='<p class="eyebrow">OVERVIEW / MARKET & TREASURY</p><h2>市场与资产总览</h2>'+note("离线历史区间 · "+d.source_mode+" · "+d.scope.openingCutoff+" — "+d.scope.closingCutoff+"。导入新报告后刷新全部指标，不连接实时交易。")+
 panel("数据区间",'<div class="row"><button id="dashboard-reset">恢复合成样本</button><button id="dashboard-export">导出总览</button></div><label for="dashboard-import">导入完整的历史报告输入 JSON</label><input type="file" id="dashboard-import" accept=".json"><p id="dashboard-error" class="negative"></p>')+
 panel("历史市场活动",'<div class="stats">'+stat("买入地址数",known(v.buy_address_count))+stat("卖出地址数",known(v.sell_address_count))+stat("买入笔数",v.buy_trade_count)+stat("卖出笔数",v.sell_trade_count)+'</div>'+table(["指标","实际值"],[["历史买入名义额",sol(v.buy_notional_base_units)],["历史卖出名义额",sol(v.sell_notional_base_units)],["历史真实 SOL 储备",sol(v.verified_real_reserve_base_units)]])+'<p class="muted">地址数不是人数；成交总额不等于独立资金流入。缺失地址则显示未知。</p>')+
 panel("Dev 项目资金",'<div class="stats">'+stat("实际买入支出",sol(t.actual_trade_spend_base_units))+stat("实际卖出回款",sol(t.actual_trade_receipts_base_units))+stat("净交易支出",sol(t.net_trade_cash_spend_base_units))+stat("剩余现金",sol(t.closing_cash_base_units))+'</div>'+table(["指标","实际值"],[["区间新增资本",sol(t.recorded_capital_in_base_units)],["区间资本撤回",sol(t.recorded_capital_out_base_units)],["独立记账费用",sol(t.recorded_expenses_base_units)],["剩余库存（base units）",known(t.closing_token_balance_base_units)],["库存成本",sol(t.remaining_cost_basis_base_units)],["已实现项目盈亏",sol(t.realized_project_pnl_base_units)],["已到账创作者费",sol(t.creator_cash_income_base_units)]])+'<p class="muted">实际买卖资金与资本注入、运营费用分开核算；区间数值不等同于全生命周期。</p>')+
 panel("风险与数据可信度",'<div class="stats">'+stat("统一审计",d.status)+stat("历史回撤",t.max_observed_drawdown_bps==null?"未知":Number(t.max_observed_drawdown_bps)/100+"%")+stat("历史数据覆盖",v.history_complete?"已声明完整":"待复核")+'</div>'+(d.issues.length?table(["待复核事项"],d.issues.map(x=>[x])):'<p class="positive">当前输入通过已实现审计规则，不代表未来交易安全。</p>')+'<p class="muted">真实储备不是未来卖出可回收金额；不提供加仓信号或针对其他持有人的交易建议。</p>');
 document.querySelector("#dashboard-reset").onclick=()=>{record("sample.reset",{page});data=structuredClone(original);report=auditedReport(data);render()};
 document.querySelector("#dashboard-export").onclick=()=>download("historical-dashboard.json",JSON.stringify(d,null,2));
 document.querySelector("#dashboard-import").onchange=async e=>{try{const file=e.target.files[0];if(!file)return;record("report.import.started",{page,file_bytes:file.size});const next=JSON.parse(await file.text());buildHistoricalDashboard(next);const nextReport=auditedReport(next);data=next;report=nextReport;record("report.import.completed",{page,source_mode:report.source_mode,status:report.status});render()}catch(err){record("report.import.failed",{page,error_kind:errorKind(err)},"ERROR");document.querySelector("#dashboard-error").textContent=err.message}};
 }else if(page==="create"){
 main.innerHTML='<h2>发行资料</h2>'+note("仅用于整理测试资料，不创建 Token、不构造或提交交易。")+'<form id="metadata" class="panel"><div class="grid"><div><label>名称</label><input name="name" required maxlength="32" placeholder="Test Token"></div><div><label>Symbol</label><input name="symbol" required maxlength="10" placeholder="TEST"></div><div><label>Decimals</label><input disabled value="由协议配置读取"></div><div><label>Supply</label><input disabled value="由协议配置读取"></div><div><label>描述</label><textarea name="description" maxlength="1000"></textarea></div><div><label>图片（本地预览）</label><input type="file" id="image" accept="image/png,image/jpeg"><img id="preview" class="preview hidden" alt="图片预览"></div></div><div class="grid"><div><label>Website</label><input name="website" type="url"></div><div><label>Telegram</label><input name="telegram" type="url"></div><div><label>Twitter / X</label><input name="twitter" type="url"></div></div><p class="muted">权限、费用、初始交易结果需由测试环境实际数据验证；本页面不支持钱包连接或买入提交。</p><button class="primary" type="submit">导出本地资料 JSON</button></form>';
 document.querySelector("#metadata").onsubmit=e=>{e.preventDefault();download("synthetic-token-metadata.json",JSON.stringify({sourceMode:"SYNTHETIC",...Object.fromEntries(new FormData(e.currentTarget))},null,2))};
 document.querySelector("#image").onchange=e=>{const f=e.target.files[0];if(!f)return;const p=document.querySelector("#preview");const url=URL.createObjectURL(f);p.onload=()=>URL.revokeObjectURL(url);p.src=url;p.classList.remove("hidden")};
 }else if(page==="wallet"){
 main.innerHTML='<h2>钱包账本</h2>'+note("此合成样本仅提供项目总账，未提供逐钱包归属或余额证据，不虚构拆分持仓。")+'<div class="stats">'+stat("项目现金（lamports）",a.closing_cash_base_units)+stat("库存（base units）",a.closing_token_balance_base_units)+stat("成本（lamports）",a.remaining_cost_basis_base_units)+'</div>'+panel("项目资产流水",table(["记录","类型","金额","对账"],data.cash.entries.map(x=>[x.id,x.kind,x.amountBaseUnits,x.reconciliation])))+panel("钱包级数据","<p class='muted'>待输入经验证的逐钱包历史账本。所有自有钱包应在报告范围内披露；本页不提供私钥录入或批量交易。</p>");
 }else if(page==="lab"){
 main.innerHTML='<h2>历史成交测试</h2>'+note("读取固定的合成或已归档历史报告数据，仅进行离线核算。")+'<div class="panel"><div class="row"><button id="reset">恢复默认样本</button><button id="bad">测试缺失交易</button><button id="export">导出报告</button></div><label>导入已标准化历史 JSON</label><input id="load" type="file" accept=".json"><p id="error" class="negative"></p></div>'+panel("逐笔成交记录",table(["事件","序号","方向","金额（base units）","状态"],data.market.trades.map(t=>[t.id,t.sequence,t.side,t.quoteNotionalBaseUnits,t.status])))+panel("核算结果","<pre>"+esc(JSON.stringify(report,null,2))+"</pre>");
 document.querySelector("#reset").onclick=()=>{record("sample.reset",{page});data=structuredClone(original);report=auditedReport(data);render()};
 document.querySelector("#bad").onclick=()=>{record("sample.incomplete",{page},"WARN");data=structuredClone(original);data.market.historyComplete=false;report=auditedReport(data);render()};
 document.querySelector("#export").onclick=()=>download("mvp-historical-report.json",JSON.stringify(report,null,2));
 document.querySelector("#load").onchange=async e=>{try{const file=e.target.files[0];if(!file)return;record("report.import.started",{page,file_bytes:file.size});const next=JSON.parse(await file.text());const nextReport=auditedReport(next);data=next;report=nextReport;record("report.import.completed",{page,source_mode:report.source_mode,status:report.status});render()}catch(err){record("report.import.failed",{page,error_kind:errorKind(err)},"ERROR");document.querySelector("#error").textContent=err.message}};
 }else if(page==="market"){
 main.innerHTML='<h2>市场监控 · 历史快照</h2>'+note("仅显示已归档的成交汇总和储备，不进行市场预测。数据模式："+report.source_mode)+'<div class="stats">'+stat("买入记录",m.confirmed_buy_count)+stat("卖出记录",m.confirmed_sell_count)+stat("真实 SOL 储备（lamports）",m.real_quote_reserves_base_units)+stat("真实 Token 储备（base units）",m.real_token_reserves_base_units)+'</div>'+panel("储备快照",table(["项目","数值（base units）"],[["虚拟 SOL",m.virtual_quote_reserves_base_units],["虚拟 Token",m.virtual_token_reserves_base_units],["真实 SOL",m.real_quote_reserves_base_units],["真实 Token",m.real_token_reserves_base_units]]))+panel("历史成交汇总",table(["方向","名义成交额"],[["BUY",m.gross_buy_notional_base_units],["SELL",m.gross_sell_notional_base_units]]))+"<p class='muted'>当前报告没有 K 线或 Holder 明细数据，不补造图表。</p>";
 }else if(page==="participants"){
 const roles=getParticipantCatalogue();
 const results=evaluateParticipantStressCases({base:original,reportBuilder:buildHistoricalMvpReport});
 main.innerHTML='<h2>竞争环境实验室</h2>'+note("固定合成压力场景：验证风险提示和数据核算，不模拟攻击执行、不预测真实钱包行为。角色标签只属于实验。")+
 '<div class="stats">'+stat("角色类别",roles.length)+stat("合成场景",results.length)+stat("预期结果匹配",results.filter(r=>r.passed).length+" / "+results.length)+'</div>'+
 panel("角色与风险特征",table(["角色","特征","观测关注","局限"],roles.map(r=>[r.role,r.traits.join(" / "),r.observable,r.limitation])))+
 panel("固定场景验收",table(["场景","风险","预期","实际","结果"],results.map(r=>[r.title,r.risk_category,r.expected_status,r.actual_status,r.passed?"PASS":"FAIL"])))+
 panel("随机压力实验",'<div class="grid"><div><label for="experiment-seed">随机种子</label><input id="experiment-seed" type="number" min="0" max="4294967295" value="42"></div><div><label for="experiment-runs">每类实验次数</label><input id="experiment-runs" type="number" min="1" max="1000" value="100"></div></div><p class="muted">仅随机抽取预置风险场景，不生成交易；采样权重并非真实行为概率。</p><button id="run-experiment" class="primary">运行随机实验</button> <button id="export-experiment" disabled>导出实验</button><div id="experiment-result"></div>')+
 panel("场景报告",'<button id="export-participants">导出实验结果 JSON</button><pre>'+esc(JSON.stringify(results,null,2))+"</pre>");
 let experiment=null;
 document.querySelector("#run-experiment").onclick=()=>{
  const el=document.querySelector("#experiment-result"),exportButton=document.querySelector("#export-experiment");
  try{
   const seed=Number(document.querySelector("#experiment-seed").value),runs=Number(document.querySelector("#experiment-runs").value),start=performance.now();
   record("experiment.started",{seed,runs});
   experiment=runParticipantExperiment({base:original,seed,runs});
   record("experiment.completed",{trial_count:experiment.total_trials,match_count:experiment.total_matches,duration_ms:Math.round(performance.now()-start)});
   el.innerHTML='<div class="stats">'+stat("总实验数",experiment.total_trials)+stat("预期匹配",experiment.total_matches)+'</div>'+table(["角色","实验数","扰动次数","需复核次数","预期匹配"],experiment.summaries.map(s=>[s.role,s.runs,s.stress_trials,s.review_required,s.expected_outcome_matches]));
   exportButton.disabled=false;
  }catch(err){record("experiment.failed",{error_kind:errorKind(err)},"ERROR");experiment=null;exportButton.disabled=true;el.textContent=err.message}
 };
 document.querySelector("#export-experiment").onclick=()=>{if(experiment)download("synthetic-participant-experiment.json",JSON.stringify(experiment,null,2))};
 document.querySelector("#export-participants").onclick=()=>download("synthetic-participant-stress-results.json",JSON.stringify(results,null,2));
 }else if(page==="logs"){
 const logs=diagnostics.snapshot();
 main.innerHTML='<h2>诊断日志</h2>'+note("仅保存当前页面会话的最近 1000 条结构化诊断事件，刷新页面会重置。不会记录原始输入、钱包地址、私钥、RPC URL 或原始错误信息。")+
 '<div class="stats">'+stat("日志条数",logs.entries.length)+stat("警告",logs.entries.filter(x=>x.level==="WARN").length)+stat("错误",logs.entries.filter(x=>x.level==="ERROR").length)+stat("已滚动丢弃",logs.dropped_count)+'</div>'+
 panel("日志工具",'<div class="row"><button id="log-download" class="primary">导出诊断日志 JSON</button><button id="log-refresh">刷新</button><button id="log-clear">清空日志</button></div>')+
 panel("最近事件",table(["时间 (UTC)","级别","事件","详情"],logs.entries.slice().reverse().map(x=>[x.time,x.level,x.event,JSON.stringify(x.detail)])));
 document.querySelector("#log-download").onclick=()=>{exportDiagnostics();render()};
 document.querySelector("#log-refresh").onclick=()=>render();
 document.querySelector("#log-clear").onclick=()=>{if(window.confirm("清空当前会话诊断日志？")){diagnostics.clear();render()}};
 }else{
 main.innerHTML='<h2>收益与风险</h2>'+note("仅核算已发生的历史事件；未通过统一审计时，财务输出为未知。")+'<div class="stats">'+stat("已实现项目盈亏（lamports）",a.realized_project_pnl_base_units)+stat("已到账手续费（lamports）",a.creator_cash_income_base_units)+stat("历史观测回撤（bps）",a.max_observed_drawdown_bps)+stat("审计状态",report.status)+'</div>'+panel("异常清单",report.issues.length?table(["异常"],report.issues.map(x=>[x])):"<p class='positive'>输入样本通过当前审计规则。</p>")+panel("详细审计","<pre>"+esc(JSON.stringify(report.audits,null,2))+"</pre>")+"<p class='muted'>合成样本通过不等于本地链数据已验证，也不意味着收益可实现。</p>";
 }
 main.insertAdjacentHTML("beforeend",'<div class="row"><button id="quick-log-export">导出诊断日志</button></div>');
 document.querySelector("#quick-log-export").onclick=exportDiagnostics;
 main.insertAdjacentHTML("beforeend",'<p class="foot">Cook System · Offline MVP · '+esc(report.source_mode)+' · Execution disabled</p>');
}
render();
