// Isolated reference UI: no real wallet selection, allocation calculation or execution.
export function openAmountsPreview(anchor){
 const doc=anchor.ownerDocument,dialog=doc.createElement("dialog");
 dialog.className="reference-amounts-dialog";
 dialog.setAttribute("aria-label","Set amounts · UI preview");
 let side="buy",distribution="same",share=null,percent="100",same="",min="",max="";
 const presets=[25,50,75,100];
 function render(){
 const sell=side==="sell";
 dialog.innerHTML=`<div class="amounts-preview-tabs" role="group" aria-label="Amount type"><button type="button" data-amount-tab="buy" aria-pressed="${!sell}">Buy amount</button><button type="button" data-amount-tab="sell" aria-pressed="${sell}">Sell percentage</button></div>
 <p class="amounts-preview-description">${sell?"The share of its tokens each of the 0 wallets sells with Sell or Dump It.":"How much SOL each of the 0 wallets spends on its buy."}</p>
 ${sell?"":'<section><h4>DISTRIBUTION</h4><div class="amounts-preview-two"><button type="button" data-distribution="same" aria-pressed="'+(distribution==="same")+'">Same for all</button><button type="button" data-distribution="range" aria-pressed="'+(distribution==="range")+'">Random range</button></div></section>'}
 <section><h4>${sell?"SHARE TO SELL":"SHARE OF EACH BALANCE"}</h4><div class="amounts-preview-presets">${presets.map(n=>'<button type="button" data-share="'+n+'" aria-pressed="'+(sell?Number(percent)===n:share===n)+'">'+n+'%</button>').join("")}</div></section>
 ${sell?'<section><label for="preview-sell-percent">OR TYPE A PERCENT</label><input id="preview-sell-percent" type="number" min="0" max="100" step="1" value="'+(percent!==""&&Number.isFinite(Number(percent))?Number(percent):"")+'"></section>':distribution==="same"?'<section><label for="preview-same">SOL PER WALLET</label><input id="preview-same" type="number" min="0" step="any" placeholder="0.05"></section>':'<section class="amounts-preview-two"><div><label for="preview-min">MIN SOL</label><input id="preview-min" type="number" min="0" step="any" placeholder="0.01"></div><div><label for="preview-max">MAX SOL</label><input id="preview-max" type="number" min="0" step="any" placeholder="0.10"></div></section>'}
 <button type="button" class="amounts-preview-submit" disabled data-amount-submit>${sell?"Set sell "+(percent===""?"—":Number(percent))+"% for 0 wallets":"Set buy amount for 0 wallets"}</button>
 <div class="amounts-preview-foot"><span>UI preview · No wallet settings saved</span><button type="button" data-amount-close>Close</button></div>`;
 const q=s=>dialog.querySelector(s);
 const inputs=[["#preview-same",same,v=>same=v],["#preview-min",min,v=>min=v],["#preview-max",max,v=>max=v]];
 for(const [selector,value,update] of inputs){const el=q(selector);if(el){el.value=value;el.oninput=()=>update(el.value)}}
 dialog.querySelectorAll("[data-amount-tab]").forEach(b=>b.onclick=()=>{side=b.dataset.amountTab;render()});
 dialog.querySelectorAll("[data-distribution]").forEach(b=>b.onclick=()=>{distribution=b.dataset.distribution;render()});
 dialog.querySelectorAll("[data-share]").forEach(b=>b.onclick=()=>{if(sell)percent=b.dataset.share;else share=Number(b.dataset.share);render()});
 const input=q("#preview-sell-percent");if(input)input.oninput=()=>{percent=input.value;dialog.querySelectorAll("[data-share]").forEach(b=>b.setAttribute("aria-pressed",String(percent!==""&&Number(percent)===Number(b.dataset.share))));q("[data-amount-submit]").textContent="Set sell "+(percent===""?"—":percent)+"% for 0 wallets"};
 q("[data-amount-close]").onclick=()=>dialog.close();
 }
 render();doc.body.append(dialog);
 dialog.addEventListener("close",()=>{dialog.remove();if(anchor.isConnected)anchor.focus({preventScroll:true})},{once:true});
 dialog.showModal();return dialog;
}
