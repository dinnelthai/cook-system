import {openAmountsPreview} from "./amounts-preview.mjs";
import {createWalletAdapter,WALLET_MODE} from "./wallet-adapter.mjs";
const raw=v=>typeof v==="string"&&/^(0|[1-9][0-9]{0,38})$/.test(v);
export function formatUnits(v,d){
 if(!raw(v)||!Number.isInteger(d)||d<0||d>18)return "—";
 const n=BigInt(v),scale=10n**BigInt(d),fraction=d?(n%scale).toString().padStart(d,"0").replace(/0+$/,""):"";
 return (n/scale).toString()+(fraction?"."+fraction:"");
}
export function positionRows(project,snapshot){
 const addresses=[...new Set((project?.wallet_groups??[]).flatMap(g=>g.members.map(m=>m.wallet_address)))];
 const mint=project?.token?.mint;
 const valid=!!mint&&project?.network?.cluster==="localnet"&&!!project.network.genesis_hash&&
 snapshot?.schema_version==="cook-local-wallet-portfolio.1"&&snapshot.network==="localnet"&&snapshot.genesis_hash===project.network.genesis_hash&&snapshot.read_only===true&&snapshot.execution_enabled===false&&Array.isArray(snapshot.wallets);
 const conflicts=valid&&snapshot.token_account_scope_conflict;
 return addresses.map(address=>{
  const matches=valid?snapshot.wallets.filter(w=>w.address===address):[];
  const w=matches.length===1?matches[0]:null;
  const accounts=Array.isArray(w?.token_accounts)?w.token_accounts.filter(a=>a&&a.mint===mint):[];
  const decimals=accounts[0]?.decimals??null;
  const known=!!w&&!conflicts&&w.token_accounts_status==="AVAILABLE"&&Array.isArray(w.token_accounts)&&w.token_accounts.every(a=>a&&typeof a.mint==="string"&&a.mint)&&accounts.every(a=>typeof a.token_account==="string"&&a.token_account&&raw(a.amount_base_units)&&Number.isInteger(a.decimals)&&a.decimals>=0&&a.decimals<=18&&a.decimals===decimals)&&new Set(accounts.map(a=>a.token_account)).size===accounts.length;
  return {address,sol:w?.balance_status==="AVAILABLE"&&raw(w.balance_lamports)?w.balance_lamports:null,tokens:known?accounts.reduce((n,a)=>n+BigInt(a.amount_base_units),0n).toString():null,decimals:known?decimals:null,status:!valid?"Unverified":!w?"Not managed":known&&w.balance_status==="AVAILABLE"&&raw(w.balance_lamports)?"Observed":"Partial"};
 });
}
export function previewQuantity(rawBalance,percent){
 if(!raw(rawBalance)||!Number.isInteger(percent)||percent<0||percent>100)return null;
 const n=BigInt(rawBalance),quantity=n*BigInt(percent)/100n;
 return {quantity:quantity.toString(),remaining:(n-quantity).toString()};
}
const displayToken=(value,decimals)=>value==="0"?"0":formatUnits(value,decimals);
// Read-only aggregation: incomplete or inconsistent observations remain unknown.
export function summarizePositions(rows){
 const count=rows.length,known=rows.filter(r=>raw(r.tokens)),positive=known.filter(r=>r.tokens!=="0"),decimals=positive[0]?.decimals??0;
 const complete=count>0&&known.length===count&&positive.every(r=>raw(r.tokens)&&r.decimals===decimals)&&known.every(r=>raw(r.tokens));
 const solComplete=count>0&&rows.every(r=>raw(r.sol));
 return {wallet_count:count,observed_count:known.length,
  token_balance:complete?known.reduce((s,r)=>s+BigInt(r.tokens),0n).toString():null,
  token_decimals:complete?decimals:null,
  sol_balance:solComplete?rows.reduce((s,r)=>s+BigInt(r.sol),0n).toString():null};
}
export function sortPositionRows(rows,field,direction="asc"){
 if(!["address","sol","tokens","status"].includes(field))return [...rows];
 const sign=direction==="desc"?-1:1;
 return [...rows].sort((a,b)=>{
  const x=a[field],y=b[field];
  if(x==null||y==null)return x==null?(y==null?0:1):-1;
  if(field==="sol"||field==="tokens"){
   const xd=field==="sol"?9:a.decimals??0,yd=field==="sol"?9:b.decimals??0;
   const left=BigInt(x)*10n**BigInt(yd),right=BigInt(y)*10n**BigInt(xd);
   return sign*(left<right?-1:left>right?1:0);
  }
  return sign*String(x).localeCompare(String(y));
 });
}
export function validWalletPreviewCount(value){return typeof value==="string"&&/^[1-9][0-9]{0,2}$/.test(value)&&Number(value)<=100;}
export function mountPositionSnapshot(host,{esc,onManage,onAssets,currentOnly=false,onSummary=()=>{},adapter=createWalletAdapter({mode:WALLET_MODE.LOCALNET})}){
 let project=null,rows=[],ticket=0,status="Select a Meme.",percent=25,selected=null;
 let checked=new Set(),query="",sortField="address",sortDirection="asc",busy=false,lastObserved=null;
 let timer=null,disposed=false,generateDialog=null,amountsDialog=null;
 const visibleRows=()=>sortPositionRows(rows.filter(r=>!query||r.address.toLowerCase().includes(query.toLowerCase())),sortField,sortDirection);
 function schedule(){
  clearTimeout(timer);
  if(disposed||!project?.token?.mint||!project?.network?.genesis_hash)return;
  timer=setTimeout(()=>{
   if(!host.isConnected){dispose();return}
   if(host.ownerDocument.visibilityState!=="hidden"&&!busy&&!host.hidden&&!host.contains(host.ownerDocument.activeElement))void refresh();
   else schedule();
  },20000);
 }
 function onFocus(){if(!host.isConnected){dispose();return}if(!busy&&project?.token?.mint&&!host.contains(host.ownerDocument.activeElement))void refresh();}
 function dispose(){if(disposed)return;disposed=true;generateDialog?.remove();generateDialog=null;amountsDialog?.remove();amountsDialog=null;ticket++;clearTimeout(timer);globalThis.removeEventListener?.("focus",onFocus);observer?.disconnect();}
 let mounted=host.isConnected;
 const observer=typeof MutationObserver==="function"?new MutationObserver(()=>{if(!host.isConnected&&mounted)dispose();else if(host.isConnected)mounted=true}):null;
 if(host.ownerDocument?.documentElement)observer?.observe(host.ownerDocument.documentElement,{childList:true,subtree:true});
 globalThis.addEventListener?.("focus",onFocus);
 function openGenerate(){
  if(disposed||generateDialog)return;
  const doc=host.ownerDocument,dialog=doc.createElement("dialog");
  generateDialog=dialog;dialog.className="reference-generate-dialog";dialog.setAttribute("aria-labelledby","generate-wallet-title");
  dialog.innerHTML='<button type="button" data-generate-close class="generate-close" aria-label="Close">×</button><h3 id="generate-wallet-title">Add Wallets</h3><p class="generate-description">This action will create several wallets at the same time.</p><form data-generate-form><label for="generate-wallet-count">Number of wallets to create</label><input id="generate-wallet-count" type="number" min="1" max="100" step="1" value="1" required autofocus><button type="submit" class="generate-submit">Add Wallets</button><p class="generate-feedback" role="status">Frontend preview only · No wallets will be created.</p></form>';
  doc.body.append(dialog);
  const input=dialog.querySelector("#generate-wallet-count"),submit=dialog.querySelector(".generate-submit"),feedback=dialog.querySelector(".generate-feedback");
  dialog.querySelector("[data-generate-close]").onclick=()=>dialog.close();
  dialog.addEventListener("close",()=>{dialog.remove();if(generateDialog===dialog)generateDialog=null;host.querySelector("#position-manage")?.focus({preventScroll:true})},{once:true});
  input.oninput=()=>{submit.disabled=!validWalletPreviewCount(input.value);feedback.textContent="Frontend preview only · No wallets will be created."};
  dialog.querySelector("form").onsubmit=e=>{e.preventDefault();if(!validWalletPreviewCount(input.value))return;feedback.textContent="Preview: "+input.value+" wallet(s) requested. No wallets created.";};
  dialog.showModal();
 }
 function draw(){
  const active=rows.find(r=>r.address===selected);
  const estimate=active?previewQuantity(active.tokens,percent):null;
  const all=summarizePositions(rows),visible=visibleRows(),chosen=summarizePositions(rows.filter(r=>checked.has(r.address)));
  const total=displayToken(all.token_balance,all.token_decimals);
  onSummary({project_id:project?.project_id??null,mint:project?.token?.mint??null,sol:formatUnits(all.sol_balance,9),tokens:total,observed:all.observed_count,count:all.wallet_count,status,rows:rows.map(r=>({...r})),active:selected,busy});
  const header=(label,key)=>'<button type="button" class="position-sort" data-position-sort="'+key+'" aria-label="Sort by '+label+'">'+label+(sortField===key?(sortDirection==="asc"?" ↑":" ↓"):"")+'</button>';
  const button=(id,label)=>'<button type="button" id="'+id+'">'+label+'</button>';
  host.classList.toggle("reference-wallet-table",currentOnly);host.innerHTML='<div class="desk-wallet-toolbar"><div><h3>Wallets</h3><small class="muted">'+rows.length+' registered wallets · '+checked.size+' selected</small></div><div class="desk-wallet-actions">'+(currentOnly?'<button type="button" id="position-manage"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 4v16M4 12h16"/></svg>Generate</button><button type="button" id="position-amounts" class="reference-set-amounts"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h3c4 0 6 12 10 12h5m-4-4 4 4-4 4M3 18h3c1.5 0 3-2 4-4m4-6c1-1 2-2 3-2h4m-4-4 4 4-4 4"/></svg>Set amounts</button><details class="reference-wallet-more"><summary aria-label="More wallet actions" title="More wallet actions"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></summary><div class="reference-wallet-menu"><button type="button" data-reference-wallet-action="0"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM5 10l3 1 4 2 4-2 3-1 3 4-2 4-3-1-1 4H8l-1-4-3 1-2-4z"/></svg><span>Drain SOL</span></button><button type="button" data-reference-wallet-action="1"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h16l-4-4m4 4-4 4M21 17H5l4-4m-4 4 4 4"/></svg><span>Migrate → To New</span></button><button type="button" data-reference-wallet-action="2"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h16l-4-4m4 4-4 4M21 17H5l4-4m-4 4 4 4"/></svg><span>Migrate → To Imported</span></button><button type="button" data-reference-wallet-action="3"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h5c5 0 5-7 10-7h3m-4-4 4 4-4 4M8 12c5 0 5 7 10 7h3m-4-4 4 4-4 4"/></svg><span>Split</span></button><button type="button" data-reference-wallet-action="4" class="reference-wallet-delete"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg><span>Delete</span></button></div></details><details class="reference-wallet-more reference-keys-more"><summary id="position-private-keys">Private keys<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M15 2a7 7 0 0 0-6.7 9L2 17.3V22h4.7l2-2v-2h2l2.3-2.3A7 7 0 1 0 15 2zm2 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg></summary><div class="reference-wallet-menu reference-keys-menu"><button type="button" disabled data-key-preview="selected"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M15 2a7 7 0 0 0-6.7 9L2 17.3V22h4.7l2-2v-2h2l2.3-2.3A7 7 0 1 0 15 2zm2 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg><span>Export Selected Keys</span></button><button type="button" data-key-preview="removed"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M15 2a7 7 0 0 0-6.7 9L2 17.3V22h4.7l2-2v-2h2l2.3-2.3A7 7 0 1 0 15 2zm2 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg><span>Export Removed Keys</span></button><button type="button" data-key-preview="import"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/></svg><span>Import PKs</span></button></div></details>':button("position-refresh",busy?"Refreshing…":"Refresh Holdings")+button("position-manage","Manage Wallets")+button("position-assets","Assets"))+'</div></div>'+
   '<div class="cook-position-grid"><div><small>Total Token Holdings</small><strong>'+esc(total)+'</strong></div><div><small>Total SOL Balance</small><strong>'+esc(formatUnits(all.sol_balance,9))+'</strong></div><div><small>Observed Wallets</small><strong>'+all.observed_count+' / '+rows.length+'</strong></div></div>'+
   '<p class="desk-wallet-foot" role="status">'+esc(status)+'</p>'+
   (currentOnly?'':'<div class="row position-filter"><label>Search Wallets <input type="search" data-position-search placeholder="Wallet address" value="'+esc(query)+'"></label><button type="button" data-position-clear>Clear Selection</button></div>')+
   '<div class="cook-position-grid"><div><small>Selected Token Holdings</small><strong>'+esc(displayToken(chosen.token_balance,chosen.token_decimals))+'</strong></div><div><small>Selected SOL Balance</small><strong>'+esc(formatUnits(chosen.sol_balance,9))+'</strong></div></div>'+
   '<div class="scroll"><table><thead><tr><th><input type="checkbox" data-position-all aria-label="Select all visible wallets" '+(visible.length&&visible.every(r=>checked.has(r.address))?"checked":"")+'></th><th>'+header("Wallet","address")+'</th><th>'+header("SOL Balance","sol")+'</th><th>'+header("Tokens","tokens")+'</th>'+(currentOnly?'<th>% of Supply</th><th>Profit</th>':'<th>Cost</th><th>Unrealized PnL</th><th>Realized PnL</th>')+'<th>'+header("Status","status")+'</th></tr></thead><tbody>'+
   visible.map(r=>'<tr><td><input type="checkbox" data-position-check="'+esc(r.address)+'" aria-label="Select wallet '+esc(r.address)+'" '+(checked.has(r.address)?"checked":"")+'></td><td><button type="button" data-position-wallet="'+esc(r.address)+'" aria-pressed="'+(selected===r.address)+'" title="'+esc(r.address)+'">'+esc(r.address.length>15?r.address.slice(0,6)+"…"+r.address.slice(-5):r.address)+'</button></td><td>'+esc(formatUnits(r.sol,9))+'</td><td>'+esc(displayToken(r.tokens,r.decimals))+'</td>'+(currentOnly?'<td>—</td><td>—</td>':'<td>—</td><td>—</td><td>—</td>')+'<td>'+esc(r.status)+'</td></tr>').join("")+
   (!visible.length?'<tr><td colspan="'+(currentOnly?7:8)+'" class="muted">'+(currentOnly&&!rows.length?'<div class="reference-wallet-empty"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 6a3 3 0 0 1 3-3h14v2H6a1 1 0 0 0 0 2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a3 3 0 0 1-3-3zm15 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg><strong>No wallets found yet</strong><span>Create your first wallet to get started.</span><button type="button" data-reference-new-wallet>＋ New Wallet</button></div>':rows.length?"No matching wallets":"No registered wallets")+'</td></tr>':"")+'</tbody></table></div>'+
   (currentOnly?'':'<section class="smith-section"><h3>Sell Quantity Preview</h3><p class="muted">Select a wallet to calculate a percentage of its observed token balance. Read-only; no order or quote is created.</p><div class="row">'+[10,25,50,75,100].map(p=>'<button type="button" data-position-percent="'+p+'" aria-pressed="'+(p===percent)+'">'+p+'%</button>').join("")+'</div>'+
   '<label>Custom percentage <input data-position-custom type="number" min="0" max="100" step="1" value="'+percent+'"></label>'+
   '<div class="trade-kv"><span>Selected Wallet</span><strong>'+esc(active?.address??"—")+'</strong><span>Tokens to Sell</span><strong>'+esc(estimate?displayToken(estimate.quantity,active.decimals):"—")+'</strong><span>Remaining Tokens</span><strong>'+esc(estimate?displayToken(estimate.remaining,active.decimals):"—")+'</strong><span>Estimated SOL Received</span><strong>Quote required</strong></div></section>');
  const refreshButton=host.querySelector("#position-refresh");if(refreshButton)refreshButton.disabled=busy||!project?.token?.mint;
  const allCheck=host.querySelector("[data-position-all]");
  allCheck.disabled=!visible.length;allCheck.indeterminate=visible.some(r=>checked.has(r.address))&&!visible.every(r=>checked.has(r.address));
  allCheck.onchange=()=>{for(const r of visible)allCheck.checked?checked.add(r.address):checked.delete(r.address);draw()};
  host.querySelectorAll("[data-position-check]").forEach(b=>b.onchange=()=>{b.checked?checked.add(b.dataset.positionCheck):checked.delete(b.dataset.positionCheck);draw()});
  const clear=host.querySelector("[data-position-clear]");if(clear)clear.onclick=()=>{checked.clear();draw()};
  const search=host.querySelector("[data-position-search]");if(search)search.oninput=e=>{query=e.target.value;draw();const input=host.querySelector("[data-position-search]");input.focus();try{input.setSelectionRange(query.length,query.length)}catch{}};
  host.querySelectorAll("[data-position-sort]").forEach(b=>b.onclick=()=>{const key=b.dataset.positionSort;sortDirection=sortField===key&&sortDirection==="asc"?"desc":"asc";sortField=key;draw()});
  if(refreshButton)refreshButton.onclick=refresh;
  host.querySelector("#position-manage").onclick=currentOnly?openGenerate:onManage;const newWallet=host.querySelector("[data-reference-new-wallet]");if(newWallet)newWallet.onclick=openGenerate;
  const assetsButton=host.querySelector("#position-assets");if(assetsButton)assetsButton.onclick=onAssets;
  const previewNotice=(title,message)=>{const doc=host.ownerDocument,dialog=doc.createElement("dialog");dialog.className="reference-wallet-dialog";dialog.innerHTML="<h3>"+esc(title)+"</h3><p>"+esc(message)+"</p><form method=\"dialog\"><button>Close</button></form>";host.append(dialog);dialog.addEventListener("close",()=>dialog.remove(),{once:true});dialog.showModal()};
  const amounts=host.querySelector("#position-amounts");if(amounts)amounts.onclick=()=>{if(amountsDialog?.isConnected)return;amountsDialog=openAmountsPreview(amounts);};
  host.querySelectorAll("[data-reference-wallet-action]").forEach(button=>button.onclick=()=>{button.closest("details").open=false;previewNotice(button.textContent.trim(),"UI preview only. No wallet migration, transfer, split or deletion will be performed.");});
  const menus=host.querySelectorAll(".reference-wallet-more");menus.forEach(menu=>menu.addEventListener("toggle",()=>{if(menu.open)menus.forEach(other=>{if(other!==menu)other.open=false})}));
  host.querySelectorAll("[data-key-preview]:not(:disabled)").forEach(button=>button.onclick=()=>{button.closest("details").open=false;previewNotice(button.textContent.trim(),"UI preview only. No private keys are read, imported or exported.");});
  host.querySelectorAll("[data-position-wallet]").forEach(b=>b.onclick=()=>{selected=b.dataset.positionWallet;draw()});
  host.querySelectorAll("[data-position-percent]").forEach(b=>b.onclick=()=>{percent=Number(b.dataset.positionPercent);draw()});
  const custom=host.querySelector("[data-position-custom]");if(custom)custom.onchange=e=>{const v=e.target.valueAsNumber;if(Number.isInteger(v)&&v>=0&&v<=100){percent=v;draw()}else e.target.value=percent};
 }
 async function refresh(){
  if(disposed||busy||!project||!host.isConnected)return;
  const id=++ticket,current=project;
  busy=true;status=lastObserved?"Refreshing holdings · Previous observation: "+lastObserved:"Reading Localnet holdings…";draw();
  if(!current?.token?.mint||current.network?.cluster!=="localnet"||!current.network?.genesis_hash){busy=false;status="No verified Localnet project scope.";draw();return}
  try{
   const snapshot=await adapter.portfolio({limit:5});
   if(ticket!==id||!host.isConnected)return;
   if(snapshot?.schema_version!=="cook-local-wallet-portfolio.1"||snapshot.genesis_hash!==current.network.genesis_hash||snapshot.network!=="localnet"||snapshot.read_only!==true||snapshot.execution_enabled!==false||!Array.isArray(snapshot.wallets))throw Error("SCOPE_MISMATCH");
   rows=positionRows(current,snapshot);lastObserved=String(snapshot.as_of??"Time unknown");status="Localnet read-only snapshot · "+lastObserved+" · Refreshes automatically while idle. Missing balances and PnL remain unknown.";
  }catch{if(ticket!==id||!host.isConnected)return;rows=positionRows(current,null);lastObserved=null;status="Portfolio unavailable or scope mismatch. No balances inferred."}
  finally{if(ticket===id){busy=false;if(host.isConnected){draw();schedule()}else dispose()}}
 }
 draw();
 return {setProject(next){if(project?.project_id===next?.project_id&&project?.revision===next?.revision&&project?.token?.mint===next?.token?.mint)return;ticket++;clearTimeout(timer);busy=false;lastObserved=null;project=next;selected=null;checked.clear();query="";percent=25;rows=positionRows(next,null);status=next?"Holdings not yet verified.":"Select a Meme.";draw();if(next?.token?.mint)void refresh();},selectWallet(address){selected=rows.some(r=>r.address===address)?address:null;draw()},refresh,dispose};
}
