// Isolated reference UI: no real wallet selection, allocation calculation or execution.
export function openAmountsPreview(anchor){
 const doc=anchor.ownerDocument,dialog=doc.createElement("dialog");
 dialog.className="reference-amounts-dialog";
 dialog.setAttribute("aria-label","设置金额 · 界面预览");
 let side="buy",distribution="same",share=null,percent="100",same="",min="",max="";
 const presets=[25,50,75,100];
 function render(){
 const sell=side==="sell";
 dialog.innerHTML=`<div class="amounts-preview-tabs" role="group" aria-label="金额类型"><button type="button" data-amount-tab="buy" aria-pressed="${!sell}">买入金额</button><button type="button" data-amount-tab="sell" aria-pressed="${sell}">卖出比例</button></div>
 <p class="amounts-preview-description">${sell?"卖出或退出时每个钱包所卖出的代币比例（当前 0 个钱包）。":"每个钱包买入所用的 SOL（当前 0 个钱包）。"}</p>
 ${sell?"":'<section><h4>分配方式</h4><div class="amounts-preview-two"><button type="button" data-distribution="same" aria-pressed="'+(distribution==="same")+'">统一金额</button><button type="button" data-distribution="range" aria-pressed="'+(distribution==="range")+'">随机区间</button></div></section>'}
 <section><h4>${sell?"卖出比例":"余额比例"}</h4><div class="amounts-preview-presets">${presets.map(n=>'<button type="button" data-share="'+n+'" aria-pressed="'+(sell?Number(percent)===n:share===n)+'">'+n+'%</button>').join("")}</div></section>
 ${sell?'<section><label for="preview-sell-percent">或输入百分比</label><input id="preview-sell-percent" type="number" min="0" max="100" step="1" value="'+(percent!==""&&Number.isFinite(Number(percent))?Number(percent):"")+'"></section>':distribution==="same"?'<section><label for="preview-same">每钱包 SOL</label><input id="preview-same" type="number" min="0" step="any" placeholder="0.05"></section>':'<section class="amounts-preview-two"><div><label for="preview-min">最小 SOL</label><input id="preview-min" type="number" min="0" step="any" placeholder="0.01"></div><div><label for="preview-max">最大 SOL</label><input id="preview-max" type="number" min="0" step="any" placeholder="0.10"></div></section>'}
 <button type="button" class="amounts-preview-submit" disabled data-amount-submit>${sell?"设置卖出 "+(percent===""?"—":Number(percent))+"%（0 个钱包）":"为 0 个钱包设置买入金额"}</button>
 <div class="amounts-preview-foot"><span>界面预览 · 未保存钱包设置</span><button type="button" data-amount-close>关闭</button></div>`;
 const q=s=>dialog.querySelector(s);
 const inputs=[["#preview-same",same,v=>same=v],["#preview-min",min,v=>min=v],["#preview-max",max,v=>max=v]];
 for(const [selector,value,update] of inputs){const el=q(selector);if(el){el.value=value;el.oninput=()=>update(el.value)}}
 dialog.querySelectorAll("[data-amount-tab]").forEach(b=>b.onclick=()=>{side=b.dataset.amountTab;render()});
 dialog.querySelectorAll("[data-distribution]").forEach(b=>b.onclick=()=>{distribution=b.dataset.distribution;render()});
 dialog.querySelectorAll("[data-share]").forEach(b=>b.onclick=()=>{if(sell)percent=b.dataset.share;else share=Number(b.dataset.share);render()});
 const input=q("#preview-sell-percent");if(input)input.oninput=()=>{percent=input.value;dialog.querySelectorAll("[data-share]").forEach(b=>b.setAttribute("aria-pressed",String(percent!==""&&Number(percent)===Number(b.dataset.share))));q("[data-amount-submit]").textContent="设置卖出 "+(percent===""?"—":percent)+"%（0 个钱包）"};
 q("[data-amount-close]").onclick=()=>dialog.close();
 }
 render();doc.body.append(dialog);
 dialog.addEventListener("close",()=>{dialog.remove();if(anchor.isConnected)anchor.focus({preventScroll:true})},{once:true});
 dialog.showModal();return dialog;
}
