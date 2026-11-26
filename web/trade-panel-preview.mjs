// Screenshot-only UI preview. No wallet data, order creation, timing model or network calls.
export function mountTradePanelPreview(host){
 host.innerHTML=`<section class="reference-trade-section reference-bundle">
 <div class="reference-trade-heading"><h3>Bundle Buy / Sell</h3><span class="reference-wallet-count" data-preview-count>0/0 Wallets Buying</span></div>
 <div class="reference-direction" role="group" aria-label="Preview trade direction"><button type="button" data-preview-side="BUY" aria-pressed="true">Bundle Buy</button><button type="button" data-preview-side="SELL" aria-pressed="false">Bundle Sell</button></div>
 <div class="reference-card-grid"><div class="reference-stat"><span>TX count</span><strong>0</strong></div><div class="reference-stat"><span data-preview-total-label>Total buy amount</span><strong data-preview-total>0.0000 SOL</strong></div></div>
 <div class="reference-delay" aria-label="Transaction delay (display only)"><button type="button" disabled aria-label="Decrease delay">−</button><button type="button" disabled>TX Delay (Blocks)</button><button type="button" disabled aria-label="Increase delay">+</button></div>
 <div class="reference-card-grid"><div class="reference-stat"><span>Estimated Interval</span><strong>0.0s (between txs)</strong></div><div class="reference-stat"><span>Estimated Time</span><strong>0.0s (total)</strong></div></div>
 <button class="reference-action reference-buy" type="button" data-preview-action disabled>Buy</button>
 </section>
 <section class="reference-trade-section reference-exit"><h3>Dump It</h3><div class="reference-card-grid"><div class="reference-stat"><span>Tokens To Sell</span><strong>0</strong></div><div class="reference-stat"><span>SOL Amount to Receive</span><strong>0.0000 SOL</strong></div></div><div class="reference-stat"><span>Play Profit</span><strong class="reference-positive">+0.0000 SOL</strong></div><p class="reference-session">Session on this token: <span class="reference-positive">+0.0000 SOL</span></p><button type="button" class="reference-action reference-dump" disabled>Dump It</button></section>
 <section class="reference-trade-section reference-log"><div class="reference-trade-heading"><h3>Trades Log</h3><label class="reference-mint-filter">Current Mint Only <input type="checkbox" checked aria-label="Current Mint Only"></label></div><table aria-label="Preview trades log"><thead><tr><th>Wallet</th><th aria-sort="none"><button type="button" data-preview-sort>SOL <span aria-hidden="true">▴▾</span></button></th><th>Mint</th><th aria-sort="none"><button type="button" data-preview-sort>Time <span aria-hidden="true">▴▾</span></button></th></tr></thead><tbody><tr><td colspan="4">No trades yet.</td></tr></tbody></table></section>`;
 const q=s=>host.querySelector(s);
 host.querySelectorAll("[data-preview-side]").forEach(button=>button.onclick=()=>{
  const sell=button.dataset.previewSide==="SELL";
  host.querySelectorAll("[data-preview-side]").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));
  q("[data-preview-count]").textContent=sell?"0/0 Wallets Selling":"0/0 Wallets Buying";
  q("[data-preview-total-label]").textContent=sell?"Total sell amount":"Total buy amount";
  q("[data-preview-total]").textContent=sell?"0 Tokens":"0.0000 SOL";
  const action=q("[data-preview-action]");action.textContent=sell?"Sell":"Buy";action.classList.toggle("reference-sell",sell);
 });
 host.querySelectorAll("[data-preview-sort]").forEach(button=>button.onclick=()=>{
  const th=button.closest("th"),next=th.getAttribute("aria-sort")==="ascending"?"descending":"ascending";
  host.querySelectorAll("th[aria-sort]").forEach(t=>t.setAttribute("aria-sort","none"));th.setAttribute("aria-sort",next);
  button.querySelector("span").textContent=next==="ascending"?"▴":"▾";
 });
}
