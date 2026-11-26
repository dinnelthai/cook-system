// Frontend-only review dialogs. No signing, allocation or execution services.
const actions={
 0:{title:"归集 SOL",relation:"N → 1",description:"查看所选钱包的 SOL 持仓。",source:"已选来源钱包",destination:"接收钱包",button:"查看转账"},
 1:{title:"迁移钱包",relation:"N → N",description:"查看来源与目标钱包地址。",source:"已选来源钱包",destination:"接收钱包",button:"查看迁移",multiple:true},
 3:{title:"拆分钱包",relation:"1 → N",description:"查看单个来源钱包持仓。",source:"来源钱包",destination:"目标钱包",button:"查看分配",single:true}
};
const safeRaw=x=>typeof x==="string"&&/^(0|[1-9][0-9]{0,38})$/.test(x);
function sol(x){
 if(!safeRaw(x))return "—";
 const n=BigInt(x),fraction=(n%1000000000n).toString().padStart(9,"0").replace(/0+$/,"");
 return (n/1000000000n).toString()+(fraction?"."+fraction:"")+" SOL";
}
export function walletReviewSummary(rows){
 const complete=rows.length>0&&rows.every(r=>safeRaw(r.sol));
 return {count:rows.length,sol:complete?rows.reduce((n,r)=>n+BigInt(r.sol),0n).toString():null,unverified:rows.filter(r=>r.status!=="Ready").length};
}
export function openWalletActionReview(anchor,{action,rows,availableWallets=[],esc}){
 const config=actions[Number(action)];
 if(!config)throw Error("UNKNOWN_WALLET_ACTION");
 const doc=anchor.ownerDocument,dialog=doc.createElement("dialog");
 dialog.className="wallet-action-review";
 dialog.setAttribute("aria-labelledby","wallet-action-title");
 const summary=walletReviewSummary(rows);
 const canDrag=[0,1].includes(Number(action));
 const rowHtml=rows.map(r=>'<tr'+(canDrag?' draggable="true" data-war-drag="'+esc(r.address)+'"':'')+'><td title="'+esc(r.address)+'">'+(canDrag?'<span class="war-grip" aria-hidden="true">⠿</span>':'')+''+esc(r.address.length>16?r.address.slice(0,6)+"…"+r.address.slice(-5):r.address)+'</td><td>'+esc(sol(r.sol))+'</td><td>'+esc(({Ready:"就绪",Loading:"加载中",Partial:"部分可用","RPC Error":"RPC 错误","Balance unverified":"余额未验证"})[r.status]??r.status)+'</td></tr>').join("");
 const sourceAddresses=new Set(rows.map(r=>r.address));
 const destination=canDrag?'<div class="war-dropzone" data-war-drop tabindex="0" aria-label="'+esc(config.destination)+' address preview"><span class="war-drop-icon" aria-hidden="true">↓</span><div class="war-destination-content"><span data-war-drop-label>将'+(config.multiple?'多个钱包':'一个钱包')+'拖到此处查看地址</span><div data-war-addresses></div></div></div>':'<div class="war-placeholder">'+(config.single&&rows.length!==1?'One source wallet required':'Destination not configured')+'</div>';
 const issue=rows.length===0?"请先在钱包列表中选择钱包。":config.single&&rows.length!==1?"拆分预览仅允许选择一个来源钱包。":summary.unverified>0?"部分钱包资产尚未验证，请检查 Localnet RPC。":"仅只读查看，不执行资产操作。";
 dialog.innerHTML='<header class="war-header"><div><h3 id="wallet-action-title">'+esc(config.title)+'</h3><p>'+esc(config.description)+'</p></div><button type="button" data-war-close class="war-close" aria-label="关闭">×</button></header>'+
 '<div class="war-metrics"><div><small>已选钱包</small><strong data-war-count>'+summary.count+'</strong></div><div><small>SOL 总额</small><strong data-war-total>'+esc(sol(summary.sol))+'</strong></div><div><small>操作</small><strong>'+esc(config.relation)+'</strong></div></div>'+
 '<section class="war-section"><h4>'+esc(config.source)+'</h4><div class="war-table"><table><thead><tr><th>钱包</th><th>SOL 余额</th><th>状态</th></tr></thead><tbody>'+(rowHtml||'<tr><td colspan="3">未选择钱包</td></tr>')+'</tbody></table></div></section>'+
 '<section class="war-section"><h4>'+esc(config.destination)+'</h4>'+destination+'</section>'+
 '<div class="war-message" role="status">'+esc(issue)+'</div><p class="war-preview">界面预览 · 不执行迁移、转账、拆分或删除。</p>'+
 '<footer class="war-footer"><button type="button" data-war-cancel>取消</button><button type="button" disabled class="war-primary">'+esc(config.button)+'</button></footer>';
 doc.body.append(dialog);
 if(canDrag){
  const zone=dialog.querySelector("[data-war-drop]"),label=dialog.querySelector("[data-war-drop-label]"),addresses=dialog.querySelector("[data-war-addresses]");
  const sourceRows=[...dialog.querySelectorAll("[data-war-drag]")];
  let dragging=null;
  const reviewed=new Set();
  const renderPreview=()=>{
   for(const row of sourceRows){
    row.hidden=reviewed.has(row.dataset.warDrag);
    row.classList.remove("war-dragging");
   }
   const remaining=rows.filter(r=>!reviewed.has(r.address));
   const current=walletReviewSummary(remaining);
   dialog.querySelector("[data-war-count]").textContent=String(current.count);
   dialog.querySelector("[data-war-total]").textContent=sol(current.sol);
   dialog.querySelector(".war-message").textContent=!remaining.length?"请至少选择一个来源钱包。":current.unverified?"部分钱包资产尚未验证，请检查 Localnet RPC。":"仅只读查看，不执行资产操作。";
   label.hidden=reviewed.size>0;
   zone.classList.toggle("has-address",reviewed.size>0);
   addresses.replaceChildren();
   for(const address of reviewed){
    const item=doc.createElement("div"),value=doc.createElement("span"),remove=doc.createElement("button");
    item.className="war-address-item";value.textContent=address;remove.type="button";remove.textContent="×";remove.setAttribute("aria-label","将钱包 "+address+" 返回来源列表");remove.setAttribute("data-war-clear","");
    remove.onclick=()=>{reviewed.delete(address);renderPreview();sourceRows.find(row=>row.dataset.warDrag===address)?.focus({preventScroll:true});};
    item.append(value,remove);addresses.append(item);
   }
  };
  const preview=address=>{if(!sourceAddresses.has(address)||reviewed.has(address))return;if(!config.multiple)reviewed.clear();reviewed.add(address);renderPreview();zone.focus({preventScroll:true});};
  sourceRows.forEach(row=>{
   row.addEventListener("dragstart",e=>{if(row.hidden)return;dragging=row.dataset.warDrag;e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",dragging);row.classList.add("war-dragging");});
   row.addEventListener("dragend",()=>{dragging=null;row.classList.remove("war-dragging");zone.classList.remove("is-over");});
   row.tabIndex=0;row.setAttribute("aria-label","查看钱包地址 "+row.dataset.warDrag);
   row.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();preview(row.dataset.warDrag);}});
  });
  zone.addEventListener("dragover",e=>{if(dragging&&sourceAddresses.has(dragging)){e.preventDefault();e.dataTransfer.dropEffect="move";zone.classList.add("is-over");}});
  zone.addEventListener("dragleave",()=>zone.classList.remove("is-over"));
  zone.addEventListener("drop",e=>{e.preventDefault();zone.classList.remove("is-over");if(dragging&&sourceAddresses.has(dragging))preview(dragging);dragging=null;});
 }

 dialog.querySelector("[data-war-close]").onclick=()=>dialog.close();
 dialog.querySelector("[data-war-cancel]").onclick=()=>dialog.close();
 dialog.addEventListener("close",()=>{dialog.remove();if(anchor.isConnected)anchor.focus({preventScroll:true})},{once:true});
 dialog.showModal();return dialog;
}
