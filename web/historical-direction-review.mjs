// Retrospective direction review; no signing, submission, routing or bundle inference.
export function historicalDirectionSummary(input,side){
 if(!["BUY","SELL"].includes(side))throw Error("INVALID_DIRECTION");
 if(!input||!Array.isArray(input.market?.trades)||input.scope?.quoteAsset!=="SOL_LAMPORTS")return null;
 const rows=[];let amount=0n;
 for(const t of input.market.trades){
  if(t.side!==side||t.status!=="FINALIZED"||t.reconciliation!=="PASS")continue;
  if(typeof t.quoteNotionalBaseUnits!=="string"||!/^(0|[1-9][0-9]{0,39})$/.test(t.quoteNotionalBaseUnits))return null;
  amount+=BigInt(t.quoteNotionalBaseUnits);rows.push(t);
 }
 return {count:rows.length,total_base_units:amount.toString(),rows:rows.slice(-12).reverse(),bundle_membership:"UNKNOWN",execution_enabled:false};
}

// Historical ledger values are declarations, not live balances, quotes, or executable orders.
const unsigned=v=>typeof v==="string"&&/^(0|[1-9][0-9]{0,39})$/.test(v);
const signed=v=>typeof v==="string"&&/^(0|-?[1-9][0-9]{0,39})$/.test(v);
const scopeKeys=["projectId","tokenMint","quoteAsset","openingCutoff","closingCutoff"];
export function historicalTradePosition(input){
 const scope=input?.scope,inventory=input?.inventory,l=inventory?.ledger;
 if(!scope||scope.quoteAsset!=="SOL_LAMPORTS"||!inventory||!l||
  !scopeKeys.every(k=>typeof scope[k]==="string"&&scope[k]&&inventory.scope?.[k]===scope[k])||
  inventory.historyComplete!==true||l.inventory_reconciliation!=="MATCH")return null;
 const amount=k=>unsigned(l[k])?l[k]:null;
 return {
  buy_cost:amount("total_buy_cost_quote_base_units"),
  net_sell_proceeds:amount("total_net_sell_proceeds_quote_base_units"),
  token_balance:amount("ending_token_balance_base_units"),
  remaining_cost:l.cost_basis_complete===true?amount("remaining_cost_basis_quote_base_units"):null,
  realized_pnl:l.cost_basis_complete===true&&l.realized_pnl_complete===true&&signed(l.realized_pnl_quote_base_units)?l.realized_pnl_quote_base_units:null
 };
}
export function mountHistoricalDirectionReview(host,{esc,table,quoteAmount}){
 let side="BUY",filter="ALL",input=null,state="请选择 Meme",draft={BUY:"",SELL:""},settingsOpen=false,positionOpen=false,project=null;
 const fmt=v=>v==null?"—":esc(quoteAmount(v,"SOL_LAMPORTS"));
 const kv=(label,value)=>'<span>'+esc(label)+'</span><strong>'+value+'</strong>';
 const row=(label,value)=>kv(label,value==null?"—":esc(value));
 const heading=(title,extra="")=>'<div class="trade-heading"><h3>'+title+'</h3>'+extra+'</div>';
 function draw(){
  const buy=historicalDirectionSummary(input,"BUY"),sell=historicalDirectionSummary(input,"SELL");
  const position=buy&&sell?historicalTradePosition(input):null;
  const trades=buy&&sell?input.market.trades.filter(t=>["BUY","SELL"].includes(t.side)&&t.status==="FINALIZED"&&t.reconciliation==="PASS"&&(filter==="ALL"||t.side===filter)):null;
  host.innerHTML='<div class="trade-ticket" data-side="'+side+'">'+
   '<div class="trade-instrument"><div><strong>'+esc(project?.profile?.symbol||"未选择 Meme")+'</strong><small>'+esc(project?.profile?.name||"从左侧选择 Meme")+'</small></div><span class="trade-network">SOL</span></div>'+
   '<div class="trade-block">'+heading("Trade",'<small>执行未接入</small>')+
   '<div class="bundle-direction" role="group" aria-label="买卖方向"><button type="button" data-direction="BUY" aria-pressed="'+(side==="BUY")+'">Buy / 买入</button><button type="button" data-direction="SELL" aria-pressed="'+(side==="SELL")+'">Sell / 卖出</button></div>'+
   '<div class="trade-field"><label for="trade-amount">'+(side==="BUY"?"买入金额":"卖出数量")+'</label><div class="trade-input"><input id="trade-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" value="'+esc(draft[side])+'"><span>'+(side==="BUY"?"SOL":"Token")+'</span></div></div>'+
   '<div class="trade-kv">'+row("可用余额",null)+row("预计成交 / 回收",null)+row("费用 / 价格冲击",null)+'</div>'+
   '<button class="trade-cta" type="button" disabled>'+(side==="BUY"?"Buy / 买入":"Sell / 卖出")+'</button><p class="trade-hint">交易服务未接入，金额仅为界面草稿。</p></div>'+
   '<div class="trade-block">'+heading("Exit / 持仓退出")+
   '<div class="trade-kv">'+row("当前可售 Token",null)+row("预计净回收",null)+row("预计退出损益",null)+'</div><button class="trade-cta trade-exit" type="button" disabled>Sell position / 退出持仓</button></div>'+
   '<details class="trade-block trade-detail" data-position'+(positionOpen?" open":"")+'><summary>Position / 历史持仓与损益</summary>'+
   '<div class="trade-kv">'+kv("历史买入成本",fmt(position?.buy_cost))+kv("历史卖出净回收",fmt(position?.net_sell_proceeds))+row("期末 Token（base units）",position?.token_balance)+kv("剩余库存成本",fmt(position?.remaining_cost))+kv("已实现交易损益",fmt(position?.realized_pnl))+'</div><p class="trade-hint">'+esc(position?"已核对历史区间，非实时资产":state)+'</p></details>'+
   '<div class="trade-block trade-log">'+heading("Trades Log",'<small>当前 Meme · 历史</small>')+
   '<div class="trade-filters" role="group" aria-label="成交记录筛选">'+["ALL","BUY","SELL"].map(k=>'<button type="button" data-trade-filter="'+k+'" aria-pressed="'+(filter===k)+'">'+({ALL:"全部",BUY:"买入",SELL:"卖出"}[k])+'</button>').join("")+'</div>'+
   (trades&&trades.length?table(["方向","记录","序号","金额"],trades.slice(-12).reverse().map(t=>[t.side,t.id,t.sequence,quoteAmount(t.quoteNotionalBaseUnits,"SOL_LAMPORTS")])):'<div class="trade-log-empty">暂无成交记录</div>')+
   (trades&&trades.length?'<p class="trade-hint">'+esc(trades.length)+' 笔 · 显示最近最多 12 笔</p>':"")+'</div>'+
   '<details class="trade-block trade-detail" data-settings'+(settingsOpen?" open":"")+'><summary>Execution Settings / 执行设置</summary><div class="trade-kv">'+row("手续费支付方",null)+row("交易保护",null)+row("滑点配置",null)+'</div><p class="trade-hint">等待交易服务提供配置。</p></details></div>';
  host.querySelectorAll("[data-direction]").forEach(b=>b.onclick=()=>{side=b.dataset.direction;draw();});
  host.querySelectorAll("[data-trade-filter]").forEach(b=>b.onclick=()=>{filter=b.dataset.tradeFilter;draw();});
  host.querySelector("#trade-amount").oninput=e=>{draft[side]=e.target.value;};
  host.querySelector("[data-position]").ontoggle=e=>{positionOpen=e.target.open;};
  host.querySelector("[data-settings]").ontoggle=e=>{settingsOpen=e.target.open;};
 }
 draw();
 return {
  setProject(next){const changed=project?.project_id!==next?.project_id;if(changed){draft={BUY:"",SELL:""};side="BUY";filter="ALL";input=null;state="等待当前 Meme 历史记录";}project=next;draw();},
  clear(message){input=null;filter="ALL";state=message;draw();},
  show(next){input=next;state="当前报告缺少可用的成交金额证据。";draw();}
 };
}
