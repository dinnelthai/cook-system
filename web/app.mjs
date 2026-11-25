import {projectOverviewModel,projectIntervalMetrics} from "./project-overview-view.mjs";
import {mountLocalFaucet} from "./local-faucet.mjs";
import { buildHistoricalMvpReport } from "../src/inner-market/historical-mvp-report.mjs";
import { getParticipantCatalogue, evaluateParticipantStressCases } from "../src/inner-market/participant-stress-lab.mjs";
import { runParticipantExperiment } from "../src/inner-market/participant-experiment.mjs";
import {buildTerminalCandles} from "../src/inner-market/terminal-candles.mjs";
import {advanceReview,makeReviewArchive,restoreReviewArchive} from "../src/inner-market/terminal-state.mjs";
import { buildUnifiedHistoricalReport } from "../src/inner-market/unified-historical-report.mjs";
import {createDiagnosticLog,errorKind} from "./diagnostic-log.mjs";
import {collectDiagnosticBundle} from "./diagnostic-bundle.mjs";
import {historicalReviewRows} from "./historical-review-view.mjs";
import {buildProjectFinancialCloseReview} from "../src/inner-market/project-financial-close-review.mjs";
import {financialCloseRows} from "./financial-close-view.mjs";
import {buildCreatorFeeLedgerReport} from "../src/inner-market/creator-fee-ledger-report.mjs";
import {creatorFeeLedgerRows} from "./creator-fee-ledger-view.mjs";
import {reviewSyntheticLedgerInput} from "./synthetic-ledger-view.mjs";
import {reviewSyntheticBatchInput} from "./synthetic-batch-view.mjs";
import {createHistoricalProjectCatalogue} from "../src/inner-market/historical-project-catalogue.mjs";
import {listHistoricalProjects,exportHistoricalWorkspace,restoreHistoricalWorkspace,WORKSPACE_MAX_BYTES} from "../src/inner-market/historical-project-workspace.mjs";
import {requestHistoricalWorkspace,queryHistoricalWorkspace} from "./historical-workspace-client.mjs";
import {mountSavedProjectReview} from "./saved-project-review.mjs";
import {mountGraduationReview} from "./graduation-review-view.mjs";
import {mountProjectLifecycleReview} from "./project-lifecycle-review-view.mjs";
import {describeProjectReviewWorkflow} from "../src/inner-market/project-review-workflow.mjs";
import {summarizeImportedParticipantValidation,compareImportedParticipantValidation} from "./participant-validation-view.mjs";
import {createProjectRegistry} from "./project-registry.mjs";
import {mountProjectSetup} from "./project-setup-view.mjs";
import {getProjectDirectory,getProjectLifecycleEvidence,reviewProjectGraduationHistory,listProjectArchive,reviewProjectCloseEvidence,exportProjectAuditBundle,reviewProjectTreasury,getProjectRiskReview,reviewProjectMarketEvidence,getProjectBusinessReview,selectProjectRuntimeInterval} from "./project-client.mjs";
import {treasuryReviewSections} from "./treasury-review-view.mjs";
import {mountOrderReview} from "./order-review-view.mjs";
import {matchProjectReport} from "../src/inner-market/project-report-identity.mjs";
const main=document.querySelector("#main"),nav=document.querySelector("#nav");
// Session storage retains diagnostics across refreshes in the same tab, without cross-tab writers.
const diagnostics=createDiagnosticLog({storage:(()=>{try{return window.sessionStorage;}catch{return null;}})()});
const record=(event,detail={},level="INFO")=>diagnostics.record(event,detail,level);
record("app.start");
window.addEventListener("error",e=>record("runtime.error",{error_kind:errorKind(e.error)},"ERROR"));
window.addEventListener("unhandledrejection",e=>record("runtime.rejection",{error_kind:errorKind(e.reason)},"ERROR"));
async function exportDiagnostics(){
 record("log.export");
 const bundle=await collectDiagnosticBundle(diagnostics.snapshot());
 download("cook-diagnostics-"+new Date().toISOString().replace(/[:.]/g,"-")+".json",JSON.stringify(bundle,null,2));
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
const pages=[["terminal","01 操作台"],["create","02 项目准备与发行台账"],["wallet","03 钱包管理"],["projects","04 项目档案"],["dashboard","05 复盘分析"],["participants","06 市场风险实验"],["logs","07 系统设置"]];
const fixture=await (async()=>{
 const start=performance.now();
 try{const response=await fetch("../fixtures/synthetic/inner-market-mvp.json");if(!response.ok)throw new Error("Fixture unavailable");const value=await response.json();record("fixture.loaded",{duration_ms:Math.round(performance.now()-start)});return value;}
 catch(e){record("fixture.failed",{error_kind:errorKind(e)},"ERROR");startupFailure(e);throw e;}
})();
const original=structuredClone(fixture);
let projectCatalogue=createHistoricalProjectCatalogue(),catalogueSelection=null,graduationReview=null,lifecycleReview=null;
const projectRegistry=createProjectRegistry();
let activeProjectId=null,projectMessage="",terminalContextVersion=0;
let workspaceRevision=null,workspaceBusy=false,workspaceMessage="尚未读取数据库；文件导入导出仍可使用。",workspaceVersions=[];
let data=structuredClone(fixture),report,page="terminal",importTicket=0,offlineReview=false,workflowMessage="";
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
 const isSynthetic=d.source_mode==="SYNTHETIC",isSample=!offlineReview&&isSynthetic;
 const workflow=describeProjectReviewWorkflow({state:d,loaded:!isSample,metadata,reviewStage});
 const money=x=>isSample?"—":quoteAmount(x,scope.quoteAsset);
 const tabs=[["trades","成交记录"],["cash","资金流水"],["inventory","库存"],["liquidity","流动性"],["finance","财务结算复核"],["creator-fees","Creator Fee"],["risk","风险与审计"],["logs","运行日志"]];
 const trades=isSample?[]:data.market.trades.filter(x=>x.status==="FINALIZED"&&x.reconciliation==="PASS");
 const snapshots=ready&&!isSample?d.performance.observations:[];
 let closeReview=null;
 const getCloseReview=()=>closeReview??=buildProjectFinancialCloseReview(data);
 let feeReview=null;
 const getFeeReview=()=>feeReview??=buildCreatorFeeLedgerReport({scope:data.scope,creator:data.creator,cash:data.cash});
 const rows={
 finance:()=>{const review=getCloseReview(),groups=financialCloseRows(review);return note("库存成本证据覆盖："+d.trust.metrics.cost_basis.coverage_status+" · 已实现损益证据覆盖："+d.trust.metrics.realized_pnl.coverage_status+" · 均未独立认证")+note("历史区间复核 · "+review.status+" · 来源、归属、估值未独立认证。不是退出执行或真实结算。")+table(["项目","来源","起始","结束"],[[scope.projectId,review.source_mode,scope.openingCutoff,scope.closingCutoff]])+groups.map(g=>'<h3>'+esc(g.label)+'</h3>'+table(["指标","值"],g.rows.map(([label,value,unit])=>[label,unit==="quote"?money(value):value??"未知"]))).join("")+table(["检查","状态","证据"],review.review_checks.map(c=>[c.id,c.status,c.evidence.join(" / ")]))+'<button id="financial-close-export">导出财务复核报告</button>';},
 "creator-fees":()=>{const r=getFeeReview();return note("Creator Fee 子账 · "+r.status+" · 应收不等于到账，PumpSwap Fee Bucket 不等于钱包收入。")+creatorFeeLedgerRows(r).map(g=>"<h3>"+esc(g.label)+"</h3>"+table(g.headers,g.rows)).join("")+details("审计限制",r.notes)+'<button id="creator-fee-export">导出 Creator Fee 子账</button>';},
 trades:()=>table(["事件","序号","方向","名义金额","状态"],data.market.trades.map(x=>[x.id,x.sequence,x.side,money(x.quoteNotionalBaseUnits),x.status])),
 cash:()=>table(["事件","类型","金额","对账"],data.cash.entries.map(x=>[x.id,x.kind,money(x.amountBaseUnits),x.reconciliation])),
 inventory:()=>metrics([["期末库存（base units）",isSample?null:a.closing_token_balance_base_units],["库存成本",money(a.remaining_cost_basis_base_units)]])+table(["事件","方向","数量","成本","净收入"],(ready?data.inventory.ledger.position_journal:[]).map(x=>[x.event_id,x.side,x.token_amount_base_units,money(x.cash_cost_quote_base_units),money(x.net_quote_proceeds_base_units)]))+emptyState("逐钱包持仓未接入","当前仅有项目级库存证据"),
 liquidity:()=>table(["储备","原始单位"],[["实际 SOL 储备",money(m.verified_real_reserve_base_units)],["虚拟曲线 SOL 储备",money(report.market_history.virtual_quote_reserves_base_units)],["真实 Token",report.market_history.real_token_reserves_base_units],["虚拟 Token",report.market_history.virtual_token_reserves_base_units]]),
 risk:()=>table(["级别","风险","原因"],d.risk.alerts.map(x=>[x.severity,x.label,x.reason]))+table(["检查","状态","证据"],d.checks.map(x=>[x.id,x.status,x.evidence.join(" / ")]))+details("历史市场状态",d.market_state)+details("数据可信状态",d.trust)+details("审计证据",report.audits)+details("历史回执与现金分录证据",d.archived_evidence)+details("期末账户汇总审计",d.closing_account_set),
 logs:()=>table(["UTC","级别","事件"],diagnostics.snapshot().entries.slice(-30).reverse().map(x=>[x.time,x.level,x.event]))
 };
 const sourceLabel=isSample?"合成验收样本 · 非实时行情 · 交易执行禁用":(isSynthetic?"合成测试报告 · 非链上证据":"历史报告")+" · "+d.trust.grade+" "+(d.trust.status==="REVIEW_REQUIRED"?"待复核":"内部一致 · 暂定数据");
 const navContent=seriesChart(snapshots.map(x=>({label:x.sequence,value:x.nav_base_units})),"NAV");
 const participantRows=[["买入地址",isSample?"—":report.market_history.buy_address_count??"—"],["卖出地址",isSample?"—":report.market_history.sell_address_count??"—"],["实际 SOL 储备",money(m.verified_real_reserve_base_units)],["历史回撤",isSample||a.max_observed_drawdown_bps==null?"—":Number(a.max_observed_drawdown_bps)/100+"%"]];
 const actionForm='<form id="terminal-meta"><div class="field-pair"><label>名称<input name="name" required maxlength="32" value="'+esc(metadata?.name??"")+'"></label><label>Symbol<input name="symbol" required maxlength="10" value="'+esc(metadata?.symbol??"")+'"></label></div><div class="row"><button type="submit" class="primary">保存项目资料</button><button type="button" disabled>提交发行</button></div><p class="muted">仅保存当前会话资料，不代表已发行，不调用发行接口。</p></form>';
 main.innerHTML='<div class="pro-top"><div class="pro-project"><div class="project-avatar" aria-hidden="true">◎</div><div><h2>项目操作台</h2><small>项目运营上下文与离线报告隔离</small></div></div><div class="pro-top-right"><span class="muted">PROJECT CONTEXT</span><button id="open-launch" class="primary">＋ 项目准备</button><button id="open-data" title="项目数据管理">载入记录</button></div></div>'+
 '<div id="terminal-project-context" class="pro-statebar">正在读取 Project 数据…</div>'+
 '<div id="terminal-context-notice" role="status"></div>'+ 
 '<section id="terminal-business-review" class="pro-pane" hidden></section>'+
 '<details id="terminal-project-details" class="project-secondary" hidden><summary>证据管理与详细复核</summary><section id="terminal-market-evidence" class="pro-pane" hidden></section>'+ 
 '<section id="terminal-risk-review" class="pro-pane" hidden></section>'+ 
 '<section id="terminal-lifecycle-evidence" class="pro-pane" hidden></section>'+ 
 '<section id="terminal-order-review" class="pro-pane" hidden></section></details>'+
 '<div id="terminal-report-area"'+(activeProjectId?' hidden inert style="display:none"':'')+'>'+
 '<section class="pro-pane"><h3>独立离线报告</h3><p class="muted">报告项目：'+esc(scope.projectId)+' · Mint：'+esc(scope.tokenMint)+' · '+esc(sourceLabel)+'</p></section>'+
  '<div class="pro-statebar"><span><i class="status-dot"></i> '+(isSample?"SYNTHETIC SAMPLE":"OFFLINE REVIEW")+'</span><span>'+esc(sourceLabel)+'</span><span>'+(isSample?"仅展示合成样本 · 执行禁用":"离线审阅 · 禁止交易")+'</span><span>阶段：'+esc(workflow.review_status)+'</span></div>'+
 '<section class="pro-pane" style="margin-bottom:12px"><h3>项目业务流程 · '+esc(workflow.review_status)+'</h3>'+table(["业务阶段","状态","说明"],workflow.steps.map(x=>[x.label,x.status,x.note]))+'<div class="row"><button id="workflow-sample">载入离线验收样本</button><button id="workflow-cash" '+(isSample?"disabled":"")+'>资金流水</button><button id="workflow-finance" '+(isSample?"disabled":"")+'>财务结算复核</button><button id="workflow-risk" '+(isSample?"disabled":"")+'>风险复核</button><button id="workflow-graduation">毕业与外盘审阅</button><button id="workflow-save" '+(isSample||workspaceBusy?"disabled":"")+'>加入项目档案</button><button id="workflow-export" '+(isSample?"disabled":"")+'>导出原始报告</button></div><p role="status" class="muted">'+esc(workflowMessage)+'</p></section>'+
 '<div class="pro-metrics">'+[["历史期末净值",money(d.performance.closing_nav_base_units)],["历史期末现金",money(a.closing_cash_base_units)],["已实现收益",money(a.realized_project_pnl_base_units)],["库存成本",money(a.remaining_cost_basis_base_units)],["创作者费",money(a.creator_cash_income_base_units)],["最大回撤",isSample||a.max_observed_drawdown_bps==null?"—":Number(a.max_observed_drawdown_bps)/100+"%"]].map(([k,v])=>'<div class="pro-metric"><span>'+esc(k)+'</span><strong>'+esc(v)+'</strong></div>').join("")+'</div>'+
 '<div class="pro-workspace"><aside class="pro-market"><section class="pro-pane"><h3>市场概览</h3><div class="key-values">'+participantRows.map(([k,v])=>'<div><span>'+esc(k)+'</span><strong>'+esc(v)+'</strong></div>').join("")+'</div></section><section class="pro-pane"><h3>风险监测</h3><div class="key-values"><div><span>证据风险</span><strong>'+esc(isSample?"待载入":d.risk.status)+'</strong></div><div><span>严重 / 警告</span><strong>'+esc(isSample?"—":d.risk.counts.critical+" / "+d.risk.counts.warning)+'</strong></div><div><span>未知项</span><strong>'+esc(isSample?"—":d.risk.counts.unknown)+'</strong></div><div><span>实时市场风险</span><strong>未核验</strong></div></div></section><section class="pro-pane" id="market-quality"><h3>市场质量</h3><div data-quality-summary>'+esc(isSample?"合成样本行情 · 非实时数据":"历史报告 · 质量数据以证据审计为准")+'</div><div data-quality-metrics></div><div data-quality-alerts></div><p class="muted">OHLCV 仅支持波动、覆盖与成交量集中度检查，不能识别独立交易者、买卖方向或对敲。</p></section><section class="pro-pane"><h3>生命周期</h3><div class="pro-stage-list">'+workflow.steps.map(x=>'<div><i></i>'+esc(x.label+" · "+x.status)+'</div>').join("")+'</div></section></aside>'+
 '<section class="pro-pane pro-chart"><div class="pro-pane-head"><div><h3>市场行情</h3><small>OHLCV · '+esc(sourceLabel)+'</small></div>'+candleControls+'</div><div class="pro-chart-body">'+candleChart(candleResult)+'</div><div class="pro-chart-volume"><div class="pro-volume-label">成交量</div>'+(isSample?'<div class="volume-empty">见上方报价成交量</div>':seriesChart(trades.map(x=>({label:x.sequence,value:x.quoteNotionalBaseUnits,side:x.side})),"TRADE"))+'</div></section>'+
 '<aside class="pro-actions"><section class="pro-pane"><h3>执行状态</h3><div class="notice">交易执行已关闭。当前尚未完成 Project Market 身份绑定、Venue Adapter、订单账本和交易前 Risk Gate；不会调用 Pump Lab 默认 Mint。</div></section><section class="pro-pane"><h3>资产核算</h3><div class="key-values"><div><span>库存成本</span><strong>'+esc(money(a.remaining_cost_basis_base_units))+'</strong></div><div><span>已实现收益</span><strong>'+esc(money(a.realized_project_pnl_base_units))+'</strong></div><div><span>可兑现估值</span><strong>— SOL</strong></div></div></section></aside></div>'+
 '<section class="pro-pane pro-blotter"><div class="pro-blotter-head"><div class="terminal-tabs" role="group" aria-label="操作台明细">'+[["inventory","钱包库存"],...tabs.filter(t=>t[0]!=="inventory"),["nav","资产曲线"]].map(([id,label])=>'<button data-tab="'+id+'" aria-pressed="'+(terminalTab===id)+'">'+label+'</button>').join("")+'</div><button id="terminal-pause">'+(reviewPaused?"恢复浏览":"暂停浏览")+'</button></div><div class="tab-content">'+(reviewPaused?emptyState("浏览已暂停","恢复浏览后查看当前报告明细"):terminalTab==="nav"?navContent:isSample&&terminalTab!=="logs"?emptyState("暂无记录","载入项目数据后显示明细"):rows[terminalTab]())+'</div></section>'+
 '<div class="pro-bottom"><span>数据来源：'+esc(sourceLabel)+(!isSample&&!d.settlement_allowed?" · 未通过独立认证，禁止结算":"")+'</span><div class="row"><button id="terminal-export" '+(isSample?"disabled":"")+'>导出报告</button><button id="terminal-settle" '+(!isSample&&workflow.test_settlement_allowed?"":"disabled")+'>合成报告测试结算</button><button id="terminal-archive" '+(workflow.test_archive_allowed?"":"disabled")+'>导出测试归档</button></div></div>'+
 '</div>'+
 '<dialog id="launch-dialog" class="pro-dialog"><div class="pro-dialog-head"><h3>发行配置</h3><button data-close="launch-dialog" aria-label="关闭">×</button></div>'+actionForm+'</dialog>'+
 '<dialog id="data-dialog" class="pro-dialog"><div class="pro-dialog-head"><h3>项目数据</h3><button data-close="data-dialog" aria-label="关闭">×</button></div><label for="terminal-import">导入区间报告</label><input type="file" id="terminal-import" accept=".json"><div class="row"><button id="terminal-local-load" class="primary">读取本地记录</button></div><p id="terminal-error" class="negative" role="status"></p></dialog>';
 const projectContext=main.querySelector("#terminal-project-context");
  main.querySelector("#open-data").disabled=Boolean(activeProjectId);
  const contextVersion=++terminalContextVersion;
  getProjectDirectory().then(({projects,directory})=>{
   if(page!=="terminal"||contextVersion!==terminalContextVersion)return;
   const selected=projects.find(x=>x.project_id===activeProjectId)||null;
   const options='<option value="">选择 Project</option>'+projects.map(x=>'<option value="'+esc(x.project_id)+'"'+(x.project_id===activeProjectId?" selected":"")+'>'+esc(x.profile.name+" · "+x.profile.symbol+" · "+x.lifecycle.stage)+'</option>').join("");
   projectContext.innerHTML='<div class="row"><label>当前 Project <select id="terminal-project-select">'+options+'</select></label>'+
    (selected?'<span>'+esc(selected.profile.name+' / '+selected.profile.symbol)+'</span><span>阶段：'+esc(selected.lifecycle.stage)+'</span><span>Mint：'+esc(selected.token.mint||"未登记")+'</span><span>市场：'+selected.markets.filter(m=>m.verification_status==="VERIFIED").length+'/'+selected.markets.length+' 已核验</span>':'<span>尚未选择项目</span>')+
    '<span>Execution: DISABLED</span></div><details><summary>项目组合登记复核</summary>'+table(["项目","阶段","配置状态","登记重叠"],directory.projects.map(x=>[x.project_id,x.stage,x.configuration_status,x.registration_overlap_count]))+table(["登记异常","项目"],directory.findings.map(x=>[x.code,x.project_ids.join(", ")]))+note("登记重叠不等于共同控制，组合资金与 NAV 未核验")+'</details>';
   const notice=main.querySelector("#terminal-context-notice");
   if(activeProjectId){
    if(selected){
      const businessArea=main.querySelector("#terminal-business-review");businessArea.hidden=false;
      main.querySelector("#terminal-project-details").hidden=false;
      const riskArea=main.querySelector("#terminal-risk-review");riskArea.hidden=false;
      const assetCards=row=>'<div class="project-asset-grid">'+projectIntervalMetrics(row).map(x=>'<div class="project-stat"><span>'+esc(x.label)+'</span><strong>'+esc(x.value)+'</strong><small>'+esc(x.unit)+'</small><small>'+esc(x.evidence_label)+'</small></div>').join("")+'</div>';
      const businessCurrent=()=>page==="terminal"&&contextVersion===terminalContextVersion&&activeProjectId===selected.project_id&&businessArea.isConnected;
      let businessTicket=0;
      async function refreshBusiness(){
       const ticket=++businessTicket;businessArea.textContent="读取统一项目复核…";riskArea.textContent="读取同一项目快照…";
       try{
        const v=await getProjectBusinessReview(selected.project_id,selected.revision);
        if(!businessCurrent()||ticket!==businessTicket)return;
        const model=projectOverviewModel(v);
        businessArea.innerHTML='<div class="project-overview-heading"><div><h3>项目运行概览 · v'+esc(v.project_revision)+'</h3><p class="muted">'+esc(model.status)+' · 历史声明数据 · 执行禁用</p></div><button id="business-refresh">刷新项目</button></div>'+
         '<div class="project-overview-grid"><div class="project-stat"><span>登记阶段</span><strong>'+esc(model.stage)+'</strong></div><div class="project-stat"><span>严重 / 警告 / 未知</span><strong>'+esc([model.counts.critical,model.counts.warning,model.counts.unknown].join(" / "))+'</strong></div><div class="project-stat"><span>待核对订单</span><strong>'+esc(v.orders.unresolved_count)+'</strong></div><div class="project-stat"><span>实时资产 / 市场</span><strong>未接入</strong></div></div>'+
         '<div class="project-work-grid">'+model.work.map(x=>'<div><span>'+esc(x.label)+'</span><strong>'+esc(x.status)+'</strong></div>').join("")+'</div>'+
         '<div class="project-interval-head"><h3>历史资产区间</h3>'+(v.runtime_context_id&&model.intervals.length?'<label>选择区间 <select id="runtime-interval"><option value="">请选择区间</option>'+model.intervals.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.label)+'</option>').join("")+'</select></label>':'<span class="muted">暂无关联区间</span>')+'</div><div id="runtime-interval-detail" role="status">'+assetCards(null)+note("请选择一个历史区间。未选择时不显示金额；不代表当前可用资产。")+'</div>'+
         '<div class="project-work-grid"><div><span>历史市场证据</span><strong>'+esc(model.market.status)+'</strong></div><div><span>内盘报告区间 / 外盘快照</span><strong>'+esc(model.market.interval_count+" / "+model.market.pool_count)+'</strong></div><div><span>当前市场</span><strong>未知</strong></div></div>'+
         '<details class="project-secondary"><summary>运行记录与审计明细</summary>'+
         (v.runtime?.market?.curve_intervals?'<details><summary>统一历史市场状态</summary>'+table(["历史区间","市场证据状态"],v.runtime.market.curve_intervals.map(i=>[i.opening_cutoff+" → "+i.closing_cutoff,i.status]))+table(["迁移阶段","状态"],v.runtime.market.migration_milestones.map(x=>[x.stage,x.status]))+table(["外盘历史快照","状态","Slot"],v.runtime.market.historical_pools.map(x=>[x.pool_address??"—",x.status,x.snapshot_slot??"—"]))+note("各阶段保留独立时间边界；没有统一实时快照")+'</details>':"")+
         note("历史归档容量："+(v.capacity?.archive_count??"—")+"/"+(v.capacity?.archive_limit??"—")+" · 订单记录："+(v.capacity?.order_count??"—")+"/"+(v.capacity?.order_limit??"—")+" · "+(v.capacity?.status??"UNKNOWN"))+
         table(["模块","状态","记录数"],[["资金与库存",v.treasury.status,v.treasury.review_count],["市场证据",v.market.status,v.market.review_count],["财务关闭",v.close.status,v.close.review_count],["订单复核","未充分复核 "+v.orders.unresolved_count,v.orders.record_count]])+
         (v.configuration?'<details><summary>项目准备与配置审计</summary>'+table(["状态","已登记钱包","缺少额度"],[[v.configuration.status,v.configuration.wallets.registered_count,v.configuration.budget.members_missing_cap]])+table(["配置异常 / 缺项 / 警告"],[...v.configuration.issues,...v.configuration.missing,...v.configuration.warnings].map(x=>[x]))+'</details>':"")+
         (v.offline_workflow?'<details><summary>离线业务证据覆盖（非执行许可）</summary>'+table(["区间开始","区间结束","状态","资金 / 市场 / 关闭"],v.offline_workflow.intervals.map(x=>[x.opening_cutoff,x.closing_cutoff,x.status,x.evidence.map(e=>e.status).join(" / ")]))+'</details>':"")+
         (v.model_evidence?'<details><summary>区间库存、数学与市场证据</summary>'+table(["区间","证据类别","状态","数学 / 储备","历史数量（基础单位）"],v.model_evidence.intervals.flatMap(i=>i.evidence.map(e=>[i.opening_cutoff+" → "+i.closing_cutoff,e.kind,e.status,e.math_status??e.reserve_evidence_status??"UNKNOWN",e.inventory?.closing_quantity_base_units??"—"])))+note("参与者模型："+v.model_evidence.participant_model.status+" · 独立需求、当前库存及真实市场准确度未验证")+'</details>':"")+
         (v.continuity?'<details><summary>毕业与财务连续性复核</summary>'+table(["阶段","证据状态"],v.continuity.milestones.map(m=>[m.stage,m.status]))+table(["区间","核对项","状态"],v.continuity.intervals.flatMap(i=>i.checks.map(c=>[i.opening_cutoff+" → "+i.closing_cutoff,c.id,c.status])))+note("历史声明一致性不代表实际迁移资金核对、LP 归属或结算许可")+'</details>':"")+
         (v.launch_review?'<details><summary>发行准备风险清单</summary>'+table(["检查","状态"],v.launch_review.checks.map(x=>[x.id,x.status]))+note("非发行推荐，真实需求与法律审查未验证")+'</details>':"")+
         (v.operating_components?'<details><summary>历史经营收益构成（非因果归因）</summary>'+table(["区间","状态","交易已实现损益","Creator 现金收入","其他收入","费用"],v.operating_components.rows.map(x=>[x.opening_cutoff+" → "+x.closing_cutoff,x.status,x.components.trade_realized_pnl_base_units??"—",x.components.creator_cash_income_base_units??"—",x.components.other_cash_income_base_units??"—",x.components.separate_expenses_base_units??"—"]))+note("金额为报价资产基础单位；不跨区间汇总")+'</details>':"")+
         (v.operational_evidence?'<details><summary>外盘历史证据与订单异常</summary>'+table(["Pool","历史核验状态","Slot"],v.operational_evidence.pools.map(x=>[x.pool_address??"—",x.status,x.snapshot_slot??"—"]))+table(["订单","异常原因","重发许可"],v.operational_evidence.order_exceptions.map(x=>[x.order_id,x.review_reason,"禁止"]))+note("不代表当前流动性、LP 归属或实际恢复验证")+'</details>':"")+
         '<details><summary>历史区间与报告关联</summary>'+table(["区间开始","区间结束","关联复核数"],v.intervals.map(x=>[x.opening_cutoff,x.closing_cutoff,x.reviews.length]))+'</details>'+
         table(["证据冲突","引用"],v.findings.map(x=>[x.code,x.reference??"—"]))+
         table(["证据未知","引用"],(v.unknown??[]).map(x=>[x.code,x.reference??"—"]))+
         '<details><summary>真实数据接入与环境验收（未完成）</summary>'+table(["接入验收条件","状态"],v.data_integration.gates.map(g=>[g.id,g.status]))+'</details>'+
         '<button id="business-export">导出复核 JSON</button></details>';
        const gr=v.global_risk;
        riskArea.innerHTML="<h3>统一项目风险复核</h3>"+note("同一运行快照 · "+gr.status+" · 实时风险未评估")+table(["类别","级别","问题","记录引用数"],gr.findings.map(f=>[f.category,f.severity,f.code,f.references.length]))+'<button id="project-risk-export">导出风险清单</button>';
        riskArea.querySelector("#project-risk-export").onclick=()=>download("project-risk-review.json",JSON.stringify(gr,null,2));
        const intervalSelect=businessArea.querySelector("#runtime-interval");
        if(intervalSelect){
         let intervalTicket=0;
         intervalSelect.onchange=async()=>{
          const seq=++intervalTicket,archiveId=intervalSelect.value,detail=businessArea.querySelector("#runtime-interval-detail");
          if(!archiveId){detail.innerHTML=assetCards(null)+note("请选择一个历史区间。");return;}
          detail.textContent="读取区间资产…";
          try{
           const ctx=await selectProjectRuntimeInterval(selected.project_id,selected.revision,v.runtime_context_id,archiveId);
           if(!businessCurrent()||ticket!==businessTicket||seq!==intervalTicket||!detail.isConnected)return;
           const row=ctx.selected_interval;
           detail.innerHTML=note(row.status+" · "+row.opening_cutoff+" → "+row.closing_cutoff+(row.evidence_conflict_codes?.length?" · "+row.evidence_conflict_codes.join(" / "):""))+assetCards(row)+'<details><summary>全部资产字段</summary>'+table(["区间资产项","基础单位"],Object.entries(row.assets).map(([key,value])=>[key,value??"—"]))+"</details>"+(row.lp_evidence?note("LP 头寸证据："+row.lp_evidence.status+" · 归属、估值及 NAV 是否已包含均未验证；不额外计入资产或费用。"):"")+(row.account_coverage?note("钱包标签覆盖："+row.account_coverage.registered_label_coverage+" · 归属未独立验证")+table(["项目 / 账户合计核对","状态"],row.account_coverage.checks.map(c=>[c.field,c.status])):"");
          }catch(err){if(businessCurrent()&&ticket===businessTicket&&seq===intervalTicket&&detail.isConnected)detail.textContent="区间不可用，请刷新运行概览："+errorKind(err);}
         };
        }
        businessArea.querySelector("#business-refresh").onclick=refreshBusiness;
        businessArea.querySelector("#business-export").onclick=()=>download("project-business-review.json",JSON.stringify(v,null,2));
       }catch(err){if(businessCurrent()&&ticket===businessTicket){businessArea.textContent="统一复核不可用："+errorKind(err);riskArea.textContent="风险证据不可用，请刷新项目";const retry=document.createElement("button");retry.textContent="重新读取";retry.onclick=refreshBusiness;businessArea.append(retry);}}
      }
      void refreshBusiness();
      const marketArea=main.querySelector("#terminal-market-evidence");marketArea.hidden=false;
      const marketCurrent=()=>page==="terminal"&&contextVersion===terminalContextVersion&&activeProjectId===selected.project_id&&marketArea.isConnected;
      marketArea.innerHTML="<h3>历史行情证据审计</h3>"+note("仅复核已关联历史报告；不提供实时行情或交易信号。")+
       '<label>关联报告<select id="market-evidence-report"><option value="">读取报告中…</option></select></label><button id="market-evidence-review" disabled>复核并归档</button><button id="market-evidence-export" disabled>导出本次复核</button><p id="market-evidence-status" role="status"></p><div id="market-evidence-result"></div>';
      const ms=marketArea.querySelector("#market-evidence-report"),mb=marketArea.querySelector("#market-evidence-review"),mt=marketArea.querySelector("#market-evidence-status"),mr=marketArea.querySelector("#market-evidence-result");
      listProjectArchive(selected.project_id).then(rows=>{
       if(!marketCurrent())return;
       if(rows.some(a=>a.project_id!==selected.project_id||a.current_revision!==selected.revision))throw Error("PROJECT_ARCHIVE_SCOPE_MISMATCH");
       ms.replaceChildren(new Option("选择当前版本报告",""));
       for(const a of rows.filter(a=>a.kind==="HISTORICAL_REPORT_LINK"&&(!a.stale||a.evidence_applicability==="PROFILE_ONLY_COMPATIBLE")))ms.add(new Option("工作区 v"+a.payload.workspace_revision+" · "+a.payload.scope.openingCutoff+" → "+a.payload.scope.closingCutoff,a.archive_id));
      }).catch(e=>{if(marketCurrent())mt.textContent=errorKind(e);});
      const me=marketArea.querySelector("#market-evidence-export");
      let lastMarketReview=null;
      me.onclick=()=>{if(marketCurrent()&&lastMarketReview)download("project-market-evidence-review.json",JSON.stringify(lastMarketReview,null,2));};
      ms.onchange=()=>{lastMarketReview=null;me.disabled=true;mb.disabled=!ms.value;mr.replaceChildren();mt.textContent="";};
      mb.onclick=async()=>{
       const a=ms.value;if(!a)return;lastMarketReview=null;me.disabled=true;mb.disabled=true;ms.disabled=true;mr.replaceChildren();mt.textContent="复核历史行情…";
       try{
        const {review:v,archive}=await reviewProjectMarketEvidence(selected.project_id,selected.revision,a);
        if(!marketCurrent())return;
        lastMarketReview={review:v,archive};me.disabled=false;
        mt.textContent=v.status+" · 已归档 · 来源未独立认证";
        void refreshRisk();
        mr.innerHTML=table(["指标","证据状态"],[["历史覆盖",String(v.declared_history_complete)],["成交证据",v.trade_evidence_status],["K线证据",v.candle_evidence_status],["市场快照",v.market_snapshot_status],["记录数",v.observed_trade_record_count]])+
        table(["周期（分钟）","状态","K线数量"],v.candle_intervals.map(x=>[x.interval_ms/60000,x.status,x.candle_count??"—"]))+
        table(["参与记录证据","数量 / 状态"],[["已对账记录",v.participant_coverage?.reconciled_record_count??"—"],["有地址标签记录",v.participant_coverage?.declared_address_record_count??"—"],["缺失地址标签记录",v.participant_coverage?.missing_address_record_count??"—"],["标签覆盖",v.participant_coverage?.status??"UNKNOWN"],["独立参与者数量","未知"]])+
        table(["储备证据","状态"],[["历史字段",v.reserve_evidence?.status??"UNKNOWN"],["缺失字段",(v.reserve_evidence?.missing_fields??[]).join("、")||"—"],["独立储备认证","未知"],["当前可用深度","未知"]])+
        table(["待复核 / 未知"],[...v.issues,...v.unknown].map(x=>[x]));
       }catch(e){if(marketCurrent())mt.textContent=errorKind(e);}
       finally{if(marketCurrent()){ms.disabled=false;mb.disabled=!ms.value;}}
      };
      function refreshRisk(){return refreshBusiness();}
      const lifecycleArea=main.querySelector("#terminal-lifecycle-evidence");
      lifecycleArea.hidden=false;lifecycleArea.textContent="读取生命周期证据覆盖…";
      const stillCurrent=()=>page==="terminal"&&contextVersion===terminalContextVersion&&activeProjectId===selected.project_id&&lifecycleArea.isConnected;
      getProjectLifecycleEvidence(selected.project_id,selected.revision).then(v=>{
       if(!stillCurrent())return;
       lifecycleArea.innerHTML="<h3>Project 生命周期证据覆盖</h3>"+note("登记阶段："+v.recorded_stage+" · 观察结果不代表正式阶段推进。")+
        table(["业务阶段","登记状态","证据状态"],v.steps.map(s=>[s.stage,s.recorded,s.evidence_status]))+
        table(["历史里程碑","证据状态"],(v.historical_milestones??[]).map(s=>[s.stage,s.status]))+
        table(["待复核事项"],v.blockers.map(s=>[s]))+note("旧版本档案 "+v.stale_archive_count+" · 当前关联报告 "+v.report_link_count+" · 当前订单记录 "+v.order_review_count)+
        '<label>历史 Pump 回放 JSON（最大 900 KiB）<input id="project-graduation-file" type="file" accept=".json"></label><button id="project-graduation-review">复核并归档历史里程碑</button><p id="project-graduation-status" role="status"></p>'+
        '<h3>退出与财务证据复核</h3>'+note("当前归档复核状态："+(v.close_evidence?.status??"MISSING"))+
        table(["未解决事项"],[...(v.close_evidence?.blockers??[]),...(v.close_evidence?.unknown??[])].map(x=>[x]))+
        '<label>关联历史报告<select id="project-close-report"><option value="">读取报告中…</option></select></label><button id="project-close-review" disabled>生成财务复核并归档</button><button id="project-treasury-review" disabled>查看历史资金与库存审计</button><p id="project-close-status" role="status"></p><div id="project-treasury-sections"></div><pre id="project-close-result" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>'+
        '<h3>项目审计归档</h3>'+note("包含项目台账、订单事件、证据档案与异常清单。原始历史报告文件需另行保留。导出不改变生命周期。")+
        '<button id="project-audit-export">导出当前项目审计归档 JSON</button><p id="project-audit-status" role="status"></p>';
       const auditButton=lifecycleArea.querySelector("#project-audit-export");
       auditButton.onclick=async()=>{
        auditButton.disabled=true;const status=lifecycleArea.querySelector("#project-audit-status");
        status.textContent="读取一致性快照…";
        try{
         const bundle=await exportProjectAuditBundle(selected.project_id,selected.revision);
         if(!stillCurrent())return;
         download("project-audit-bundle.json",JSON.stringify(bundle,null,2));
         status.textContent="已导出 · "+bundle.exceptions.length+" 项待复核记录 · 内容摘要 "+bundle.content_sha256;
        }catch(e){if(stillCurrent())status.textContent="导出失败："+errorKind(e);}
        finally{if(stillCurrent())auditButton.disabled=false;}
       };
       const closeSelect=lifecycleArea.querySelector("#project-close-report"),closeButton=lifecycleArea.querySelector("#project-close-review"),closeStatus=lifecycleArea.querySelector("#project-close-status");
       listProjectArchive(selected.project_id).then(rows=>{
        if(!stillCurrent())return;
        if(rows.some(a=>a.project_id!==selected.project_id||a.current_revision!==selected.revision))throw Error("PROJECT_ARCHIVE_SCOPE_MISMATCH");
        closeSelect.replaceChildren(new Option("选择当前版本报告",""));
        for(const a of rows.filter(a=>a.kind==="HISTORICAL_REPORT_LINK"&&(!a.stale||a.evidence_applicability==="PROFILE_ONLY_COMPATIBLE")))closeSelect.add(new Option("工作区 v"+a.payload.workspace_revision+" · "+a.payload.scope.openingCutoff+" → "+a.payload.scope.closingCutoff,a.archive_id));
       }).catch(e=>{if(stillCurrent())closeStatus.textContent=errorKind(e);});
       const treasuryButton=lifecycleArea.querySelector("#project-treasury-review");
       treasuryButton.onclick=async()=>{
        const archiveId=closeSelect.value;if(!archiveId)return;
        treasuryButton.disabled=true;closeButton.disabled=true;closeSelect.disabled=true;closeStatus.textContent="核对历史资金与库存…";lifecycleArea.querySelector("#project-treasury-sections").replaceChildren();lifecycleArea.querySelector("#project-close-result").textContent="";
        try{
         const result=await reviewProjectTreasury(selected.project_id,selected.revision,archiveId);
         if(!stillCurrent())return;
         const v=result.review;closeStatus.textContent=v.status+" · 单一历史区间 · 非实时资产";void refreshBusiness();
         lifecycleArea.querySelector("#project-treasury-sections").innerHTML=treasuryReviewSections(v).map(s=>"<h4>"+esc(s.heading)+"</h4>"+table(["指标","历史记录"],s.rows)).join("")+table(["待复核 / 未知"],[...v.issues,...v.unknown].map(x=>[x]));
         lifecycleArea.querySelector("#project-close-result").textContent=JSON.stringify(v,null,2);
        }catch(e){if(stillCurrent())closeStatus.textContent=errorKind(e);}
        finally{if(stillCurrent()){closeSelect.disabled=false;treasuryButton.disabled=!closeSelect.value;closeButton.disabled=!closeSelect.value;}}
       };
       closeSelect.onchange=()=>{lifecycleArea.querySelector("#project-treasury-sections").replaceChildren();treasuryButton.disabled=!closeSelect.value;closeButton.disabled=!closeSelect.value;lifecycleArea.querySelector("#project-close-result").textContent="";closeStatus.textContent="";};
       closeButton.onclick=async()=>{
        const archiveId=closeSelect.value;if(!archiveId)return;
        closeButton.disabled=true;treasuryButton.disabled=true;closeSelect.disabled=true;closeStatus.textContent="复核中…";lifecycleArea.querySelector("#project-treasury-sections").replaceChildren();lifecycleArea.querySelector("#project-close-result").textContent="";
        try{const result=await reviewProjectCloseEvidence(selected.project_id,selected.revision,archiveId);
         if(!stillCurrent())return;
         closeStatus.textContent=result.review.status+" · 已归档 · 不代表结算完成";void refreshBusiness();
         lifecycleArea.querySelector("#project-close-result").textContent=JSON.stringify(result.review,null,2);
        }catch(e){if(stillCurrent())closeStatus.textContent=errorKind(e);}
        finally{if(stillCurrent()){closeSelect.disabled=false;closeButton.disabled=!closeSelect.value;treasuryButton.disabled=!closeSelect.value;}}
       };
       const button=lifecycleArea.querySelector("#project-graduation-review");
       button.onclick=async()=>{
        button.disabled=true;const output=lifecycleArea.querySelector("#project-graduation-status");
        try{
         const file=lifecycleArea.querySelector("#project-graduation-file").files?.[0];
         if(!file||file.size>900*1024)throw Error("HISTORY_FILE_MISSING_OR_TOO_LARGE");
         const history=JSON.parse(await file.text());if(!stillCurrent())return;
         const result=await reviewProjectGraduationHistory(selected.project_id,selected.revision,history);
         if(!stillCurrent())return;
         output.textContent=result.review.status+" · 已归档摘要 "+result.archive.archive_id;void refreshBusiness();
        }catch(e){if(stillCurrent())output.textContent="复核失败："+errorKind(e);}
        finally{if(stillCurrent())button.disabled=false;}
       };
      }).catch(e=>{if(stillCurrent())lifecycleArea.textContent="生命周期证据不可用："+errorKind(e);});
      const orderArea=main.querySelector("#terminal-order-review");orderArea.hidden=false;mountOrderReview(orderArea,{project:selected,isActive:()=>page==="terminal"&&contextVersion===terminalContextVersion&&activeProjectId===selected.project_id,esc,table,note,download});}
    const match=matchProjectReport(selected,data);
    notice.innerHTML=note(match.status==="DECLARED_MATCH"?"当前报告与 Project 的声明身份一致（Project ID、Mint、网络、Genesis、SOL）。仅为历史复盘；未独立认证，不是实时余额或结算证据。":"历史报告保持隔离："+match.reasons.join(" / ")+"。清除项目选择后可继续独立复盘。");
    if(match.status==="DECLARED_MATCH"){
     const area=main.querySelector("#terminal-report-area");
     area.hidden=false;area.removeAttribute("inert");area.style.removeProperty("display");
     // The independent report viewer remains explicitly labelled as historical.
     for(const id of ["workflow-sample","terminal-settle","terminal-archive","workflow-save"]){const control=main.querySelector("#"+id);if(control)control.disabled=true;}
    }
    main.querySelector("#open-data").disabled=true;
   }else{
    notice.innerHTML=note("当前为独立历史复盘模式，不代表任何 Project 的实时资产或市场状态。");
   }
   main.querySelector("#terminal-project-select").onchange=e=>{importTicket++;activeProjectId=e.target.value||null;record("project.context.selected",{project_id:activeProjectId});render()};
  }).catch(()=>{
   if(page==="terminal"&&contextVersion===terminalContextVersion){
    projectContext.textContent="Project 数据库不可用；交易执行保持关闭。";
    if(activeProjectId){
     const clear=document.createElement("button");clear.textContent="返回独立复盘";
     clear.onclick=()=>{importTicket++;activeProjectId=null;render()};projectContext.append(clear);
    }
   }
  });
  main.querySelector("#workflow-sample").onclick=async()=>{if(!isSample&&!window.confirm("切换到离线样本？请先导出当前报告。"))return;const ticket=++importTicket;try{const response=await fetch("../fixtures/synthetic/terminal-candle-report.json",{cache:"no-store",signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error("SAMPLE_UNAVAILABLE");const next=await response.json(),nextReport=auditedReport(next);if(!importCurrent(ticket,"terminal"))return;offlineReview=true;data=next;report=nextReport;render()}catch(e){if(importCurrent(ticket,"terminal")){workflowMessage="离线样本载入失败："+errorKind(e);render()}}};
 main.querySelector("#workflow-cash").onclick=()=>{terminalTab="cash";reviewPaused=false;render()};
 main.querySelector("#workflow-finance").onclick=()=>{if(isSample)return;terminalTab="finance";reviewPaused=false;render()};
 const closeExport=main.querySelector("#financial-close-export");if(closeExport)closeExport.onclick=()=>{if(!isSample)download("project-financial-close-review.json",JSON.stringify(getCloseReview(),null,2));};
 const feeExport=main.querySelector("#creator-fee-export");if(feeExport)feeExport.onclick=()=>{if(!isSample)download("creator-fee-ledger.json",JSON.stringify(getFeeReview(),null,2));};
 main.querySelector("#workflow-risk").onclick=()=>{terminalTab="risk";reviewPaused=false;render()};
 main.querySelector("#workflow-graduation").onclick=()=>{importTicket++;page="projects";record("page.open",{page});render();};
 main.querySelector("#workflow-save").onclick=()=>{try{if(isSample||workspaceBusy)return;catalogueSelection=projectCatalogue.add(data).key;workflowMessage="报告已加入会话档案；请到项目档案保存数据库版本。";render()}catch(e){workflowMessage="档案添加失败："+errorKind(e);render()}};
 main.querySelector("#workflow-export").onclick=()=>{if(!isSample)download("historical-report-input.json",JSON.stringify(data,null,2))};
 main.querySelector("#open-launch").onclick=()=>{page="create";record("page.open",{page});render()};
 main.querySelector("#open-data").onclick=()=>main.querySelector("#data-dialog").showModal();
 main.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>main.querySelector("#"+b.dataset.close).close());
 main.querySelectorAll("[data-candle-interval]").forEach(b=>b.onclick=()=>{candleInterval=Number(b.dataset.candleInterval);render()});
 main.querySelector("#terminal-local-load").onclick=async()=>{const before=data,ticket=++importTicket,startPage=page;try{const response=await fetch("/api/terminal/report",{cache:"no-store",signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error("本地报告桥未配置或数据无效");const next=await response.json();const nextReport=auditedReport(next);if(data!==before||!importCurrent(ticket,startPage))return;offlineReview=true;data=next;report=nextReport;record("report.import.completed",{page,source_mode:report.source_mode,status:report.status});render()}catch(err){record("report.import.failed",{page,error_kind:errorKind(err)},"ERROR");if(importCurrent(ticket,startPage)){const el=document.querySelector("#terminal-error");if(el)el.textContent=errorKind(err)+"：报告未通过校验";}}};
 main.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{terminalTab=b.dataset.tab;render()});
 main.querySelector("#terminal-meta").onsubmit=e=>{e.preventDefault();metadata=Object.fromEntries(new FormData(e.currentTarget));record("metadata.saved");render()};
 main.querySelector("#terminal-pause").onclick=()=>{reviewPaused=!reviewPaused;render()};
 main.querySelector("#terminal-export").onclick=()=>download("closed-interval-report.json",JSON.stringify({metadata,reviewStage,report},null,2));
 main.querySelector("#terminal-settle").onclick=()=>{reviewStage=advanceReview(reviewStage,"settle",d);record("review.settled",{page});render()};
 main.querySelector("#terminal-archive").onclick=()=>{if(reviewStage==="SETTLED")reviewStage=advanceReview(reviewStage,"archive",d);download("cook-review-archive.json",JSON.stringify(makeReviewArchive(data,metadata,reviewStage),null,2));record("review.archived",{page});render()};
 main.querySelector("#terminal-import").onchange=async e=>{const ticket=++importTicket,startPage=page;try{const f=e.target.files[0];if(!f)return;if(f.size>16*1024*1024)throw Error("报告文件超过 16 MiB");const raw=JSON.parse(await f.text());const restored=raw?.schema_version==="cook-review-archive.1"?restoreReviewArchive(raw):null;const next=restored?.input??raw;const nextReport=auditedReport(next);if(!importCurrent(ticket,startPage))return;offlineReview=true;data=next;report=nextReport;reviewInput=data;reviewStage=restored?.stage??"REVIEW";metadata=restored?.metadata??null;reviewPaused=false;workflowMessage="";if(restored)record("review.restored",{page});record("report.import.completed",{page,source_mode:report.source_mode,status:report.status});render()}catch(err){record("report.import.failed",{page,error_kind:errorKind(err)},"ERROR");if(importCurrent(ticket,startPage)){const el=document.querySelector("#terminal-error");if(el)el.textContent=errorKind(err)+"：报告未通过校验";}}};
}
function render(){
 if(reviewInput!==data){reviewInput=data;reviewStage="REVIEW";metadata=null;reviewPaused=false;workflowMessage="";}
 main.dataset.page=page;
 document.querySelector(".tag").textContent=offlineReview?"OFFLINE REVIEW":"LOCALNET";
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
 const catalogue=projectCatalogue.list(),projects=listHistoricalProjects(projectCatalogue);
 main.innerHTML=screenHeading("项目档案","项目实体 · 独立历史区间 · 工作区文件")+
 note("档案仅供历史审阅，不改变操作台、默认 Token 或钱包。最多 8 份；可显式保存至已启用的本地数据库，或导出工作区文件；未保存的修改在刷新后丢失。仅导入脱敏报告，不包含凭据或私钥。")+
 panel("项目工作区",table(["项目","Token","网络","身份","区间数","待复核"],projects.map(p=>[p.project_id,p.token_mint,p.network,p.identity_status,p.record_count,p.review_required_count]))+'<button id="workspace-export">保存工作区 JSON</button> <label for="workspace-import">合并工作区 JSON</label><input id="workspace-import" type="file" accept=".json"><p class="muted">只保存原始输入；恢复时重新审计。冲突则整批不变。</p>')+
 panel("本地数据库版本",note(workspaceMessage)+table(["当前已知版本","状态"],[[workspaceRevision??"未知",workspaceBusy?"请求中":"显式保存"]])+ '<button id="workspace-db-load">读取数据库工作区</button> <button id="workspace-db-save">保存当前工作区到数据库</button> <button id="workspace-db-versions">查看版本记录</button>'+table(["版本","字节","摘要"],workspaceVersions.map(v=>[v.revision,v.bytes,v.digest])))+
 panel("已保存项目复盘",'<div id="saved-project-review"></div>')+
 panel("毕业与 PumpSwap 历史审阅",'<div id="graduation-review"></div>')+
 panel("项目全生命周期复盘",'<div id="project-lifecycle-review"></div>')+
 panel("当前报告",table(["项目","Token","来源","审计"],[[data.scope.projectId,data.scope.tokenMint,report.source_mode,report.status]])+'<button id="catalogue-add">将当前报告加入档案</button>')+
 panel("历史档案",'<label for="catalogue-file">导入历史报告输入 JSON</label><input id="catalogue-file" type="file" accept=".json"><p id="catalogue-message" role="status"></p>'+
 table(["项目","Token","来源","起始","结束","审计"],catalogue.map(r=>[r.projectId,r.tokenMint,r.source_mode,r.openingCutoff,r.closingCutoff,r.audit_status]))+
 '<label for="catalogue-select">选择独立审阅记录</label><select id="catalogue-select"><option value="">请选择</option>'+catalogue.map((r,i)=>'<option value="'+i+'"'+(r.key===catalogueSelection?' selected':'')+'>'+esc(r.projectId+" · "+r.source_mode+" · "+r.openingCutoff+" → "+r.closingCutoff)+'</option>').join("")+'</select> <button id="catalogue-open" disabled>在操作台审阅</button> <button id="catalogue-export" disabled>导出原始记录</button> <button id="catalogue-remove" disabled>移出会话档案</button><div id="catalogue-detail"></div>');
 const msg=main.querySelector("#catalogue-message"),detail=main.querySelector("#catalogue-detail"),select=main.querySelector("#catalogue-select"),exportButton=main.querySelector("#catalogue-export"),removeButton=main.querySelector("#catalogue-remove");
 mountSavedProjectReview(main.querySelector("#saved-project-review"),{query:queryHistoricalWorkspace,revision:workspaceRevision});
 mountGraduationReview(main.querySelector("#graduation-review"),{download,initial:graduationReview,onReview:value=>{graduationReview=value;}});
 mountProjectLifecycleReview(main.querySelector("#project-lifecycle-review"),{download,initial:lifecycleReview,onReview:value=>{lifecycleReview=value;}});
 const openReview=main.querySelector("#catalogue-open");
 let selected=null;
 function showCatalogue(){
  selected=null;openReview.disabled=true;exportButton.disabled=true;removeButton.disabled=true;detail.textContent="";
  if(select.value==="")return;
  const row=catalogue[Number(select.value)];if(!row)return;
  try{selected=projectCatalogue.get(row.key);catalogueSelection=row.key;
   const r=selected.report;detail.innerHTML=note(r.source_mode+" · "+r.status+" · 来源认证未知")+table(["检查","状态","证据"],historicalReviewRows(r.terminal_state).checks)+table(["异常"],r.issues.map(x=>[x]));openReview.disabled=false;exportButton.disabled=false;removeButton.disabled=false;
  }catch{detail.textContent="档案复核失败"}
 }
 select.onchange=showCatalogue;showCatalogue();
 const dbLoad=main.querySelector("#workspace-db-load"),dbSave=main.querySelector("#workspace-db-save"),dbVersions=main.querySelector("#workspace-db-versions");
 dbLoad.disabled=workspaceBusy;dbSave.disabled=workspaceBusy||workspaceRevision===null;dbVersions.disabled=workspaceBusy;
 for(const id of ["workspace-import","catalogue-add","catalogue-file","catalogue-select"])main.querySelector("#"+id).disabled=workspaceBusy;
 if(workspaceBusy){removeButton.disabled=true;openReview.disabled=true;}
 openReview.onclick=()=>{if(!selected||workspaceBusy)return;if(!window.confirm("在离线审阅模式打开该记录？不会绑定钱包。"))return;const next=structuredClone(selected.input),nextReport=auditedReport(next);importTicket++;offlineReview=true;data=next;report=nextReport;page="terminal";record("page.open",{page});render()};
 async function databaseAction(action){
  if(workspaceBusy)return;
  if(action==="load"&&projectCatalogue.list().length&&!window.confirm("读取数据库将替换当前会话档案。请先导出未保存记录。继续？"))return;
  if(action==="save"&&(workspaceRevision===null||!window.confirm("将当前脱敏工作区保存为数据库新版本？")))return;
  importTicket++;workspaceBusy=true;workspaceMessage="数据库请求中";render();
  try{
   if(action==="load"){
    const result=await requestHistoricalWorkspace();
    const next=restoreHistoricalWorkspace(result.workspace);
    projectCatalogue=next;catalogueSelection=null;workspaceRevision=result.revision;workspaceVersions=[];workspaceMessage="数据库工作区已读取，版本 "+result.revision;
   }else if(action==="save"){
    const result=await requestHistoricalWorkspace({method:"POST",workspace:exportHistoricalWorkspace(projectCatalogue),expectedRevision:workspaceRevision});
    workspaceRevision=result.revision;workspaceVersions=[];workspaceMessage="保存结果："+result.status+" · 版本 "+result.revision;
   }else{
    const result=await requestHistoricalWorkspace({revisions:true});workspaceVersions=result.revisions;workspaceMessage="数据库版本记录已读取";
   }
  }catch(err){
   if(action==="save")workspaceRevision=null;
   const reason=({WORKSPACE_REVISION_CONFLICT:"版本冲突",WORKSPACE_DISABLED:"数据库功能未启用",WORKSPACE_STORAGE_LIMIT:"版本存储已满",WORKSPACE_INTEGRITY_FAILURE:"数据完整性检查失败",WORKSPACE_VALIDATION_FAILED:"报告校验失败",WORKSPACE_UNAVAILABLE:"数据库不可用"})[err.message]??errorKind(err);
   workspaceMessage="数据库操作未确认："+reason+"。当前会话记录保留；保存失败后请先导出，再重新读取版本，不要盲目重试。";
  }finally{workspaceBusy=false;if(page==="projects")render();}
 }
 dbLoad.onclick=()=>databaseAction("load");dbSave.onclick=()=>databaseAction("save");dbVersions.onclick=()=>databaseAction("versions");
 main.querySelector("#workspace-export").onclick=()=>download("historical-project-workspace.json",JSON.stringify(exportHistoricalWorkspace(projectCatalogue)));
 main.querySelector("#workspace-import").onchange=async e=>{const ticket=++importTicket,file=e.target.files[0];if(!file)return;
  try{if(file.size>WORKSPACE_MAX_BYTES)throw Error("FILE_TOO_LARGE");const bundle=JSON.parse(await file.text());if(!importCurrent(ticket,"projects"))return;
   const next=restoreHistoricalWorkspace(bundle,{mergeInto:projectCatalogue});projectCatalogue=next;catalogueSelection=null;render();}
  catch(err){if(importCurrent(ticket,"projects"))msg.textContent="工作区未合并："+errorKind(err)}
 };
 main.querySelector("#catalogue-add").onclick=()=>{importTicket++;try{catalogueSelection=projectCatalogue.add(data).key;render()}catch(e){msg.textContent="未加入档案："+errorKind(e)}};
 main.querySelector("#catalogue-file").onchange=async e=>{const ticket=++importTicket,file=e.target.files[0];if(!file)return;
  try{if(file.size>16*1024*1024)throw Error("FILE_TOO_LARGE");const input=JSON.parse(await file.text());if(!importCurrent(ticket,"projects"))return;catalogueSelection=projectCatalogue.add(input).key;render()}
  catch(err){if(importCurrent(ticket,"projects"))msg.textContent="未加入档案："+errorKind(err)}
 };
 exportButton.onclick=()=>{if(selected)download("historical-catalogue-input.json",JSON.stringify(selected.input,null,2))};
 removeButton.onclick=()=>{importTicket++;if(selected&&catalogueSelection&&projectCatalogue.remove(catalogueSelection)){catalogueSelection=null;render()}};

 }else if(page==="dashboard"){
 const d=report.terminal_state,t=d.treasury,v=d.market;
 const reviewRows=historicalReviewRows(d);
 const sol=x=>{if(x==null)return "未知";if(d.scope.quoteAsset!=="SOL_LAMPORTS")return x+" base units";const n=BigInt(x),abs=n<0n?-n:n;return (n<0n?"-":"")+(abs/1000000000n).toString()+"."+(abs%1000000000n).toString().padStart(9,"0")+" SOL"};
 const known=x=>x==null?"未知":x;
 const fmt=x=>quoteAmount(x,d.scope.quoteAsset);
 const navPoints=d.status==="REPORT_READY"?d.performance.observations.map(x=>({label:x.sequence,value:x.nav_base_units})):[]; 
 const confirmed=data.market.trades.filter(x=>x.status==="FINALIZED"&&x.reconciliation==="PASS");
 main.innerHTML='<div class="terminal-heading"><div><p class="eyebrow">PORTFOLIO / MARKET MONITOR</p><h2>市场与资产总览</h2><span class="muted">'+esc(d.scope.projectId)+' · '+esc(d.source_mode)+' · '+esc(d.scope.openingCutoff)+' → '+esc(d.scope.closingCutoff)+'</span></div><div class="row"><button id="dashboard-reset">重置样本</button><button id="dashboard-export">导出总览</button><button id="dashboard-export-input">导出可重新导入的记录</button></div></div>'+
 '<div class="terminal-kpis stats">'+stat("期末现金",fmt(t.closing_cash_base_units))+stat("已实现净收益",fmt(t.realized_project_pnl_base_units))+stat("库存成本",fmt(t.remaining_cost_basis_base_units))+stat("创作者费",fmt(t.creator_cash_income_base_units))+stat("历史回撤",t.max_observed_drawdown_bps==null?"未知":Number(t.max_observed_drawdown_bps)/100+"%")+'</div>'+
 '<div class="terminal-grid"><div>'+panel("资产净值 · 历史快照",seriesChart(navPoints,"NAV"))+panel("成交金额 · 已确认事件",seriesChart(confirmed.map(x=>({label:x.sequence,value:x.quoteNotionalBaseUnits,side:x.side})),"TRADE"))+'</div><div>'+
 panel("市场状态",'<div class="stats">'+stat("买入笔数",v.buy_trade_count)+stat("卖出笔数",v.sell_trade_count)+'</div>'+table(["指标","数值"],[["买入名义额",fmt(v.buy_notional_base_units)],["卖出名义额",fmt(v.sell_notional_base_units)],["真实储备",fmt(v.verified_real_reserve_base_units)],["买入地址",known(v.buy_address_count)],["卖出地址",known(v.sell_address_count)]]))+
 panel("风险与数据",table(["检查","结果"],[["统一审计",d.status],["可信等级",d.trust.grade+" / "+d.trust.status],["历史证据",d.archived_evidence.status],["来源认证","UNKNOWN"],["历史覆盖",v.history_complete?"已声明完整":"待复核"],["行情证据",d.market_state.status],["行情来源认证",d.market_state.source_attestation],["Localnet","此页为离线报告"]])+(d.issues.length?table(["待复核事项"],d.issues.map(x=>[x])):""))+'</div></div>'+
 panel("历史风险明细",table(["级别","风险","原因"],reviewRows.alerts)+table(["检查","状态","证据"],reviewRows.checks))+
 panel("项目资金明细",table(["指标","数值"],[["交易支出",fmt(t.actual_trade_spend_base_units)],["交易回款",fmt(t.actual_trade_receipts_base_units)],["净交易支出",fmt(t.net_trade_cash_spend_base_units)],["资本流入",fmt(t.recorded_capital_in_base_units)],["资本流出",fmt(t.recorded_capital_out_base_units)],["独立费用",fmt(t.recorded_expenses_base_units)],["库存数量（base units）",known(t.closing_token_balance_base_units)]]))+
 panel("数据区间",'<label for="dashboard-import">导入完整的历史报告输入 JSON</label><input type="file" id="dashboard-import" accept=".json"><p id="dashboard-error" class="negative"></p><p class="muted">离线区间数据；名义成交额不代表独立需求。未知值不估算。</p>');
 document.querySelector("#dashboard-reset").onclick=()=>{importTicket++;record("sample.reset",{page});offlineReview=false;data=structuredClone(original);report=auditedReport(data);render()};
 document.querySelector("#dashboard-export").onclick=()=>download("historical-dashboard.json",JSON.stringify(d,null,2));
 document.querySelector("#dashboard-export-input").onclick=()=>download("historical-report-input.json",JSON.stringify(data,null,2));
 document.querySelector("#dashboard-import").onchange=async e=>{const ticket=++importTicket,startPage=page;try{const file=e.target.files[0];if(!file)return;if(file.size>16*1024*1024)throw Error("报告文件超过 16 MiB");record("report.import.started",{page,file_bytes:file.size});const next=JSON.parse(await file.text());const nextReport=auditedReport(next);if(!importCurrent(ticket,startPage))return;offlineReview=true;data=next;report=nextReport;record("report.import.completed",{page,source_mode:report.source_mode,status:report.status});render()}catch(err){record("report.import.failed",{page,error_kind:errorKind(err)},"ERROR");if(importCurrent(ticket,startPage)){const el=document.querySelector("#dashboard-error");if(el)el.textContent=errorKind(err)+"：报告未通过校验";}}};
 }else if(page==="create"){
  const ticket=++importTicket;
  mountProjectSetup(main,{
   initialProjectId:activeProjectId,
   initialMessage:projectMessage,
   onActiveProjectId:id=>{activeProjectId=id;},
   isActive:()=>page==="create"&&importTicket===ticket,
   screenHeading,panel,note,table,esc,download,projectRegistry,record,errorKind
  });
  }else if(page=="wallet"){
 const d=report.terminal_state,t=d.treasury;
 main.innerHTML=screenHeading("Treasury / 资金中心","项目账本 · 报价资产原始单位")+
 metrics([["期末现金",a.closing_cash_base_units],["已实现盈亏",a.realized_project_pnl_base_units],["创作者费",a.creator_cash_income_base_units],["独立费用",t.recorded_expenses_base_units]])+
 splitView(panel("资金收支",compareBars([["交易支出",t.actual_trade_spend_base_units,"red"],["交易回款",t.actual_trade_receipts_base_units,"green"],["创作者收入",a.creator_cash_income_base_units,"green"],["独立费用",t.recorded_expenses_base_units,"red"]],"base units")),panel("财务对账",table(["检查","结果"],[["总账",report.status],["资本流入",t.recorded_capital_in_base_units],["资本流出",t.recorded_capital_out_base_units]]))+emptyState("钱包余额未接入","当前报告仅包含项目级资金证据"))+
 panel("资金流水",table(["记录","类型","金额","对账"],data.cash.entries.map(x=>[x.id,x.kind,x.amountBaseUnits,x.reconciliation])));

 }else if(page==="lab"){
 main.innerHTML='<h2>历史成交测试</h2>'+note("读取固定的合成或已归档历史报告数据，仅进行离线核算。")+'<div class="panel"><div class="row"><button id="reset">恢复默认样本</button><button id="bad">测试缺失交易</button><button id="export">导出报告</button></div><label>导入已标准化历史 JSON</label><input id="load" type="file" accept=".json"><p id="error" class="negative"></p></div>'+panel("逐笔成交记录",table(["事件","序号","方向","金额（base units）","状态"],data.market.trades.map(t=>[t.id,t.sequence,t.side,t.quoteNotionalBaseUnits,t.status])))+details("核算结果原始数据",report);
 document.querySelector("#reset").onclick=()=>{importTicket++;record("sample.reset",{page});offlineReview=false;data=structuredClone(original);report=auditedReport(data);render()};
 document.querySelector("#bad").onclick=()=>{importTicket++;record("sample.incomplete",{page},"WARN");offlineReview=true;data=structuredClone(original);data.market.historyComplete=false;report=auditedReport(data);render()};
 document.querySelector("#export").onclick=()=>download("mvp-historical-report.json",JSON.stringify(report,null,2));
 document.querySelector("#load").onchange=async e=>{const ticket=++importTicket,startPage=page;try{const file=e.target.files[0];if(!file)return;if(file.size>16*1024*1024)throw Error("报告文件超过 16 MiB");record("report.import.started",{page,file_bytes:file.size});const next=JSON.parse(await file.text());const nextReport=auditedReport(next);if(!importCurrent(ticket,startPage))return;offlineReview=true;data=next;report=nextReport;record("report.import.completed",{page,source_mode:report.source_mode,status:report.status});render()}catch(err){record("report.import.failed",{page,error_kind:errorKind(err)},"ERROR");if(importCurrent(ticket,startPage)){const el=document.querySelector("#error");if(el)el.textContent=errorKind(err)+"：报告未通过校验";}}};
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
 panel("场景报告",'<button id="export-participants">导出实验结果 JSON</button>'+details("实验原始数据",results))+
 panel("离线账簿复核",'<p class="muted">仅导入已记录的合成账簿；不生成交易，不认证市场行为。</p><label for="synthetic-ledger-file">账簿输入 JSON</label><input type="file" id="synthetic-ledger-file" accept=".json"><button id="synthetic-ledger-sample">载入固定测试样本</button> <button id="synthetic-ledger-export" disabled>导出核验结果</button><div id="synthetic-ledger-result" role="status"></div>')+
 panel("统一仿真实验验收",'<p class="muted">使用 npm run simulate:validate 生成离线报告；导入仅复核报告计数，不独立验证运行结果。</p><label for="participant-validation-file">基线报告</label><input id="participant-validation-file" type="file" accept=".json"><div id="participant-validation-result" role="status"></div><label for="participant-validation-candidate">候选版本报告</label><input id="participant-validation-candidate" type="file" accept=".json"><div id="participant-validation-comparison" role="status"></div>')+
 panel("多实验报告复盘",'<p class="muted">导入已完成的离线合成报告数组，重新核验账簿和记录；不导入派生审计结论，不评估真实市场行为。</p><label for="batch-review-file">原始实验报告数组 JSON（最多 100 份 / 4 MiB）</label><input id="batch-review-file" type="file" accept=".json"><button id="batch-review-export" disabled>导出批量核验报告</button><div id="batch-review-result" role="status"></div>');
 const validationResult=main.querySelector("#participant-validation-result"),validationComparison=main.querySelector("#participant-validation-comparison"),validationCandidate=main.querySelector("#participant-validation-candidate");
 let validationTicket=0,comparisonTicket=0,validationBase=null;validationCandidate.disabled=true;
 main.querySelector("#participant-validation-file").onchange=async e=>{
  const ticket=++validationTicket,file=e.target.files[0];validationResult.textContent="";validationBase=null;comparisonTicket++;validationCandidate.disabled=true;validationCandidate.value="";validationComparison.textContent="";if(!file)return;
  try{if(file.size>4*1024*1024)throw Error("FILE_TOO_LARGE");
   const data=JSON.parse(await file.text());if(ticket!==validationTicket||!validationResult.isConnected)return;
   const view=summarizeImportedParticipantValidation(data);validationBase=data;validationCandidate.disabled=false;
   validationResult.innerHTML=note("导入声明计数："+view.status+" · 来源未认证")+table(["测试组","案例","通过","失败"],view.groups)+note("历史校准："+view.calibration_status);
  }catch{if(ticket===validationTicket&&validationResult.isConnected)validationResult.textContent="报告无效或计数不一致。";}
 };
 validationCandidate.onchange=async e=>{
  const ticket=++comparisonTicket,file=e.target.files[0],base=validationBase;validationComparison.textContent="";if(!file||!base)return;
  try{if(file.size>4*1024*1024)throw Error("FILE_TOO_LARGE");
   const raw=JSON.parse(await file.text());if(ticket!==comparisonTicket||!validationComparison.isConnected||base!==validationBase)return;
   const v=compareImportedParticipantValidation(base,raw);
   validationComparison.innerHTML=note("声明版本比较："+v.status+" · 来源未认证")+table(["测试组","案例数","基线通过","候选通过","变化"],v.groups)+table(["测试组","案例","变化"],v.changed_cases.map(c=>[c.group,c.case_id,c.change]))+table(["测试组","案例","子检查","变化"],v.changed_subchecks.map(c=>[c.group,c.case_id,c.check_id,c.change]));
  }catch{if(ticket===comparisonTicket&&validationComparison.isConnected)validationComparison.textContent="版本报告无效，无法比较。";}
 };
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
 const ledgerResult=document.querySelector("#synthetic-ledger-result"),ledgerExport=document.querySelector("#synthetic-ledger-export");
 let ledgerAudit=null,ledgerTicket=0;
 const showLedger=raw=>{
  const view=reviewSyntheticLedgerInput(raw);ledgerAudit=view.audit;
  ledgerResult.innerHTML=note("合成账簿 · "+view.audit.status)+metrics(view.metrics)+table(["账户","报价资产差额（base units）","Token 差额（base units）"],view.rows)+table(["异常"],view.issues.map(x=>[x]));
  ledgerExport.disabled=false;
 };
 const loadLedger=async read=>{
  const ticket=++ledgerTicket;ledgerAudit=null;ledgerExport.disabled=true;ledgerResult.textContent="读取账簿";
  try{const raw=await read();if(ticket!==ledgerTicket||!ledgerResult.isConnected)return;showLedger(raw)}
  catch(e){if(ticket===ledgerTicket&&ledgerResult.isConnected){ledgerResult.textContent="账簿未通过输入校验";ledgerAudit=null;ledgerExport.disabled=true}}
 };
 document.querySelector("#synthetic-ledger-file").onchange=e=>{
  const file=e.target.files[0];if(!file)return;
  loadLedger(async()=>{if(file.size>4*1024*1024)throw Error("FILE_TOO_LARGE");return JSON.parse(await file.text())});
 };
 document.querySelector("#synthetic-ledger-sample").onclick=()=>loadLedger(async()=>{
  const response=await fetch("/fixtures/synthetic/closed-ledger-review.json",{cache:"no-store"});if(!response.ok)throw Error("FIXTURE_UNAVAILABLE");return response.json();
 });
 ledgerExport.onclick=()=>{if(ledgerAudit)download("synthetic-ledger-audit.json",JSON.stringify(ledgerAudit,null,2))};
 const batchResult=main.querySelector("#batch-review-result"),batchExport=main.querySelector("#batch-review-export");
 let batchAudit=null,batchTicket=0;
 main.querySelector("#batch-review-file").onchange=async e=>{
  const ticket=++batchTicket,file=e.target.files[0];
  batchAudit=null;batchExport.disabled=true;batchResult.textContent="";
  if(!file)return;
  batchResult.textContent="读取离线报告";
  try{
   if(file.size>4*1024*1024)throw Error("FILE_TOO_LARGE");
   const raw=JSON.parse(await file.text());
   if(ticket!==batchTicket||!batchResult.isConnected)return;
   const view=reviewSyntheticBatchInput(raw);
   batchResult.innerHTML=note("合成记录内部核验 · "+view.audit.status)+metrics(view.metrics)+
    table(["检查","通过","需复核","未知","未评估"],view.comparison)+
    table(["实验","状态","事件","成交","账户差异或记录问题"],view.rows)+
    table(["异常类型","受影响报告数"],view.issues);
   batchAudit=view.audit;batchExport.disabled=false;
  }catch{if(ticket===batchTicket&&batchResult.isConnected){batchAudit=null;batchExport.disabled=true;batchResult.textContent="批量输入无效，未生成核验报告。"}}
 };
 batchExport.onclick=()=>{if(batchAudit)download("synthetic-batch-audit.json",JSON.stringify(batchAudit,null,2))};
 }else if(page==="logs"){
 const logs=diagnostics.snapshot();
 main.innerHTML=screenHeading("系统设置","连接状态 · 诊断事件 · 数据导入")+panel("服务状态",table(["服务","状态"],[["浏览器应用","已初始化"],["报告引擎",report.status],["Localnet RPC","待检查"],["交易执行","测试链按配置启用"]])+'<div class="row"><button id="rpc-health">检查本地连接</button></div><div id="rpc-health-result" role="status"></div>')+note("仅保存当前页面会话的最近 1000 条结构化诊断事件，同一标签页刷新时保留（浏览器存储不可用时除外）。不会记录原始输入、钱包地址、私钥、RPC URL 或原始错误信息。")+
 '<div class="stats">'+stat("日志条数",logs.entries.length)+stat("警告",logs.entries.filter(x=>x.level==="WARN").length)+stat("错误",logs.entries.filter(x=>x.level==="ERROR").length)+stat("已滚动丢弃",logs.dropped_count)+'</div>'+
 panel("日志工具",'<div class="row"><button id="log-download" class="primary">导出诊断日志 JSON</button><button id="log-refresh">刷新</button><button id="log-clear">清空日志</button></div>')+
 panel("最近事件",table(["时间 (UTC)","级别","事件","详情"],logs.entries.slice().reverse().map(x=>[x.time,x.level,x.event,JSON.stringify(x.detail)])));
 document.querySelector("#rpc-health").onclick=async()=>{const output=document.querySelector("#rpc-health-result");output.textContent="检查中…";try{const response=await fetch("/api/terminal/health",{cache:"no-store"});if(!response.ok)throw Error("health endpoint unavailable");const result=await response.json();output.innerHTML=table(["检查","状态"],[["报告桥",result.report_bridge],["RPC",result.rpc?.status],["最终确认 slot",result.rpc?.slot],["版本",result.rpc?.version],["Genesis hash",result.rpc?.genesis_hash],["网络身份","待独立核验"]]);}catch{output.textContent="本地检查接口不可用";}};
 document.querySelector("#log-download").onclick=async()=>{await exportDiagnostics();render()};
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
