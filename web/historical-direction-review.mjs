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
 let side="BUY",filter="ALL",input=null,state="请选择 Meme，并关联已核对的历史报告。";
 const fmt=v=>v==null?"—":esc(quoteAmount(v,"SOL_LAMPORTS"));
 const metric=(label,value)=>'<div><small>'+esc(label)+'</small><strong>'+value+'</strong></div>';
 const kv=(label,value)=>'<span>'+esc(label)+'</span><strong>'+value+'</strong>';
 const row=(label,value)=>kv(label,value==null?"—":esc(value));
 function draw(){
  const summary=historicalDirectionSummary(input,side);
  const buy=historicalDirectionSummary(input,"BUY"),sell=historicalDirectionSummary(input,"SELL");
  const position=buy&&sell?historicalTradePosition(input):null;
  const trades=buy&&sell?input.market.trades.filter(t=>["BUY","SELL"].includes(t.side)&&t.status==="FINALIZED"&&t.reconciliation==="PASS"&&(filter==="ALL"||t.side===filter)):null;
  host.innerHTML='<section class="meme-control-section bundle-review"><div class="meme-rail-head"><h3>Bundle Buy / Sell</h3><span class="bundle-mode-label">历史复核 · 执行未接入</span></div>'+
   '<div class="bundle-direction" role="group" aria-label="历史成交方向"><button data-direction="BUY" aria-pressed="'+(side==="BUY")+'">Bundle Buy</button><button data-direction="SELL" aria-pressed="'+(side==="SELL")+'">Bundle Sell</button></div>'+
   '<div class="bundle-metrics">'+metric("已对账成交笔数",summary?esc(summary.count):"—")+metric(side==="BUY"?"历史买入名义额":"历史卖出名义额",fmt(summary?.total_base_units))+'</div>'+
   '<p role="status" class="muted">'+esc(summary?"已关联历史区间 · 非实时 · 未独立认证 · Bundle 归属未知":state)+'</p>'+
   '<h3>Execution Preview / 执行预览</h3><div class="meme-kv">'+row("实时钱包余额",null)+row("预计成交 / 回收",null)+row("费用 / 滑点 / 价格冲击",null)+row("预计交易数量 / 时长",null)+'</div>'+
   '<button class="bundle-submit" type="button" disabled>'+(side==="BUY"?"Buy":"Sell")+' · 执行未接入</button></section>'+
   '<section class="meme-control-section"><div class="meme-rail-head"><h3>Position / 持仓与损益</h3><span class="bundle-mode-label">历史区间</span></div>'+
   '<div class="meme-kv">'+kv("历史买入成本",fmt(position?.buy_cost))+kv("历史卖出净回收",fmt(position?.net_sell_proceeds))+row("期末 Token（base units）",position?.token_balance)+kv("剩余库存成本",fmt(position?.remaining_cost))+kv("已实现交易损益",fmt(position?.realized_pnl))+row("未实现损益",null)+'</div>'+
   '<p class="muted">仅显示同区间且库存对账匹配的声明值；不是实时余额或会话收益。</p></section>'+
   '<section class="meme-control-section"><div class="meme-rail-head"><h3>Exit / 持仓退出</h3><span class="bundle-mode-label">未接入</span></div>'+
   '<div class="meme-kv">'+row("当前可售数量",null)+row("预计净回收",null)+row("预计退出损益",null)+'</div><button type="button" class="bundle-submit" disabled>退出 · 执行未接入</button></section>'+
   '<section class="meme-control-section trade-log"><div class="meme-rail-head"><h3>Trades Log / 成交记录</h3><small>仅当前 Meme</small></div>'+
   '<div class="row" role="group" aria-label="成交记录筛选">'+["ALL","BUY","SELL"].map(k=>'<button type="button" data-trade-filter="'+k+'" aria-pressed="'+(filter===k)+'">'+({ALL:"全部",BUY:"买入",SELL:"卖出"}[k])+'</button>').join("")+'</div>'+
   (trades?table(["方向","记录","序号","名义金额"],trades.slice(-12).reverse().map(t=>[t.side,t.id,t.sequence,quoteAmount(t.quoteNotionalBaseUnits,"SOL_LAMPORTS")])):'<div class="trade-log-empty">暂无已核对成交记录</div>')+
   (trades?'<p class="muted">符合筛选条件 '+esc(trades.length)+' 笔 · 最近最多 12 笔</p>':"")+'</section>'+
   '<section class="meme-control-section"><h3>Execution Settings / 执行设置</h3><div class="meme-kv">'+row("费用支付方",null)+row("交易保护",null)+row("滑点配置",null)+'</div><p class="muted">实时交易服务未接入；不保存或应用执行参数。</p></section>';
  host.querySelectorAll("[data-direction]").forEach(b=>b.onclick=()=>{side=b.dataset.direction;draw();});
  host.querySelectorAll("[data-trade-filter]").forEach(b=>b.onclick=()=>{filter=b.dataset.tradeFilter;draw();});
 }
 draw();
 return {clear(message){input=null;filter="ALL";side="BUY";state=message;draw();},show(next){input=next;state="当前报告缺少可用的成交金额证据。";draw();}};
}
