// Frontend-only review dialogs. No signing, allocation or execution services.
const actions=[
 {title:"Drain SOL",relation:"N → 1",description:"Review the SOL holdings of the selected wallets.",source:"Selected source wallets",destination:"Receiving wallet",button:"Review Transfer"},
 {title:"Migrate to New",relation:"N → N",description:"Review the assets of wallets intended for replacement.",source:"Selected source wallets",destination:"Replacement wallets",button:"Review Migration"},
 {title:"Migrate to Imported",relation:"N → N",description:"Review wallet assets before any migration.",source:"Selected source wallets",destination:"Imported wallets",button:"Review Migration"},
 {title:"Split",relation:"1 → N",description:"Review the holdings of a single source wallet.",source:"Source wallet",destination:"Destination wallets",button:"Review Allocation",single:true},
 {title:"Delete Wallets",relation:"N → 0",description:"Review removal of selected wallets from the workspace.",source:"Wallets to remove",button:"Remove Wallets",remove:true}
];
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
export function openWalletActionReview(anchor,{action,rows,esc}){
 const config=actions[Number(action)];
 if(!config)throw Error("UNKNOWN_WALLET_ACTION");
 const doc=anchor.ownerDocument,dialog=doc.createElement("dialog");
 dialog.className="wallet-action-review";
 dialog.setAttribute("aria-labelledby","wallet-action-title");
 const summary=walletReviewSummary(rows);
 const rowHtml=rows.map(r=>'<tr><td title="'+esc(r.address)+'">'+esc(r.address.length>16?r.address.slice(0,6)+"…"+r.address.slice(-5):r.address)+'</td><td>'+esc(sol(r.sol))+'</td><td>'+esc(r.status)+'</td></tr>').join("");
 const issue=rows.length===0?"Select wallets in the Wallets table first.":config.single&&rows.length!==1?"Select exactly one source wallet to review Split.":summary.unverified>0?"Some wallet assets are not verified. Check Localnet RPC.":"Read-only review. No asset operation will be performed.";
 dialog.innerHTML='<header class="war-header"><div><h3 id="wallet-action-title">'+esc(config.title)+'</h3><p>'+esc(config.description)+'</p></div><button type="button" data-war-close class="war-close" aria-label="Close">×</button></header>'+
 '<div class="war-metrics"><div><small>SELECTED WALLETS</small><strong>'+summary.count+'</strong></div><div><small>TOTAL SOL</small><strong>'+esc(sol(summary.sol))+'</strong></div><div><small>OPERATION</small><strong>'+esc(config.relation)+'</strong></div></div>'+
 '<section class="war-section"><h4>'+esc(config.source)+'</h4><div class="war-table"><table><thead><tr><th>Wallet</th><th>SOL Balance</th><th>Status</th></tr></thead><tbody>'+(rowHtml||'<tr><td colspan="3">No wallets selected</td></tr>')+'</tbody></table></div></section>'+
 (config.destination?'<section class="war-section"><h4>'+esc(config.destination)+'</h4><div class="war-placeholder">'+(config.single&&rows.length!==1?'One source wallet required':'Destination not configured')+'</div></section>':'<section class="war-section"><h4>Removal policy</h4><div class="war-placeholder">Remove workspace records only. Signing keys remain retained. Balance and backup checks required.</div></section>')+
 '<div class="war-message" role="status">'+esc(issue)+'</div><p class="war-preview">UI preview · No wallet migration, transfer, split or deletion will be performed.</p>'+
 '<footer class="war-footer"><button type="button" data-war-cancel>Cancel</button><button type="button" disabled class="war-primary'+(config.remove?' war-danger':'')+'">'+esc(config.button)+'</button></footer>';
 doc.body.append(dialog);
 dialog.querySelector("[data-war-close]").onclick=()=>dialog.close();
 dialog.querySelector("[data-war-cancel]").onclick=()=>dialog.close();
 dialog.addEventListener("close",()=>{dialog.remove();if(anchor.isConnected)anchor.focus({preventScroll:true})},{once:true});
 dialog.showModal();return dialog;
}
