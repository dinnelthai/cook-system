// Execution controls remain disabled. Log contains retrospective, scoped receipt evidence only.
const key=v=>typeof v==="string"&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
const signature=v=>typeof v==="string"&&/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(v);
export function receiptTradeRows(history,mint=null,{currentOnly=true,field="time",direction="descending"}={}){
 if(!Array.isArray(history)||currentOnly&&!mint)return [];
 const entries=new Map(),conflicts=new Set();
 for(const w of history){
  if(!key(w?.address)||!Array.isArray(w.recent_transactions))continue;
  for(const tx of w.recent_transactions){
   if(tx?.status!=="CONFIRMED"||!signature(tx.signature)||!Array.isArray(tx.trades))continue;
   for(const row of tx.trades){
    if(!row||row.evidence!=="FINALIZED_RECEIPT_BALANCE_MATCH"||row.signature!==tx.signature||row.wallet!==w.address||!key(row.mint)||!key(row.pool)||!["BUY","SELL"].includes(row.side)||typeof row.quote_lamports!=="string"||!/^[1-9][0-9]{0,19}$/.test(row.quote_lamports)||BigInt(row.quote_lamports)>=2n**64n||!Number.isSafeInteger(row.block_time)||row.block_time<0||row.block_time>8640000000000||!Number.isSafeInteger(row.slot)||row.slot<0)continue;
    const item={signature:row.signature,wallet:row.wallet,mint:row.mint,pool:row.pool,side:row.side,quote_lamports:row.quote_lamports,block_time:row.block_time,slot:row.slot};
    const id=item.signature,old=entries.get(id);if(old&&JSON.stringify(old)!==JSON.stringify(item))conflicts.add(id);else entries.set(id,item);
   }
  }
 }
 const rows=[...entries.values()].filter(r=>!conflicts.has(r.signature)&&(!currentOnly||r.mint===mint));
 return rows.sort((a,b)=>{const x=field==="sol"?BigInt(a.quote_lamports):BigInt(a.block_time),y=field==="sol"?BigInt(b.quote_lamports):BigInt(b.block_time);return (direction==="ascending"?1:-1)*(x<y?-1:x>y?1:0)||a.signature.localeCompare(b.signature)});
}
function formatSol(value){const n=BigInt(value),fraction=(n%1000000000n).toString().padStart(9,"0").replace(/0+$/,"");return (n/1000000000n).toString()+(fraction?"."+fraction:"")}
const short=v=>v.slice(0,6)+"…"+v.slice(-5);
export function mountTradePanelPreview(host){
 host.innerHTML=`<section class="reference-trade-section reference-bundle">
 <div class="reference-trade-heading"><h3>多钱包买卖</h3><span class="reference-wallet-count" data-preview-count>0/0 个钱包买入</span></div>
 <div class="reference-direction" role="group" aria-label="预览交易方向"><button type="button" data-preview-side="BUY" aria-pressed="true">多钱包买入</button><button type="button" data-preview-side="SELL" aria-pressed="false">多钱包卖出</button></div>
 <div class="reference-card-grid"><div class="reference-stat"><span>交易笔数</span><strong>0</strong></div><div class="reference-stat"><span data-preview-total-label>买入总额</span><strong data-preview-total>0.0000 SOL</strong></div></div>
 <div class="reference-delay" aria-label="交易延迟（仅展示）"><button type="button" disabled aria-label="减少延迟">−</button><button type="button" disabled>交易延迟（区块）</button><button type="button" disabled aria-label="增加延迟">+</button></div>
 <div class="reference-card-grid"><div class="reference-stat"><span>预计间隔</span><strong>0.0 秒（交易间隔）</strong></div><div class="reference-stat"><span>预计耗时</span><strong>0.0 秒（总耗时）</strong></div></div>
 <button class="reference-action reference-buy" type="button" data-preview-action disabled>买入</button>
 </section>
 <section class="reference-trade-section reference-exit"><h3>退出持仓</h3><div class="reference-card-grid"><div class="reference-stat"><span>待卖出代币</span><strong>0</strong></div><div class="reference-stat"><span>预计收到 SOL</span><strong>0.0000 SOL</strong></div></div><div class="reference-stat"><span>本轮收益</span><strong class="reference-positive">+0.0000 SOL</strong></div><p class="reference-session">本代币会话收益：<span class="reference-positive">+0.0000 SOL</span></p><button type="button" class="reference-action reference-dump" disabled>退出持仓</button></section>
 <section class="reference-trade-section reference-log"><div class="reference-trade-heading"><h3>成交记录</h3><label class="reference-mint-filter">仅当前代币 <input type="checkbox" checked aria-label="仅当前代币"></label></div><table aria-label="成交记录预览"><thead><tr><th>钱包</th><th aria-sort="none"><button type="button" data-preview-sort>SOL <span aria-hidden="true">▴▾</span></button></th><th>代币地址</th><th aria-sort="none"><button type="button" data-preview-sort>时间 <span aria-hidden="true">▴▾</span></button></th></tr></thead><tbody><tr><td colspan="4">暂无成交。</td></tr></tbody></table></section>`;
 const q=s=>host.querySelector(s);
 let receiptHistory=null,currentMint=null,field="time",direction="descending";
 const filter=q(".reference-mint-filter input"),tbody=q(".reference-log tbody");
 function drawLog(){
  const rows=receiptTradeRows(receiptHistory,currentMint,{currentOnly:filter.checked,field,direction});
  const doc=host.ownerDocument;tbody.replaceChildren();
  for(const row of rows){
   const tr=doc.createElement("tr");
   for(const [label,detail] of [[short(row.wallet),row.wallet],[(row.side==="BUY"?"−":"+")+formatSol(row.quote_lamports),"最终确认的成交报价额，不含单独收取的网络费用"],[short(row.mint),row.mint],[new Date(row.block_time*1000).toISOString(),row.signature]]){
    const td=doc.createElement("td");td.textContent=label;td.title=detail;tr.append(td);
   }
   tbody.append(tr);
  }
  if(!rows.length){const tr=doc.createElement("tr"),td=doc.createElement("td");td.colSpan=4;td.textContent=filter.checked&&!currentMint?"请选择代币。":receiptHistory===null?"历史收据不可用。":"近期收据中暂无已核对且最终确认的成交。";tr.append(td);tbody.append(tr);}
 }
 filter.onchange=drawLog;
 host.querySelectorAll("[data-preview-side]").forEach(button=>button.onclick=()=>{
  const sell=button.dataset.previewSide==="SELL";
  host.querySelectorAll("[data-preview-side]").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));
  q("[data-preview-count]").textContent=sell?"0/0 个钱包卖出":"0/0 个钱包买入";
  q("[data-preview-total-label]").textContent=sell?"卖出总额":"买入总额";
  q("[data-preview-total]").textContent=sell?"0 代币":"0.0000 SOL";
  const action=q("[data-preview-action]");action.textContent=sell?"卖出":"买入";action.classList.toggle("reference-sell",sell);
 });
 host.querySelectorAll("[data-preview-sort]").forEach(button=>button.onclick=()=>{
  const th=button.closest("th"),next=th.getAttribute("aria-sort")==="ascending"?"descending":"ascending";
  host.querySelectorAll("th[aria-sort]").forEach(t=>t.setAttribute("aria-sort","none"));th.setAttribute("aria-sort",next);
  button.querySelector("span").textContent=next==="ascending"?"▴":"▾";field=button.textContent.startsWith("SOL")?"sol":"time";direction=next;drawLog();
 });
 drawLog();return {setReceiptHistory(history,mint){receiptHistory=history;currentMint=mint;drawLog();}};
}
