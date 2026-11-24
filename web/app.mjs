import { buildHistoricalMvpReport } from "../src/inner-market/historical-mvp-report.mjs";
const main=document.querySelector("#main"),nav=document.querySelector("#nav");
const pages=[["create","01 发行资料"],["wallet","02 钱包账本"],["lab","03 历史成交测试"],["market","04 市场监控"],["profit","05 收益与风险"]];
const fixture=await fetch("../fixtures/synthetic/inner-market-mvp.json").then(r=>{if(!r.ok)throw new Error("Fixture unavailable");return r.json()});
const original=structuredClone(fixture);
let data=structuredClone(fixture),report=buildHistoricalMvpReport(data),page="create";
const esc=s=>String(s??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const stat=(name,value)=>'<div class="stat"><small>'+esc(name)+'</small><strong>'+esc(value)+'</strong></div>';
const table=(headers,rows)=>'<div class="scroll"><table><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join("")+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+esc(x)+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';
const note=s=>'<div class="notice">'+esc(s)+'</div>';
const panel=(title,body)=>'<section class="panel"><h3>'+esc(title)+'</h3>'+body+'</section>';
function download(name,text){const a=document.createElement("a");const url=URL.createObjectURL(new Blob([text],{type:"application/json"}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function render(){
 document.querySelector(".tag").textContent="OFFLINE · "+report.source_mode;
 nav.innerHTML=pages.map(([id,label])=>'<button data-page="'+id+'" class="'+(page===id?"active":"")+'">'+label+'</button>').join("");
 nav.querySelectorAll("button").forEach(b=>b.onclick=()=>{page=b.dataset.page;render()});
 const a=report.accounting,m=report.market_history;
 if(page==="create"){
 main.innerHTML='<h2>发行资料</h2>'+note("仅用于整理测试资料，不创建 Token、不构造或提交交易。")+'<form id="metadata" class="panel"><div class="grid"><div><label>名称</label><input name="name" required maxlength="32" placeholder="Test Token"></div><div><label>Symbol</label><input name="symbol" required maxlength="10" placeholder="TEST"></div><div><label>Decimals</label><input disabled value="由协议配置读取"></div><div><label>Supply</label><input disabled value="由协议配置读取"></div><div><label>描述</label><textarea name="description" maxlength="1000"></textarea></div><div><label>图片（本地预览）</label><input type="file" id="image" accept="image/png,image/jpeg"><img id="preview" class="preview hidden" alt="图片预览"></div></div><div class="grid"><div><label>Website</label><input name="website" type="url"></div><div><label>Telegram</label><input name="telegram" type="url"></div><div><label>Twitter / X</label><input name="twitter" type="url"></div></div><p class="muted">权限、费用、初始交易结果需由测试环境实际数据验证；本页面不支持钱包连接或买入提交。</p><button class="primary" type="submit">导出本地资料 JSON</button></form>';
 document.querySelector("#metadata").onsubmit=e=>{e.preventDefault();download("synthetic-token-metadata.json",JSON.stringify({sourceMode:"SYNTHETIC",...Object.fromEntries(new FormData(e.currentTarget))},null,2))};
 document.querySelector("#image").onchange=e=>{const f=e.target.files[0];if(!f)return;const p=document.querySelector("#preview");const url=URL.createObjectURL(f);p.onload=()=>URL.revokeObjectURL(url);p.src=url;p.classList.remove("hidden")};
 }else if(page==="wallet"){
 main.innerHTML='<h2>钱包账本</h2>'+note("此合成样本仅提供项目总账，未提供逐钱包归属或余额证据，不虚构拆分持仓。")+'<div class="stats">'+stat("项目现金（lamports）",a.closing_cash_base_units)+stat("库存（base units）",a.closing_token_balance_base_units)+stat("成本（lamports）",a.remaining_cost_basis_base_units)+'</div>'+panel("项目资产流水",table(["记录","类型","金额","对账"],data.cash.entries.map(x=>[x.id,x.kind,x.amountBaseUnits,x.reconciliation])))+panel("钱包级数据","<p class='muted'>待输入经验证的逐钱包历史账本。所有自有钱包应在报告范围内披露；本页不提供私钥录入或批量交易。</p>");
 }else if(page==="lab"){
 main.innerHTML='<h2>历史成交测试</h2>'+note("读取固定的合成或已归档历史报告数据，仅进行离线核算。")+'<div class="panel"><div class="row"><button id="reset">恢复默认样本</button><button id="bad">测试缺失交易</button><button id="export">导出报告</button></div><label>导入已标准化历史 JSON</label><input id="load" type="file" accept=".json"><p id="error" class="negative"></p></div>'+panel("逐笔成交记录",table(["事件","序号","方向","金额（base units）","状态"],data.market.trades.map(t=>[t.id,t.sequence,t.side,t.quoteNotionalBaseUnits,t.status])))+panel("核算结果","<pre>"+esc(JSON.stringify(report,null,2))+"</pre>");
 document.querySelector("#reset").onclick=()=>{data=structuredClone(original);report=buildHistoricalMvpReport(data);render()};
 document.querySelector("#bad").onclick=()=>{data=structuredClone(original);data.market.historyComplete=false;report=buildHistoricalMvpReport(data);render()};
 document.querySelector("#export").onclick=()=>download("mvp-historical-report.json",JSON.stringify(report,null,2));
 document.querySelector("#load").onchange=async e=>{try{const next=JSON.parse(await e.target.files[0].text());const nextReport=buildHistoricalMvpReport(next);data=next;report=nextReport;render()}catch(err){document.querySelector("#error").textContent=err.message}};
 }else if(page==="market"){
 main.innerHTML='<h2>市场监控 · 历史快照</h2>'+note("仅显示已归档的成交汇总和储备，不进行市场预测。数据模式："+report.source_mode)+'<div class="stats">'+stat("买入记录",m.confirmed_buy_count)+stat("卖出记录",m.confirmed_sell_count)+stat("真实 SOL 储备（lamports）",m.real_quote_reserves_base_units)+stat("真实 Token 储备（base units）",m.real_token_reserves_base_units)+'</div>'+panel("储备快照",table(["项目","数值（base units）"],[["虚拟 SOL",m.virtual_quote_reserves_base_units],["虚拟 Token",m.virtual_token_reserves_base_units],["真实 SOL",m.real_quote_reserves_base_units],["真实 Token",m.real_token_reserves_base_units]]))+panel("历史成交汇总",table(["方向","名义成交额"],[["BUY",m.gross_buy_notional_base_units],["SELL",m.gross_sell_notional_base_units]]))+"<p class='muted'>当前报告没有 K 线或 Holder 明细数据，不补造图表。</p>";
 }else{
 main.innerHTML='<h2>收益与风险</h2>'+note("仅核算已发生的历史事件；未通过统一审计时，财务输出为未知。")+'<div class="stats">'+stat("已实现项目盈亏（lamports）",a.realized_project_pnl_base_units)+stat("已到账手续费（lamports）",a.creator_cash_income_base_units)+stat("历史观测回撤（bps）",a.max_observed_drawdown_bps)+stat("审计状态",report.status)+'</div>'+panel("异常清单",report.issues.length?table(["异常"],report.issues.map(x=>[x])):"<p class='positive'>输入样本通过当前审计规则。</p>")+panel("详细审计","<pre>"+esc(JSON.stringify(report.audits,null,2))+"</pre>")+"<p class='muted'>合成样本通过不等于本地链数据已验证，也不意味着收益可实现。</p>";
 }
 main.insertAdjacentHTML("beforeend",'<p class="foot">Cook System · Offline MVP · '+esc(report.source_mode)+' · Execution disabled</p>');
}
render();
