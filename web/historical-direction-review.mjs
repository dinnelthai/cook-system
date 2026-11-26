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
 let side="BUY",filter="ALL",input=null,state="Select a Meme",settingsOpen=false,positionOpen=true,project=null;
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
  const direction=side==="BUY"?buy:sell;const count=direction?.count??"—";
  host.innerHTML='<div class="trade-ticket smith-trade" data-side="'+side+'">'+
   '<section class="smith-section smith-bundle">'+heading("Trade Overview",'<small>Historical · Reconciled</small>')+
   '<div class="bundle-direction" role="group" aria-label="Trade Direction"><button type="button" data-direction="BUY" aria-pressed="'+(side==="BUY")+'">Buys</button><button type="button" data-direction="SELL" aria-pressed="'+(side==="SELL")+'">Sells</button></div>'+
   '<div class="smith-card-grid">'+tile("Confirmed Records",count)+tile(side==="BUY"?"Buy Notional":"Sell Notional",direction?quoteAmount(direction.total_base_units,"SOL_LAMPORTS"):"—")+'</div>'+
   '<p class="trade-hint">'+esc(direction?"Reconciled historical trades; bundle membership unknown.":state)+'</p></section>'+
   '<section class="smith-section smith-exit">'+heading("Position Overview",'<small>Historical</small>')+
   '<div class="smith-card-grid">'+tile("Buy Cost",position?.buy_cost!=null?quoteAmount(position.buy_cost,"SOL_LAMPORTS"):"—")+tile("Net Recovered",position?.net_sell_proceeds!=null?quoteAmount(position.net_sell_proceeds,"SOL_LAMPORTS"):"—")+tile("Remaining Cost",position?.remaining_cost!=null?quoteAmount(position.remaining_cost,"SOL_LAMPORTS"):"—")+tile("Realized PnL",position?.realized_pnl!=null?quoteAmount(position.realized_pnl,"SOL_LAMPORTS"):"—")+'</div>'+
   '<p class="trade-hint">Historical interval only. Live valuation and unrealized PnL require verified market data.</p></section>'+
   '<section class="smith-section smith-log trade-log">'+heading("Trades Log",'<small>Current Meme · Historical</small>')+
   '<div class="trade-filters" role="group" aria-label="Trade History Filter">'+["ALL","BUY","SELL"].map(k=>'<button type="button" data-trade-filter="'+k+'" aria-pressed="'+(filter===k)+'">'+({ALL:"All",BUY:"Buy",SELL:"Sell"}[k])+'</button>').join("")+'</div>'+
   (trades&&trades.length?table(["Side","Record","Sequence","Amount"],trades.slice(-12).reverse().map(t=>[t.side,t.id,t.sequence,quoteAmount(t.quoteNotionalBaseUnits,"SOL_LAMPORTS")])):'<div class="trade-log-empty">No reconciled historical trades</div>')+
   (trades&&trades.length?'<p class="trade-hint">'+esc(trades.length)+' trades · Latest 12</p>':"")+'</section>'+
   '<details class="smith-section trade-detail" data-position'+(positionOpen?" open":"")+'><summary>Historical Position & PnL</summary>'+
   '<div class="trade-kv">'+kv("Historical Buy Cost",fmt(position?.buy_cost))+kv("Historical Net Sell Proceeds",fmt(position?.net_sell_proceeds))+row("Closing Tokens (base units)",position?.token_balance)+kv("Remaining Cost Basis",fmt(position?.remaining_cost))+kv("Realized PnL",fmt(position?.realized_pnl))+'</div><p class="trade-hint">'+esc(position?"Historical period, not live assets":state)+'</p></details>'+
   '<details class="smith-section trade-detail" data-settings'+(settingsOpen?" open":"")+'><summary>Execution Settings</summary><div class="trade-kv">'+row("Fee Payer",null)+row("Trade Protection",null)+row("Slippage",null)+'</div><p class="trade-hint">Execution settings unavailable.</p></details></div>';
  host.querySelectorAll("[data-direction]").forEach(b=>b.onclick=()=>{side=b.dataset.direction;draw();});
  host.querySelectorAll("[data-trade-filter]").forEach(b=>b.onclick=()=>{filter=b.dataset.tradeFilter;draw();});
  host.querySelector("[data-position]").ontoggle=e=>{positionOpen=e.target.open;};
  host.querySelector("[data-settings]").ontoggle=e=>{settingsOpen=e.target.open;};
 }
 draw();
 return {
  setProject(next){const changed=project?.project_id!==next?.project_id||project?.revision!==next?.revision;if(changed){side="BUY";filter="ALL";input=null;state="Awaiting historical records";}project=next;draw();},
  clear(message){input=null;filter="ALL";state=message;draw();},
  show(next){input=next;state="No verified trade amounts in this report.";draw();}
 };
}
