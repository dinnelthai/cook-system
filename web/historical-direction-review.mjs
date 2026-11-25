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
export function mountHistoricalDirectionReview(host,{esc,table,quoteAmount}){
 let side="BUY",input=null,state="请选择 Meme，并关联已核对的历史报告。";
 function draw(){
  const summary=historicalDirectionSummary(input,side);
  host.innerHTML='<section class="meme-control-section bundle-review"><div class="meme-rail-head"><h3>Bundle Buy / Sell</h3><span class="bundle-mode-label">只读 · 未接入</span></div>'+
   '<div class="bundle-direction" role="group" aria-label="历史成交方向"><button data-direction="BUY" aria-pressed="'+(side==="BUY")+'">Bundle Buy</button><button data-direction="SELL" aria-pressed="'+(side==="SELL")+'">Bundle Sell</button></div>'+
   '<p class="muted">历史成交统计，非 Bundle 执行记录。</p>'+
   '<div class="bundle-metrics"><div><small>已对账成交笔数</small><strong>'+(summary?esc(summary.count):"—")+'</strong></div><div><small>历史名义成交额</small><strong>'+(summary?esc(quoteAmount(summary.total_base_units,"SOL_LAMPORTS")):"—")+'</strong></div></div>'+
   '<button class="bundle-submit" type="button" disabled>'+ (side==="BUY"?"Buy":"Sell") +' · 执行未接入</button>'+
   '<p role="status" class="muted">'+esc(summary?"已关联历史区间 · 非实时 · 未独立认证":state)+'</p></section>'+
   '<section class="meme-control-section trade-log"><div class="meme-rail-head"><h3>Trades Log / 成交记录</h3><small>仅当前 Meme</small></div>'+
   (historicalDirectionSummary(input,"BUY")&&historicalDirectionSummary(input,"SELL")?table(["方向","记录","序号","名义金额"],input.market.trades.filter(t=>["BUY","SELL"].includes(t.side)&&t.status==="FINALIZED"&&t.reconciliation==="PASS").slice(-12).reverse().map(t=>[t.side,t.id,t.sequence,quoteAmount(t.quoteNotionalBaseUnits,"SOL_LAMPORTS")])):'<div class="trade-log-empty">暂无已核对成交记录</div>')+'</section>';

  host.querySelectorAll("[data-direction]").forEach(b=>b.onclick=()=>{side=b.dataset.direction;draw();});
 }
 draw();
 return {clear(message){input=null;state=message;draw();},show(next){input=next;state="当前报告缺少可用的成交金额证据。";draw();}};
}
