import {mountLocalMarket} from "./local-market.mjs";
import {mountLocalTrading} from "./local-trading.mjs";
import {mountLocalFaucet,mountWalletSelector} from "./local-faucet.mjs";
import { buildHistoricalMvpReport } from "../src/inner-market/historical-mvp-report.mjs";
import { getParticipantCatalogue, evaluateParticipantStressCases } from "../src/inner-market/participant-stress-lab.mjs";
import { runParticipantExperiment } from "../src/inner-market/participant-experiment.mjs";
import {buildTerminalCandles} from "../src/inner-market/terminal-candles.mjs";
import {advanceReview,makeReviewArchive,restoreReviewArchive} from "../src/inner-market/terminal-state.mjs";
import { buildUnifiedHistoricalReport } from "../src/inner-market/unified-historical-report.mjs";
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
  const r=buildUnifiedHistoricalReport(input);
  record("report.built",{source_mode:r.source_mode,status:r.status,issue_count:r.issues.length,issues:r.issues,critical_count:r.terminal_state.risk.counts.critical,warning_count:r.terminal_state.risk.counts.warning,unknown_count:r.terminal_state.risk.counts.unknown,buy_count:r.market_history.confirmed_buy_count,sell_count:r.market_history.confirmed_sell_count,duration_ms:Math.round(performance.now()-start)},r.status==="REPORT_READY"?"INFO":"WARN");
  return r;
 }catch(e){record("report.failed",{error_kind:errorKind(e),duration_ms:Math.round(performance.now()-start)},"ERROR");throw e;}
}
const pages=[["terminal","01 操作台"],["wallet","02 钱包管理"],["projects","03 项目档案"],["dashboard","04 复盘分析"],["participants","05 市场风险实验"],["logs","06 系统设置"]];
const fixture=await (async()=>{
 const start=performance.now();
 try{const response=await fetch("../fixtures/synthetic/inner-market-mvp.json");if(!response.ok)throw new Error("Fixture unavailable");const value=await response.json();record("fixture.loaded",{duration_ms:Math.round(performance.now()-start)});return value;}
 catch(e){record("fixture.failed",{error_kind:errorKind(e)},"ERROR");startupFailure(e);throw e;}
})();
const original=structuredClone(fixture);
let data=structuredClone(fixture),report,page="terminal",importTicket=0;
const importCurrent=(ticket,startPage)=>ticket===importTicket&&page===startPage;
try{report=auditedReport(data)}catch(e){startupFailure(e);throw e;}
const esc=s=>String(s??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const solAmount=x=>{if(x==null)return "—";const n=BigInt(x),v=n<0n?-n:n;return (n<0n?"-":"")+(v/1000000000n)+"."+String(v%1000000000n).padStart(9,"0").replace(/0+$/,"").padEnd(2,"0")+" SOL"};
const quoteAmount=(x,asset)=>x==null?"—":asset==="SOL_LAMPORTS"?solAmount(x):x+" base units";
const stat=(name,value)=>'<div class="stat"><small>'+esc(name)+'</small><strong>'+esc(value)+'</strong></div>';
const table=(headers,rows)=>'<div class="scroll"><table><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join("")+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+esc(x)+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';
const note=s=>'<div class="notice">'+esc(s)+'</div>';
const panel=(title,body)=>'<section class="panel"><h3>'+esc(title)+'</h3>'+body+'</section>';
function download(name,text){record("file.export");const a=document.createElement("a");const url=URL.createObjectURL(new Blob([text],{type:"application/json"}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function seriesChart(points,kind){
 const values=points.map(p=>Number(p.value));
 if(!points.length||values.some(v=>!Number.isFinite(v)||v<0))return '<div class="chart-empty">暂无可验证数据</div>';
 const p=points.slice(-60),v=p.map(x=>Number(x.value)),max=Math.max(1,...v),min=kind==="NAV"?Math.min(...v):0,span=Math.max(1,max-min);
 const X=i=>40+i*520/Math.max(1,p.length-1),Y=n=>125-(n-min)/span*100;
 let svg='<svg class="series-chart" viewBox="0 0 600 150" role="img" aria-label="'+esc(kind==="NAV"?"资产净值历史快照":"已确认成交金额")+'">';
 for(const y of [25,75,125])svg+='<path d="M40 '+y+' H560" stroke="#263449" stroke-width="1"/>';
 if(kind==="NAV"){svg+='<polyline fill="none" stroke="#55d6f4" stroke-width="2" points="'+v.map((n,i)=>X(i)+','+Y(n)).join(" ")+'"/>';v.forEach((n,i)=>svg+='<circle cx="'+X(i)+'" cy="'+Y(n)+'" r="3" fill="#55d6f4"/>');}
 else{const bw=Math.min(32,480/p.length);v.forEach((n,i)=>svg+='<rect x="'+(X(i)-bw/2)+'" y="'+Y(n)+'" width="'+bw+'" height="'+(125-Y(n))+'" fill="'+(p[i].side==="BUY"?"#42dfb1":"#ff8293")+'"/>');}
 svg+='<text x="40" y="145" fill="#92a6c0" font-size="10">'+esc(p[0].label)+'</text><text x="560" y="145" text-anchor="end" fill="#92a6c0" font-size="10">'+esc(p.at(-1).label)+'</text></svg>';
 return svg+'<p class="muted">事件序号 · 原始报价资产 base units · '+p.length+' 个观测点 · 最大 '+esc(max)+'</p>';
}
function details(title,value){return '<details class="raw-details"><summary>'+esc(title)+'</summary><pre>'+esc(JSON.stringify(value,null,2))+'</pre></details>'}
function metrics(items){return '<div class="stats">'+items.map(([k,v])=>stat(k,v)).join("")+'</div>'}
function emptyState(title,desc){return '<div class="empty-state"><strong>'+esc(title)+'</strong><span>'+esc(desc)+'</span></div>'}
function compareBars(items,unit){
 const nums=items.map(x=>Number(x[1]));const max=Math.max(1,...nums.filter(Number.isFinite));
 return '<div class="comparison">'+items.map(([label,value,color],i)=>'<div class="comparison-row"><div class="row"><span>'+esc(label)+'</span><strong>'+esc(value==null?"未知":value+" "+unit)+'</strong></div><div class="meter"><span class="'+(color==="red"?"sell":color==="green"?"buy":"neutral")+'" style="width:'+((value==null||!Number.isFinite(nums[i])||nums[i]<0)?0:Math.min(100,nums[i]/max*100))+'%"></span></div></div>').join("")+'</div>';
}
function splitView(left,right){return '<div class="terminal-grid"><div>'+left+'</div><div>'+right+'</div></div>'}
function screenHeading(title,sub){return '<div class="terminal-heading"><div><p class="eyebrow">COOK / OPERATIONS</p><h2>'+esc(title)+'</h2><span class="muted">'+esc(sub)+'</span></div><span class="source-chip">'+(page==="wallet"?"SOL":report.source_mode==="SYNTHETIC"?"未载入项目记录":"历史记录")+'</span></div>'}
let terminalTab="inventory",reviewPaused=false,metadata=null,reviewStage="REVIEW",reviewInput=data,candleInterval=60000;
function candleChart(result){
 if(result.status!=="CONSISTENT")return emptyState(result.status==="EMPTY"?"区间内无成交":"暂无可验证 K 线",result.reason??"无成交事件");
 const points=result.candles.slice(-80),vals=points.flatMap(c=>[Number(c.low_price),Number(c.high_price)]);
 if(vals.some(n=>!Number.isFinite(n)||n<=0))return emptyState("图表超出显示精度","原始价格保留在数据中");
 const lo=Math.min(...vals),hi=Math.max(...vals),span=hi-lo||hi*.01||1;
 const vols=points.map(c=>Number(c.quote_volume_base_units)),maxVol=Math.max(1,...vols);
 const X=i=>48+i*500/Math.max(1,points.length-1),Y=n=>155-(n-lo)/span*120;
 const width=Math.max(2,Math.min(12,480/points.length));
 let svg='<svg class="ohlcv-chart" viewBox="0 0 600 215" role="img" aria-label="历史成交 K 线和成交量">';
 for(const f of [0,.5,1]){const y=Y(lo+span*f);svg+='<path d="M36 '+y+' H550" stroke="#263449"/><text x="598" y="'+(y+3)+'" fill="#92a6c0" font-size="9" text-anchor="end">'+esc((lo+span*f).toPrecision(5))+'</text>';}
 points.forEach((c,i)=>{const o=Number(c.open_price),cl=Number(c.close_price),x=X(i),color=cl>=o?"#42dfb1":"#ff8293",y=Math.min(Y(o),Y(cl));svg+='<path d="M'+x+' '+Y(Number(c.high_price))+' V'+Y(Number(c.low_price))+'" stroke="'+color+'"/><rect x="'+(x-width/2)+'" y="'+y+'" width="'+width+'" height="'+Math.max(1,Math.abs(Y(o)-Y(cl)))+'" fill="'+color+'"/><rect x="'+(x-width/2)+'" y="'+(193-vols[i]/maxVol*28)+'" width="'+width+'" height="'+(vols[i]/maxVol*28)+'" fill="'+color+'" opacity=".55"/>';});
 svg+='<text x="36" y="210" font-size="9" fill="#92a6c0">'+esc(new Date(points[0].interval_start_ms).toISOString())+'</text><text x="550" y="210" text-anchor="end" font-size="9" fill="#92a6c0">'+esc(new Date(points.at(-1).interval_start_ms).toISOString())+'</text></svg>';
 return svg+'<p class="muted">历史成交 · UTC · 价格按来源口径 · 图表原始数值 · 图形为近似显示，原始数值保持精确。</p>';
}
function renderTerminal(){
 const d=report.terminal_state,a=d.treasury,m=d.market,scope=d.scope;
 const ready=d.status==="REPORT_READY";
 const candleResult=buildTerminalCandles(data,candleInterval);
 const candleControls='<div class="row candle-controls">'+[[60000,"1m"],[300000,"5m"],[900000,"15m"],[3600000,"1h"]].map(([ms,label])=>'<button data-candle-interval="'+ms+'" aria-pressed="'+(candleInterval===ms)+'">'+label+'</button>').join("")+'</div>';
 const isSample=d.source_mode==="SYNTHETIC";
 const money=x=>isSample?"—":quoteAmount(x,scope.quoteAsset);
 const tabs=[["trades","成交记录"],["cash","资金流水"],["inventory","库存"],["liquidity","流动性"],["risk","风险与审计"],["logs","运行日志"]];
 const trades=isSample?[]:data.market.trades.filter(x=>x.status==="FINALIZED"&&x.reconciliation==="PASS");
 const snapshots=ready&&!isSample?d.performance.observations:[];
 const rows={
 trades:()=>table(["事件","序号","方向","名义金额","状态"],data.market.trades.map(x=>[x.id,x.sequence,x.side,money(x.quoteNotionalBaseUnits),x.status])),
 cash:()=>table(["事件","类型","金额","对账"],data.cash.entries.map(x=>[x.id,x.kind,money(x.amountBaseUnits),x.reconciliation])),
 inventory:()=>metrics([["期末库存（base units）",a.closing_token_balance_base_units],["库存成本",money(a.remaining_cost_basis_base_units)]])+table(["事件","方向","数量","成本","净收入"],(ready?data.inventory.ledger.position_journal:[]).map(x=>[x.event_id,x.side,x.token_amount_base_units,money(x.cash_cost_quote_base_units),money(x.net_quote_proceeds_base_units)]))+emptyState("逐钱包持仓未接入","当前仅有项目级库存证据"),
 liquidity:()=>table(["储备","原始单位"],[["实际 SOL 储备",money(m.verified_real_reserve_base_units)],["虚拟曲线 SOL 储备",money(report.market_history.virtual_quote_reserves_base_units)],["真实 Token",report.market_history.real_token_reserves_base_units],["虚拟 Token",report.market_history.virtual_token_reserves_base_units]]),
 risk:()=>table(["级别","风险","原因"],d.risk.alerts.map(x=>[x.severity,x.label,x.reason]))+table(["检查","状态","证据"],d.checks.map(x=>[x.id,x.status,x.evidence.join(" / ")]))+details("数据可信状态",d.trust)+details("审计证据",report.audits)+details("历史回执与现金分录证据",d.archived_evidence),
 logs:()=>table(["UTC","级别","事件"],diagnostics.snapshot().entries.slice(-30).reverse().map(x=>[x.time,x.level,x.event]))
 };
 const sourceLabel=isSample?"行情待检查 · 合成样本非链上证据":"历史报告 · "+d.trust.grade+" "+(d.trust.status==="REVIEW_REQUIRED"?"待复核":"内部一致 · 暂定数据");
 const navContent=seriesChart(snapshots.map(x=>({label:x.sequence,value:x.nav_base_units})),"NAV");
 const participantRows=[["买入地址",isSample?"—":report.market_history.buy_address_count??"—"],["卖出地址",isSample?"—":report.market_history.sell_address_count??"—"],["实际 SOL 储备",money(m.verified_real_reserve_base_units)],["历史回撤",isSample||a.max_observed_drawdown_bps==null?"—":Number(a.max_observed_drawdown_bps)/100+"%"]];
 const actionForm='<form id="terminal-meta"><div class="field-pair"><label>名称<input name="name" required maxlength="32" value="'+esc(metadata?.name??"")+'"></label><label>Symbol<input name="symbol" required maxlength="10" value="'+esc(metadata?.symbol??"")+'"></label></div><div class="row"><button type="submit" class="primary">保存发行资料</button><button type="button" disabled>提交发行</button></div><p class="muted">发行接口未接入</p></form>';
 main.innerHTML='<div class="pro-top"><div class="pro-project"><div class="project-avatar" aria-hidden="true">◎</div><div><h2>'+esc(metadata?.symbol||(!isSample?scope.projectId:"未选择 Token"))+' <span class="pair-unit">/ SOL</span></h2><small>'+esc(metadata?.name||(!isSample?scope.tokenMint:"新建项目或载入记录"))+'</small></div></div><div class="pro-top-right"><div id="pro-wallet"></div><button id="open-launch" class="primary">＋ 发币</button><button id="open-data" title="项目数据管理">载入记录</button></div></div>'+
 '<div class="pro-statebar"><span><i class="status-dot"></i> LOCALNET</span><span>'+esc(sourceLabel)+'</span><span>仅 Localnet 测试交易</span><span>阶段：'+esc(isSample?"准备":reviewStage==="ARCHIVED"?"已归档":reviewStage==="SETTLED"?"已结算":"市场记录")+'</span></div>'+
 '<div class="pro-metrics">'+[["资产净值",money(d.performance.closing_nav_base_units)],["可用资金",money(a.closing_cash_base_units)],["已实现收益",money(a.realized_project_pnl_base_units)],["库存成本",money(a.remaining_cost_basis_base_units)],["创作者费",money(a.creator_cash_income_base_units)],["最大回撤",isSample||a.max_observed_drawdown_bps==null?"—":Number(a.max_observed_drawdown_bps)/100+"%"]].map(([k,v])=>'<div class="pro-metric"><span>'+esc(k)+'</span><strong>'+esc(v)+'</strong></div>').join("")+'</div>'+
 '<div class="pro-workspace"><aside class="pro-market"><section class="pro-pane"><h3>市场概览</h3><div class="key-values">'+participantRows.map(([k,v])=>'<div><span>'+esc(k)+'</span><strong>'+esc(v)+'</strong></div>').join("")+'</div></section><section class="pro-pane"><h3>风险监测</h3><div class="key-values"><div><span>证据风险</span><strong>'+esc(isSample?"待载入":d.risk.status)+'</strong></div><div><span>严重 / 警告</span><strong>'+esc(isSample?"—":d.risk.counts.critical+" / "+d.risk.counts.warning)+'</strong></div><div><span>未知项</span><strong>'+esc(isSample?"—":d.risk.counts.unknown)+'</strong></div><div><span>实时市场风险</span><strong>未核验</strong></div></div></section><section class="pro-pane"><h3>生命周期</h3><div class="pro-stage-list">'+["准备","发行","市场监测","结算","归档"].map((x,i)=>'<div class="'+(i===(isSample?0:reviewStage==="ARCHIVED"?4:reviewStage==="SETTLED"?3:2)?"active":"")+'"><i></i>'+esc(x)+'</div>').join("")+'</div></section></aside>'+
 '<section class="pro-pane pro-chart"><div class="pro-pane-head"><div><h3>市场行情</h3><small>OHLCV · '+esc(sourceLabel)+'</small></div>'+candleControls+'</div><div class="pro-chart-body">'+(isSample?'<div id="live-market"><div class="pro-chart-empty"><div><strong>正在读取测试行情</strong></div></div></div>':candleChart(candleResult))+'</div><div class="pro-chart-volume"><div class="pro-volume-label">成交量</div>'+(isSample?'<div class="volume-empty">见上方报价成交量</div>':seriesChart(trades.map(x=>({label:x.sequence,value:x.quoteNotionalBaseUnits,side:x.side})),"TRADE"))+'</div></section>'+
 '<aside class="pro-actions"><section class="pro-pane" id="local-trading"></section><section class="pro-pane"><h3>资产核算</h3><div class="key-values"><div><span>库存成本</span><strong>'+esc(money(a.remaining_cost_basis_base_units))+'</strong></div><div><span>已实现收益</span><strong>'+esc(money(a.realized_project_pnl_base_units))+'</strong></div><div><span>可兑现估值</span><strong>— SOL</strong></div></div></section></aside></div>'+
 '<section class="pro-pane pro-blotter"><div class="pro-blotter-head"><div class="terminal-tabs" role="group" aria-label="操作台明细">'+[["inventory","钱包库存"],...tabs.filter(t=>t[0]!=="inventory"),["nav","资产曲线"]].map(([id,label])=>'<button data-tab="'+id+'" aria-pressed="'+(terminalTab===id)+'">'+label+'</button>').join("")+'</div><button id="terminal-pause">'+(reviewPaused?"恢复浏览":"暂停浏览")+'</button></div><div class="tab-content">'+(reviewPaused?emptyState("浏览已暂停","恢复浏览后查看当前报告明细"):terminalTab==="nav"?navContent:isSample&&terminalTab!=="logs"?emptyState("暂无记录","载入项目数据后显示明细"):rows[terminalTab]())+'</div></section>'+
 '<div class="pro-bottom"><span>数据来源：'+esc(sourceLabel)+(!isSample&&!d.settlement_allowed?" · 未通过独立认证，禁止结算":"")+'</span><div class="row"><button id="terminal-export" '+(isSample?"disabled":"")+'>导出报告</button><button id="terminal-settle" '+(!isSample&&reviewStage==="REVIEW"&&d.settlement_allowed?"":"disabled")+'>测试报告结算</button><button id="terminal-archive" '+(reviewStage==="SETTLED"||reviewStage==="ARCHIVED"?"":"disabled")+'>归档</button></div></div>'+
 '<dialog id="launch-dialog" class="pro-dialog"><div class="pro-dialog-head"><h3>发行配置</h3><button data-close="launch-dialog" aria-label="关闭">×</button></div>'+actionForm+'</dialog>'+
 '<dialog id="data-dialog" class="pro-dialog"><div class="pro-dialog-head"><h3>项目数据</h3><button data-close="data-dialog" aria-label="关闭">×</button></div><label for="terminal-import">导入区间报告</label><input type="file" id="terminal-import" accept=".json"><div class="row"><button id="terminal-local-load" class="primary">读取本地记录</button></div><p id="terminal-error" class="negative" role="status"></p></dialog>';
 if(isSample)mountLocalMarket(main.querySelector("#live-market"),candleInterval,candleChart);
 if(isSample)mountLocalTrading(main.querySelector("#local-trading"));
 else main.querySelector("#local-trading").textContent="历史报告审阅模式：不提供交易操作。";
 mountWalletSelector(main.querySelector("#pro-wallet"),()=>{page="wallet";record("page.open",{page});render()});
 main.querySelector("#open-launch").onclick=()=>main.querySelector("#launch-dialog").showModal();
 main.querySelector("#open-data").onclick=()=>main.querySelector("#data-dialog").showModal();
 main.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>main.querySelector("#"+b.dataset.close).close());
 main.querySelectorAll("[data-candle-interval]").forEach(b=>b.onclick=()=>{candleInterval=Number(b.dataset.candleInterval);render()});
 main.querySelector("#terminal-local-load").onclick=async()=>{const before=data,ticket=++importTicket,startPage=page;try{const response=await fetch("/api/terminal/report",{cache:"no-store",signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error("本地报告桥未配置或数据无效");const next=await response.json();const nextReport=auditedReport(next);if(data!==before||!importCurrent(ticket,startPage))return;data=next;report=nextReport;record("report.import.completed",{page,source_mode:report.source_mode,status:report.status});render()}catch(err){record("report.import.failed",{page,error_kind:errorKind(err)},"ERROR");if(importCurrent(ticket,startPage)){const el=document.querySelector("#terminal-error");if(el)el.textContent=errorKind(err)+"：报告未通过校验";}}};
 main.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{terminalTab=b.dataset.tab;render()});
 main.querySelector("#terminal-meta").onsubmit=e=>{e.preventDefault();metadata=Object.fromEntries(new FormData(e.currentTarget));record("metadata.saved");render()};
 main.querySelector("#terminal-pause").onclick=()=>{reviewPaused=!reviewPaused;render()};
 main.querySelector("#terminal-export").onclick=()=>download("closed-interval-report.json",JSON.stringify({metadata,reviewStage,report},null,2));
 main.querySelector("#terminal-settle").onclick=()=>{reviewStage=advanceReview(reviewStage,"settle",d);record("review.settled",{page});render()};
 main.querySelector("#terminal-archive").onclick=()=>{if(reviewStage==="SETTLED")reviewStage=advanceReview(reviewStage,"archive",d);download("cook-review-archive.json",JSON.stringify(makeReviewArchive(data,metadata,reviewStage),null,2));record("review.archived",{page});render()};
 main.querySelector("#terminal-import").onchange=async e=>{const ticket=++importTicket,startPage=page;try{const f=e.target.files[0];if(!f)return;if(f.size>16*1024*1024)throw Error("报告文件超过 16 MiB");const raw=JSON.parse(await f.text());const restored=raw?.schema_version==="cook-review-archive.1"?restoreReviewArchive(raw):null;const next=restored?.input??raw;const nextReport=auditedReport(next);if(!importCurrent(ticket,startPage))return;data=next;report=nextReport;reviewInput=data;reviewStage=restored?.stage??"REVIEW";metadata=restored?.metadata??null;reviewPaused=false;if(restored)record("review.restored",{page});record("report.import.completed",{page,source_mode:report.source_mode,status:report.status});render()}catch(err){record("report.import.failed",{page,error_kind:errorKind(err)},"ERROR");if(importCurrent(ticket,startPage)){const el=document.querySelector("#terminal-error");if(el)el.textContent=errorKind(err)+"：报告未通过校验";}}};
}
function render(){
 if(reviewInput!==data){reviewInput=data;reviewStage="REVIEW";metadata=null;reviewPaused=false;}
 main.dataset.page=page;
 document.querySelector(".tag").textContent="LOCALNET";
 nav.innerHTML=pages.map(([id,label])=>'<button data-page="'+id+'" class="'+((page===id||id==="market"&&["lab","create"].includes(page))?"active":"")+'"'+(page===id?' aria-current="page"':'')+'><span class="nav-num" aria-hidden="true">'+label.slice(0,2)+'</span><span>'+esc(label.slice(3))+'</span></button>').join("");
 nav.querySelectorAll("button").forEach(b=>b.onclick=()=>{importTicket++;page=b.dataset.page;record("page.open",{page});render()});
 const a=report.accounting,m=report.market_history;
 const links=(items)=>'<div class="row subnav">'+items.map(([id,label])=>'<button data-subpage="'+id+'">'+esc(label)+'</button>').join("")+'</div>';
 const context=()=>note("数据来源："+report.source_mode+" · 离线区间报告；Localnet 实时接口尚未接入。未知值不作估算。");
 if(page==="terminal"){renderTerminal();
 }else if(page==="wallet"){
 main.innerHTML=screenHeading("钱包管理","创建钱包 · 余额与 SOL 充值")+'<section id="funding-panel" class="panel funding-panel"></section>';
 mountLocalFaucet(main.querySelector("#funding-panel"));
 }else if(page==="projects"){
 main.innerHTML=screenHeading("项目档案","当前会话 · 历史区间")+panel("项目记录",table(["项目","Token","来源","审计"],[[data.scope.projectId,data.scope.tokenMint,report.source_mode,report.status+" / "+reviewStage]]))+panel("资料",metadata?table(["字段","内容"],Object.entries(metadata)):emptyState("尚未保存项目资料","在操作台中整理资料"))+details("当前报告",report);
 }else if(page==="dashboard"){
 const d=report.terminal_state,t=d.treasury,v=d.market;
 const sol=x=>{if(x==null)return "未知";if(d.scope.quoteAsset!=="SOL_LAMPORTS")return x+" base units";const n=BigInt(x),abs=n<0n?-n:n;return (n<0n?"-":"")+(abs/1000000000n).toString()+"."+(abs%1000000000n).toString().padStart(9,"0")+" SOL"};
 const known=x=>x==null?"未知":x;
 const fmt=x=>quoteAmount(x,d.scope.quoteAsset);
 const navPoints=d.status==="REPORT_READY"?d.performance.observations.map(x=>({label:x.sequence,value:x.nav_base_units})):[]; 
 const confirmed=data.market.trades.filter(x=>x.status==="FINALIZED"&&x.reconciliation==="PASS");
 main.innerHTML='<div class="terminal-heading"><div><p class="eyebrow">PORTFOLIO / MARKET MONITOR</p><h2>市场与资产总览</h2><span class="muted">'+esc(d.scope.projectId)+' · '+esc(d.source_mode)+' · '+esc(d.scope.openingCutoff)+' → '+esc(d.scope.closingCutoff)+'</span></div><div class="row"><button id="dashboard-reset">重置样本</button><button id="dashboard-export">导出总览</button></div></div>'+
 '<div class="terminal-kpis stats">'+stat("期末现金",fmt(t.closing_cash_base_units))+stat("已实现净收益",fmt(t.realized_project_pnl_base_units))+stat("库存成本",fmt(t.remaining_cost_basis_base_units))+stat("创作者费",fmt(t.creator_cash_income_base_units))+stat("历史回撤",t.max_observed_drawdown_bps==null?"未知":Number(t.max_observed_drawdown_bps)/100+"%")+'</div>'+
 '<div class="terminal-grid"><div>'+panel("资产净值 · 历史快照",seriesChart(navPoints,"NAV"))+panel("成交金额 · 已确认事件",seriesChart(confirmed.map(x=>({label:x.sequence,value:x.quoteNotionalBaseUnits,side:x.side})),"TRADE"))+'</div><div>'+
 panel("市场状态",'<div class="stats">'+stat("买入笔数",v.buy_trade_count)+stat("卖出笔数",v.sell_trade_count)+'</div>'+table(["指标","数值"],[["买入名义额",fmt(v.buy_notional_base_units)],["卖出名义额",fmt(v.sell_notional_base_units)],["真实储备",fmt(v.verified_real_reserve_base_units)],["买入地址",known(v.buy_address_count)],["卖出地址",known(v.sell_address_count)]]))+
 panel("风险与数据",table(["检查","结果"],[["统一审计",d.status],["可信等级",d.trust.grade+" / "+d.trust.status],["历史证据",d.archived_evidence.status],["来源认证","UNKNOWN"],["历史覆盖",v.history_complete?"已声明完整":"待复核"],["Localnet","未接入"]])+(d.issues.length?table(["待复核事项"],d.issues.map(x=>[x])):""))+'</div></div>'+
 panel("项目资金明细",table(["指标","数值"],[["交易支出",fmt(t.actual_trade_spend_base_units)],["交易回款",fmt(t.actual_trade_receipts_base_units)],["净交易支出",fmt(t.net_trade_cash_spend_base_units)],["资本流入",fmt(t.recorded_capital_in_base_units)],["资本流出",fmt(t.recorded_capital_out_base_units)],["独立费用",fmt(t.recorded_expenses_base_units)],["库存数量（base units）",known(t.closing_token_balance_base_units)]]))+
 panel("数据区间",'<label for="dashboard-import">导入完整的历史报告输入 JSON</label><input type="file" id="dashboard-import" accept=".json"><p id="dashboard-error" class="negative"></p><p class="muted">离线区间数据；名义成交额不代表独立需求。未知值不估算。</p>');
 document.querySelector("#dashboard-reset").onclick=()=>{importTicket++;record("sample.reset",{page});data=structuredClone(original);report=auditedReport(data);render()};
 document.querySelector("#dashboard-export").onclick=()=>download("historical-dashboard.json",JSON.stringify(d,null,2));
 document.querySelector("#dashboard-import").onchange=async e=>{const ticket=++importTicket,startPage=page;try{const file=e.target.files[0];if(!file)return;if(file.size>16*1024*1024)throw Error("报告文件超过 16 MiB");record("report.import.started",{page,file_bytes:file.size});const next=JSON.parse(await file.text());const nextReport=auditedReport(next);if(!importCurrent(ticket,startPage))return;data=next;report=nextReport;record("report.import.completed",{page,source_mode:report.source_mode,status:report.status});render()}catch(err){record("report.import.failed",{page,error_kind:errorKind(err)},"ERROR");if(importCurrent(ticket,startPage)){const el=document.querySelector("#dashboard-error");if(el)el.textContent=errorKind(err)+"：报告未通过校验";}}};
 }else if(page==="create"){
 main.innerHTML='<h2>发行资料</h2>'+note("仅用于整理测试资料，不创建 Token、不构造或提交交易。")+'<form id="metadata" class="panel"><div class="grid"><div><label>名称</label><input name="name" required maxlength="32" placeholder="Test Token"></div><div><label>Symbol</label><input name="symbol" required maxlength="10" placeholder="TEST"></div><div><label>Decimals</label><input disabled value="由协议配置读取"></div><div><label>Supply</label><input disabled value="由协议配置读取"></div><div><label>描述</label><textarea name="description" maxlength="1000"></textarea></div><div><label>图片（本地预览）</label><input type="file" id="image" accept="image/png,image/jpeg"><img id="preview" class="preview hidden" alt="图片预览"></div></div><div class="grid"><div><label>Website</label><input name="website" type="url"></div><div><label>Telegram</label><input name="telegram" type="url"></div><div><label>Twitter / X</label><input name="twitter" type="url"></div></div><p class="muted">权限、费用、初始交易结果需由测试环境实际数据验证；本页面不支持钱包连接或买入提交。</p><button class="primary" type="submit">导出本地资料 JSON</button></form>';
 document.querySelector("#metadata").onsubmit=e=>{e.preventDefault();download("synthetic-token-metadata.json",JSON.stringify({sourceMode:"SYNTHETIC",...Object.fromEntries(new FormData(e.currentTarget))},null,2))};
 document.querySelector("#image").onchange=e=>{const f=e.target.files[0];if(!f)return;const p=document.querySelector("#preview");const url=URL.createObjectURL(f);p.onload=()=>URL.revokeObjectURL(url);p.src=url;p.classList.remove("hidden")};
 }else if(page=="wallet"){
 const d=report.terminal_state,t=d.treasury;
 main.innerHTML=screenHeading("Treasury / 资金中心","项目账本 · 报价资产原始单位")+
 metrics([["期末现金",a.closing_cash_base_units],["已实现盈亏",a.realized_project_pnl_base_units],["创作者费",a.creator_cash_income_base_units],["独立费用",t.recorded_expenses_base_units]])+
 splitView(panel("资金收支",compareBars([["交易支出",t.actual_trade_spend_base_units,"red"],["交易回款",t.actual_trade_receipts_base_units,"green"],["创作者收入",a.creator_cash_income_base_units,"green"],["独立费用",t.recorded_expenses_base_units,"red"]],"base units")),panel("财务对账",table(["检查","结果"],[["总账",report.status],["资本流入",t.recorded_capital_in_base_units],["资本流出",t.recorded_capital_out_base_units]]))+emptyState("钱包余额未接入","当前报告仅包含项目级资金证据"))+
 panel("资金流水",table(["记录","类型","金额","对账"],data.cash.entries.map(x=>[x.id,x.kind,x.amountBaseUnits,x.reconciliation])));

 }else if(page==="lab"){
 main.innerHTML='<h2>历史成交测试</h2>'+note("读取固定的合成或已归档历史报告数据，仅进行离线核算。")+'<div class="panel"><div class="row"><button id="reset">恢复默认样本</button><button id="bad">测试缺失交易</button><button id="export">导出报告</button></div><label>导入已标准化历史 JSON</label><input id="load" type="file" accept=".json"><p id="error" class="negative"></p></div>'+panel("逐笔成交记录",table(["事件","序号","方向","金额（base units）","状态"],data.market.trades.map(t=>[t.id,t.sequence,t.side,t.quoteNotionalBaseUnits,t.status])))+details("核算结果原始数据",report);
 document.querySelector("#reset").onclick=()=>{importTicket++;record("sample.reset",{page});data=structuredClone(original);report=auditedReport(data);render()};
 document.querySelector("#bad").onclick=()=>{importTicket++;record("sample.incomplete",{page},"WARN");data=structuredClone(original);data.market.historyComplete=false;report=auditedReport(data);render()};
 document.querySelector("#export").onclick=()=>download("mvp-historical-report.json",JSON.stringify(report,null,2));
 document.querySelector("#load").onchange=async e=>{const ticket=++importTicket,startPage=page;try{const file=e.target.files[0];if(!file)return;if(file.size>16*1024*1024)throw Error("报告文件超过 16 MiB");record("report.import.started",{page,file_bytes:file.size});const next=JSON.parse(await file.text());const nextReport=auditedReport(next);if(!importCurrent(ticket,startPage))return;data=next;report=nextReport;record("report.import.completed",{page,source_mode:report.source_mode,status:report.status});render()}catch(err){record("report.import.failed",{page,error_kind:errorKind(err)},"ERROR");if(importCurrent(ticket,startPage)){const el=document.querySelector("#error");if(el)el.textContent=errorKind(err)+"：报告未通过校验";}}};
 }else if(page=="market"){
 const trades=data.market.trades.filter(x=>x.status==="FINALIZED"&&x.reconciliation==="PASS");
 main.innerHTML=screenHeading("Markets / 市场终端",data.scope.projectId+" · "+data.scope.tokenMint)+
 metrics([["买入笔数",m.confirmed_buy_count],["卖出笔数",m.confirmed_sell_count],["买入名义额",m.gross_buy_notional_base_units],["卖出名义额",m.gross_sell_notional_base_units]])+
 splitView(panel("价格 / OHLCV",emptyState("尚无可验证 OHLCV","需要带时间戳、价格与成交数量的数据"))+panel("成交金额",seriesChart(trades.map(x=>({label:x.sequence,value:x.quoteNotionalBaseUnits,side:x.side})),"TRADE")),panel("储备快照",table(["指标","base units"],[["真实报价储备",m.real_quote_reserves_base_units],["真实 Token 储备",m.real_token_reserves_base_units],["虚拟报价储备",m.virtual_quote_reserves_base_units],["虚拟 Token 储备",m.virtual_token_reserves_base_units]]))+panel("数据质量",table(["检查","状态"],[["审计",report.status],["实时连接","未接入"]])))+
 panel("成交记录",table(["序号","事件","方向","名义金额","状态"],data.market.trades.map(x=>[x.sequence,x.id,x.side,x.quoteNotionalBaseUnits,x.status])));

 }else if(page=="inventory"){
 const valid=report.status==="REPORT_READY",i=data.inventory;
 const journal=valid?i.ledger.position_journal:[];
 main.innerHTML=screenHeading("Inventory / 筹码中心","已核算项目库存 · 不推断外部钱包归属")+
 metrics([["期末库存（base units）",a.closing_token_balance_base_units],["剩余成本（base units）",a.remaining_cost_basis_base_units],["已实现项目盈亏",a.realized_project_pnl_base_units],["库存审计",valid?"通过":"待复核"]])+
 splitView(panel("库存数量变动",compareBars([["期初库存",valid?i.opening.tokens:null,"neutral"],["已买入数量",valid?i.tradeSummary.boughtTokens:null,"green"],["已卖出数量",valid?i.tradeSummary.soldTokens:null,"red"],["期末库存",a.closing_token_balance_base_units,"neutral"]],"base units")),panel("库存数据覆盖",table(["指标","状态"],[["库存成本",report.trust.metrics.cost_basis.status],["钱包级归属","未接入"],["成本分布","未接入"],["可验证估值","未接入"]]))+panel("钱包持仓",emptyState("暂无逐钱包持仓","等待经核验的持仓数据，禁止虚构拆分")))+
 panel("库存交易明细",table(["事件","方向","数量","买入成本","卖出净收入"],journal.map(x=>[x.event_id,x.side,x.token_amount_base_units,x.cash_cost_quote_base_units,x.net_quote_proceeds_base_units])))+details("库存审计原始记录",report.audits);

 }else if(page=="liquidity"){
 main.innerHTML=screenHeading("Liquidity / 流动性中心","Bonding Curve / 储备快照 · 不等同于未来可成交深度")+
 metrics([["真实报价储备",m.real_quote_reserves_base_units],["真实 Token 储备",m.real_token_reserves_base_units],["虚拟报价储备",m.virtual_quote_reserves_base_units],["虚拟 Token 储备",m.virtual_token_reserves_base_units]])+
 splitView(panel("报价资产储备",compareBars([["真实储备",m.real_quote_reserves_base_units,"green"],["虚拟储备",m.virtual_quote_reserves_base_units,"neutral"]],"base units"))+panel("Token 储备",compareBars([["真实储备",m.real_token_reserves_base_units,"green"],["虚拟储备",m.virtual_token_reserves_base_units,"neutral"]],"base units")),panel("市场状态",table(["检查","状态"],[["统一审计",report.status],["生命周期",data.market.snapshot.lifecycle],["深度数据","未接入"],["LP 仓位","未接入"]]))+panel("流动性质量",emptyState("暂无验证深度","需要独立验证的市场深度数据")));

 }else if(page==="participants"){
 const roles=getParticipantCatalogue();
 const results=evaluateParticipantStressCases({base:original,reportBuilder:buildHistoricalMvpReport});
 main.innerHTML=screenHeading("市场风险实验","合成风险场景 · 独立于真实历史数据")+note("固定合成压力场景：验证风险提示和数据核算，不模拟攻击执行、不预测真实钱包行为。角色标签只属于实验。")+
 '<div class="stats">'+stat("角色类别",roles.length)+stat("合成场景",results.length)+stat("预期结果匹配",results.filter(r=>r.passed).length+" / "+results.length)+'</div>'+
 panel("角色与风险特征",table(["角色","特征","观测关注","局限"],roles.map(r=>[r.role,r.traits.join(" / "),r.observable,r.limitation])))+
 panel("固定场景验收",table(["场景","风险","预期","实际","结果"],results.map(r=>[r.title,r.risk_category,r.expected_status,r.actual_status,r.passed?"PASS":"FAIL"])))+
 panel("随机压力实验",'<div class="grid"><div><label for="experiment-seed">随机种子</label><input id="experiment-seed" type="number" min="0" max="4294967295" value="42"></div><div><label for="experiment-runs">每类实验次数</label><input id="experiment-runs" type="number" min="1" max="1000" value="100"></div></div><p class="muted">仅随机抽取预置风险场景，不生成交易；采样权重并非真实行为概率。</p><button id="run-experiment" class="primary">运行随机实验</button> <button id="export-experiment" disabled>导出实验</button><div id="experiment-result"></div>')+
 panel("场景报告",'<button id="export-participants">导出实验结果 JSON</button>'+details("实验原始数据",results));
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
 main.innerHTML=screenHeading("系统设置","连接状态 · 诊断事件 · 数据导入")+panel("服务状态",table(["服务","状态"],[["浏览器应用","已初始化"],["报告引擎",report.status],["Localnet RPC","待检查"],["交易执行","测试链按配置启用"]])+'<div class="row"><button id="rpc-health">检查本地连接</button></div><div id="rpc-health-result" role="status"></div>')+note("仅保存当前页面会话的最近 1000 条结构化诊断事件，刷新页面会重置。不会记录原始输入、钱包地址、私钥、RPC URL 或原始错误信息。")+
 '<div class="stats">'+stat("日志条数",logs.entries.length)+stat("警告",logs.entries.filter(x=>x.level==="WARN").length)+stat("错误",logs.entries.filter(x=>x.level==="ERROR").length)+stat("已滚动丢弃",logs.dropped_count)+'</div>'+
 panel("日志工具",'<div class="row"><button id="log-download" class="primary">导出诊断日志 JSON</button><button id="log-refresh">刷新</button><button id="log-clear">清空日志</button></div>')+
 panel("最近事件",table(["时间 (UTC)","级别","事件","详情"],logs.entries.slice().reverse().map(x=>[x.time,x.level,x.event,JSON.stringify(x.detail)])));
 document.querySelector("#rpc-health").onclick=async()=>{const output=document.querySelector("#rpc-health-result");output.textContent="检查中…";try{const response=await fetch("/api/terminal/health",{cache:"no-store"});if(!response.ok)throw Error("health endpoint unavailable");const result=await response.json();output.innerHTML=table(["检查","状态"],[["报告桥",result.report_bridge],["RPC",result.rpc?.status],["最终确认 slot",result.rpc?.slot],["版本",result.rpc?.version],["Genesis hash",result.rpc?.genesis_hash],["网络身份","待独立核验"]]);}catch{output.textContent="本地检查接口不可用";}};
 document.querySelector("#log-download").onclick=()=>{exportDiagnostics();render()};
 document.querySelector("#log-refresh").onclick=()=>render();
 document.querySelector("#log-clear").onclick=()=>{if(window.confirm("清空当前会话诊断日志？")){diagnostics.clear();render()}};
 }else{
 main.innerHTML=screenHeading("Risk Center / 风险中心","已观测风险与数据质量 · 非交易信号")+panel("风险检查矩阵",table(["类别","状态"],[["财务对账",report.status],["可信等级",report.trust.grade+" / "+report.trust.status],["库存核算",report.trust.metrics.cost_basis.status],["历史回撤",a.max_observed_drawdown_bps==null?"未知":Number(a.max_observed_drawdown_bps)/100+"%"],["实时流动性","未知"],["市场行为风险","未验证"]]))+note("仅核算已发生的历史事件；未通过统一审计时，财务输出为未知。")+'<div class="stats">'+stat("已实现项目盈亏（lamports）",a.realized_project_pnl_base_units)+stat("已到账手续费（lamports）",a.creator_cash_income_base_units)+stat("历史观测回撤（bps）",a.max_observed_drawdown_bps)+stat("审计状态",report.status)+'</div>'+panel("异常清单",report.issues.length?table(["异常"],report.issues.map(x=>[x])):"<p class='positive'>输入样本通过当前审计规则。</p>")+details("详细审计",report.audits)+"<p class='muted'>合成样本通过不等于本地链数据已验证，也不意味着收益可实现。</p>";
 }
 main.insertAdjacentHTML("beforeend",'<div class="row"><button id="quick-log-export">导出诊断日志</button></div>');
 document.querySelector("#quick-log-export").onclick=exportDiagnostics;
 const extras=page==="market"?[["lab","历史回放 / 导入"],["create","发行资料"]]:page==="lab"||page==="create"?[["market","返回市场中心"]]:page==="logs"?[["terminal","返回操作台"]]:[];
 if(extras.length){main.insertAdjacentHTML("afterbegin",links(extras));main.querySelectorAll("[data-subpage]").forEach(b=>b.onclick=()=>{importTicket++;page=b.dataset.subpage;record("page.open",{page});render()});}
 main.insertAdjacentHTML("beforeend",'<p class="foot">Cook System · Localnet · 仅 Localnet 测试交易</p>');
}
render();
