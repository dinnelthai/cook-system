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
 let side="BUY",filter="ALL",input=null,state="请选择 Meme",settingsOpen=false,positionOpen=false,project=null;
 const fmt=v=>v==null?"—":esc(quoteAmount(v,"SOL_LAMPORTS"));
 const kv=(label,value)=>'<span>'+esc(label)+'</span><strong>'+value+'</strong>';
 const row=(label,value)=>kv(label,value==null?"—":esc(value));
 const heading=(title,extra="")=>'<div class="trade-heading"><h3>'+title+'</h3>'+extra+'</div>';
 const tile=(label,value,extra="")=>'<div class="smith-trade-card '+extra+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>';
 function draw(){
  const buy=historicalDirectionSummary(input,"BUY"),sell=historicalDirectionSummary(input,"SELL");
  const position=buy&&sell?historicalTradePosition(input):null;
  const trades=buy&&sell?input.market.trades.filter(t=>["BUY","SELL"].includes(t.side)&&t.status==="FINALIZED"&&t.reconciliation==="PASS"&&(filter==="ALL"||t.side===filter)):null;
  // Historical reports must never populate live estimates. Zero counts are only
  // used when no project is selected; unknown live balances and quotes remain —.
  const count=project?"—":"0",wallets=project?"—/—":"0/0";
  host.innerHTML='<div class="trade-ticket smith-trade" data-side="'+side+'">'+
   '<section class="smith-section smith-bundle">'+heading("Bundle Buy / Sell",'<span class="smith-wallet-count">'+wallets+' Wallets '+(side==="BUY"?"Buying":"Selling")+'</span>')+
   '<div class="bundle-direction" role="group" aria-label="买卖方向"><button type="button" data-direction="BUY" aria-pressed="'+(side==="BUY")+'">Bundle Buy</button><button type="button" data-direction="SELL" aria-pressed="'+(side==="SELL")+'">Bundle Sell</button></div>'+
   '<div class="smith-card-grid">'+tile("TX count",count)+tile(side==="BUY"?"Total buy amount":"Total sell amount","—")+'</div>'+
   '<div class="smith-stepper" role="group" aria-label="交易参数（待接入）"><button type="button" aria-label="减少交易参数" disabled>−</button><input aria-label="交易参数" type="text" value="5" disabled><button type="button" aria-label="增加交易参数" disabled>+</button></div>'+
   '<div class="smith-card-grid">'+tile("Estimated Interval","—")+tile("Estimated Time","—")+'</div>'+
   '<button class="smith-action smith-primary" type="button" disabled>'+ (side==="BUY"?"Buy":"Sell") +'</button></section>'+
   '<section class="smith-section smith-exit">'+heading("Dump It")+
   '<div class="smith-card-grid">'+tile("Tokens To Sell","—")+tile("SOL Amount to Receive","—")+'</div>'+
   tile("Play Profit","—","smith-profit")+
   '<p class="smith-session">Session on this token: <strong>—</strong></p>'+
   '<button class="smith-action smith-dump" type="button" disabled>Dump It</button></section>'+
   '<p class="smith-status" role="status">交易执行与实时数据待接入</p>'+
   '<section class="smith-section smith-log trade-log">'+heading("Trades Log",'<small>当前 Meme · 历史</small>')+
   '<div class="trade-filters" role="group" aria-label="成交记录筛选">'+["ALL","BUY","SELL"].map(k=>'<button type="button" data-trade-filter="'+k+'" aria-pressed="'+(filter===k)+'">'+({ALL:"全部",BUY:"买入",SELL:"卖出"}[k])+'</button>').join("")+'</div>'+
   (trades&&trades.length?table(["方向","记录","序号","金额"],trades.slice(-12).reverse().map(t=>[t.side,t.id,t.sequence,quoteAmount(t.quoteNotionalBaseUnits,"SOL_LAMPORTS")])):'<div class="trade-log-empty">暂无成交记录</div>')+
   (trades&&trades.length?'<p class="trade-hint">'+esc(trades.length)+' 笔 · 最近最多 12 笔</p>':"")+'</section>'+
   '<details class="smith-section trade-detail" data-position'+(positionOpen?" open":"")+'><summary>Position / 历史持仓与损益</summary>'+
   '<div class="trade-kv">'+kv("历史买入成本",fmt(position?.buy_cost))+kv("历史卖出净回收",fmt(position?.net_sell_proceeds))+row("期末 Token（base units）",position?.token_balance)+kv("剩余库存成本",fmt(position?.remaining_cost))+kv("已实现交易损益",fmt(position?.realized_pnl))+'</div><p class="trade-hint">'+esc(position?"历史区间，非实时资产":state)+'</p></details>'+
   '<details class="smith-section trade-detail" data-settings'+(settingsOpen?" open":"")+'><summary>Execution Settings / 执行设置</summary><div class="trade-kv">'+row("手续费支付方",null)+row("交易保护",null)+row("滑点配置",null)+'</div><p class="trade-hint">等待交易服务提供配置。</p></details></div>';
  host.querySelectorAll("[data-direction]").forEach(b=>b.onclick=()=>{side=b.dataset.direction;draw();});
  host.querySelectorAll("[data-trade-filter]").forEach(b=>b.onclick=()=>{filter=b.dataset.tradeFilter;draw();});
  host.querySelector("[data-position]").ontoggle=e=>{positionOpen=e.target.open;};
  host.querySelector("[data-settings]").ontoggle=e=>{settingsOpen=e.target.open;};
 }
 draw();
 return {
  setProject(next){const changed=project?.project_id!==next?.project_id||project?.revision!==next?.revision;if(changed){side="BUY";filter="ALL";input=null;state="等待当前 Meme 历史记录";}project=next;draw();},
  clear(message){input=null;filter="ALL";state=message;draw();},
  show(next){input=next;state="当前报告缺少可用的成交金额证据。";draw();}
 };
}
