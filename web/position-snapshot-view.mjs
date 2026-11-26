import {openWalletActionReview} from "./wallet-action-review.mjs";
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
// Inventory observation is separate from project-scoped trade observations.
// The server verifies the configured Localnet genesis before returning this snapshot.
export function portfolioErrorMessage(error){
 const messages={
  PORTFOLIO_UNAVAILABLE:"请检查 COOK_LOCAL_RPC_URL 和 COOK_LOCAL_GENESIS_HASH。",
  GENESIS_MISMATCH:"配置的创世哈希与验证节点不匹配，请核对 Localnet。",
  PORTFOLIO_RPC_UNAVAILABLE:"无法连接 Localnet RPC，请检查验证节点和端口。",
  PORTFOLIO_BUSY:"资产查询正在进行，请刷新重试。",
  WALLET_LIST_INVALID:"无法验证钱包列表。",
  SCOPE_MISMATCH:"代币网络与资产网络不匹配。",
  PORTFOLIO_DATA_INVALID:"钱包列表数据无效。",
  TOKEN_DECIMALS_CONFLICT:"代币精度冲突，无法验证持仓。",
  LOCAL_RPC_REQUEST_FAILED:"Localnet 资产请求失败，请检查服务端日志。"
 };
 const code=error?.message;
 return Object.hasOwn(messages,code)?"Localnet 资产查询失败 ["+code+"]. "+messages[code]:"Localnet 资产查询失败，请检查 RPC 和创世哈希配置。";
}
export function validInventorySnapshot(snapshot,project=null){
 return snapshot?.schema_version==="cook-local-wallet-portfolio.1"&&snapshot.network==="localnet"&&typeof snapshot.genesis_hash==="string"&&snapshot.genesis_hash.length>0&&snapshot.read_only===true&&snapshot.execution_enabled===false&&Array.isArray(snapshot.wallets)&&(!project||(project.network?.cluster==="localnet"&&snapshot.genesis_hash===project.network.genesis_hash));
}
export function inventoryPositions(inventory,snapshot,project=null,loading=false,failed=false){
 const valid=validInventorySnapshot(snapshot,project),mint=project?.token?.mint??null;
 return inventory.map(({address})=>{
  const matches=valid?snapshot.wallets.filter(w=>w?.address===address):[];
  const w=matches.length===1?matches[0]:null;
  const sol=w?.balance_status==="AVAILABLE"&&raw(w.balance_lamports)?w.balance_lamports:null;
  const accounts=w?.token_accounts;
  const known=!!w&&!snapshot.token_account_scope_conflict&&w.token_accounts_status==="AVAILABLE"&&Array.isArray(accounts)&&accounts.every(a=>a&&typeof a.mint==="string"&&a.mint&&typeof a.token_account==="string"&&a.token_account&&raw(a.amount_base_units)&&Number.isInteger(a.decimals)&&a.decimals>=0&&a.decimals<=18)&&new Set(accounts.map(a=>a.token_account)).size===accounts.length;
  const holdings=new Set(known?accounts.filter(a=>BigInt(a.amount_base_units)>0n).map(a=>a.mint):[]);
  const matching=known&&mint?accounts.filter(a=>a.mint===mint):[];
  const consistent=known&&(!mint||matching.every(a=>a.decimals===matching[0]?.decimals));
  const tokens=consistent?(mint?matching.reduce((n,a)=>n+BigInt(a.amount_base_units),0n).toString():String(holdings.size)):null;
  return {address,sol,tokens,decimals:tokens===null?null:mint?matching[0]?.decimals??0:0,tokenMints:known?[...holdings]:null,status:loading?"Loading":sol!==null&&tokens!==null?"Ready":sol!==null||tokens!==null?"Partial":failed||valid?"RPC Error":"Balance unverified"};
 });
}
export function holdingMintCount(rows){
 if(!Array.isArray(rows)||rows.some(r=>!Array.isArray(r.tokenMints)))return null;
 return new Set(rows.flatMap(r=>r.tokenMints)).size;
}
export function formatSupplyShare(row,supply,mint){
 if(!mint||supply?.mint!==mint||!raw(row?.tokens)||!raw(supply.amount_base_units)||!Number.isInteger(supply.decimals)||supply.decimals<0||supply.decimals>18||BigInt(supply.amount_base_units)===0n)return "—";
 const amount=BigInt(row.tokens),total=BigInt(supply.amount_base_units);
 if(amount>total||amount!==0n&&row.decimals!==supply.decimals)return "—";
 const scaled=amount*1000000n/total;
 if(amount>0n&&scaled===0n)return "<0.0001%";
 return formatUnits(scaled.toString(),4)+"%";
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
// Per-browser display preference only; never modifies the wallet keystore.
const WALLET_VIEW_KEY="cook.terminal.hidden-wallets.v1";
export function readHiddenWallets(storage){
 try{
  const values=JSON.parse(storage?.getItem(WALLET_VIEW_KEY)??"[]");
  return new Set(Array.isArray(values)?values.filter(a=>typeof a==="string"&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)):[]);
 }catch{return new Set()}
}
export function writeHiddenWallets(storage,values){
 try{if(!storage)return false;storage.setItem(WALLET_VIEW_KEY,JSON.stringify([...values]));return true}catch{return false}
}
export function validWalletPreviewCount(value){return typeof value==="string"&&/^[1-9][0-9]?$/.test(value)&&Number(value)<=20;}
export function validCreatedWalletBatch(result,count){
 if(!validWalletPreviewCount(String(count))||!["CREATED","PARTIAL"].includes(result?.status)||result.requested!==count||!Number.isInteger(result.created_count)||result.created_count<0||result.created_count>count||!Array.isArray(result.wallets)||result.wallets.length!==result.created_count)return false;
 if(result.status==="CREATED"?result.created_count!==count:result.created_count>=count)return false;
 return result.wallets.every(w=>typeof w?.address==="string"&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w.address))&&new Set(result.wallets.map(w=>w.address)).size===result.wallets.length;
}
export function mountPositionSnapshot(host,{esc,onManage,onAssets,currentOnly=false,onSummary=()=>{},adapter=createWalletAdapter({mode:WALLET_MODE.LOCALNET})}){
 let project=null,rows=[],ticket=0,status="请选择代币查看持仓。",percent=25,selected=null;
 let checked=new Set(),query="",sortField="address",sortDirection="asc",busy=false,lastObserved=null;
 let timer=null,disposed=false,generateDialog=null,amountsDialog=null,walletActionDialog=null,creating=false,inventory=null,inventoryTicket=0,inventorySnapshot=null,inventoryFailed=false;
 let viewStorage=null;try{if(currentOnly)viewStorage=host.ownerDocument.defaultView.localStorage}catch{}
 const hiddenWallets=readHiddenWallets(viewStorage);let viewPreferenceSaved=true;
 const saveWalletView=()=>{viewPreferenceSaved=writeHiddenWallets(viewStorage,hiddenWallets)};
 const allInventoryRows=()=>currentOnly?inventoryPositions(inventory??[],inventorySnapshot,project,busy,inventoryFailed):rows;
 const displayRows=()=>allInventoryRows().filter(r=>!hiddenWallets.has(r.address));
 const visibleRows=()=>sortPositionRows(displayRows().filter(r=>!query||r.address.toLowerCase().includes(query.toLowerCase())),sortField,sortDirection);
 async function loadInventory(){
  const own=++inventoryTicket;
  try{const result=await adapter.list();const list=result?.wallets;
   if(!Array.isArray(list)||list.length>20||list.some(w=>!w||typeof w.address!=="string"||! /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w.address))||new Set(list.map(w=>w.address)).size!==list.length)throw Error("WALLET_LIST_INVALID");
   if(disposed||own!==inventoryTicket||!host.isConnected)return false;
   inventory=list.map(w=>({address:w.address}));draw();return true;
  }catch{if(!disposed&&own===inventoryTicket&&host.isConnected){draw()}return false}
 }
 function schedule(){
  clearTimeout(timer);
  if(disposed||(!currentOnly&&(!project?.token?.mint||!project?.network?.genesis_hash)))return;
  timer=setTimeout(()=>{
   if(!host.isConnected){dispose();return}
   if(host.ownerDocument.visibilityState!=="hidden"&&!busy&&!host.hidden&&!walletActionDialog?.isConnected&&!generateDialog?.isConnected&&!amountsDialog?.isConnected&&!host.contains(host.ownerDocument.activeElement))void refresh();
   else schedule();
  },20000);
 }
 function onFocus(){if(!host.isConnected){dispose();return}if(!busy&&(currentOnly||project?.token?.mint)&&!walletActionDialog?.isConnected&&!generateDialog?.isConnected&&!amountsDialog?.isConnected&&!host.contains(host.ownerDocument.activeElement))void refresh();}
 function dispose(){if(disposed)return;disposed=true;generateDialog?.remove();generateDialog=null;amountsDialog?.remove();amountsDialog=null;walletActionDialog?.remove();walletActionDialog=null;ticket++;clearTimeout(timer);globalThis.removeEventListener?.("focus",onFocus);observer?.disconnect();}
 let mounted=host.isConnected;
 const observer=typeof MutationObserver==="function"?new MutationObserver(()=>{if(!host.isConnected&&mounted)dispose();else if(host.isConnected)mounted=true}):null;
 if(host.ownerDocument?.documentElement)observer?.observe(host.ownerDocument.documentElement,{childList:true,subtree:true});
 globalThis.addEventListener?.("focus",onFocus);
 function openGenerate(){
  if(disposed||generateDialog||creating)return;
  const doc=host.ownerDocument,dialog=doc.createElement("dialog");
  generateDialog=dialog;dialog.className="reference-generate-dialog";dialog.setAttribute("aria-labelledby","generate-wallet-title");
  dialog.innerHTML='<button type="button" data-generate-close class="generate-close" aria-label="关闭">×</button><h3 id="generate-wallet-title">添加钱包</h3><p class="generate-description">创建 Localnet 钱包，签名密钥保存在本地。</p><form data-generate-form><label for="generate-wallet-count">钱包创建数量</label><input id="generate-wallet-count" type="number" min="1" max="20" step="1" value="1" required autofocus><button type="submit" class="generate-submit">添加钱包</button><p class="generate-feedback" role="status">真实 Localnet 钱包 · 当前存储容量：20。</p></form>';
  doc.body.append(dialog);
  const input=dialog.querySelector("#generate-wallet-count"),submit=dialog.querySelector(".generate-submit"),feedback=dialog.querySelector(".generate-feedback");
  dialog.querySelector("[data-generate-close]").onclick=()=>dialog.close();
  dialog.addEventListener("close",()=>{dialog.remove();if(generateDialog===dialog)generateDialog=null;host.querySelector("#position-manage")?.focus({preventScroll:true})},{once:true});
  input.oninput=()=>{submit.disabled=creating||!validWalletPreviewCount(input.value);feedback.textContent="真实 Localnet 钱包 · 当前存储容量：20。"};
  dialog.querySelector("form").onsubmit=async e=>{
   e.preventDefault();if(creating||disposed||!validWalletPreviewCount(input.value))return;
   const count=Number(input.value);creating=true;submit.disabled=true;input.disabled=true;feedback.textContent="正在创建 Localnet 钱包…";
   dialog.querySelector("[data-generate-close]").disabled=true;
   const preventClose=e=>e.preventDefault();dialog.addEventListener("cancel",preventClose);
   try{
    const result=await adapter.createBatch({count});
    if(!validCreatedWalletBatch(result,count))throw Error("WALLET_RESULT_INVALID");
    const refreshed=await loadInventory();
    const listed=refreshed&&result.wallets.every(w=>inventory?.some(x=>x.address===w.address));
    if(refreshed&&!disposed)void refresh();
    if(!disposed&&dialog.isConnected){feedback.textContent=result.created_count+" / "+count+" 个钱包已创建。"+(result.status==="PARTIAL"?" 部分创建成功，请检查钱包列表后重试。":"")+(listed?"":" 钱包列表刷新未确认，请使用刷新功能。");}

   }catch(error){await loadInventory();if(!disposed&&dialog.isConnected)feedback.textContent=error.message==="WALLET_LIMIT"?"钱包数量超过容量（共 20 个），未创建新钱包。":"创建结果未确认，请检查钱包列表后重试。";}
   finally{creating=false;if(!disposed&&dialog.isConnected){input.disabled=false;submit.disabled=!validWalletPreviewCount(input.value);dialog.querySelector("[data-generate-close]").disabled=false;dialog.removeEventListener("cancel",preventClose);}}
  };
  dialog.showModal();
 }
 function draw(){
  const active=rows.find(r=>r.address===selected);
  const estimate=active?previewQuantity(active.tokens,percent):null;
  const displayed=displayRows(),visible=visibleRows();
  const available=new Set(displayed.map(r=>r.address));for(const address of checked)if(!available.has(address))checked.delete(address);
  const all=summarizePositions(currentOnly?allInventoryRows():rows),chosen=summarizePositions(displayed.filter(r=>checked.has(r.address)));
  const tokenCount=items=>{const count=holdingMintCount(items);return count===null||!items.length?"—":String(count)+" 种"};
  const inventoryTokenCount=currentOnly&&inventory&&validInventorySnapshot(inventorySnapshot,project)?holdingMintCount(allInventoryRows()):null;
  const total=currentOnly&&!project?.token?.mint?tokenCount(allInventoryRows()):displayToken(all.token_balance,all.token_decimals);
  const chosenToken=currentOnly&&!project?.token?.mint?tokenCount(displayed.filter(r=>checked.has(r.address))):displayToken(chosen.token_balance,chosen.token_decimals);
  onSummary({project_id:project?.project_id??null,mint:project?.token?.mint??null,sol:formatUnits(all.sol_balance,9),tokens:total,observed:all.observed_count,count:all.wallet_count,status,rows:rows.map(r=>({...r})),active:selected,busy,inventoryCount:currentOnly&&inventory?inventory.length:null,inventoryTokenCount,receiptHistory:currentOnly&&validInventorySnapshot(inventorySnapshot,project)?inventorySnapshot.wallets.map(w=>({address:w.address,recent_transactions:w.recent_transactions,history_status:w.history_status})):null});
  const header=(label,key)=>'<button type="button" class="position-sort" data-position-sort="'+key+'" aria-label="按 '+label+' 排序">'+label+(sortField===key?(sortDirection==="asc"?" ↑":" ↓"):"")+'</button>';
  const button=(id,label)=>'<button type="button" id="'+id+'">'+label+'</button>';
  host.classList.toggle("reference-wallet-table",currentOnly);host.innerHTML='<div class="desk-wallet-toolbar"><div><h3>钱包</h3><small class="muted">'+displayRows().length+(currentOnly?' 个可见钱包 · ':' 个已登记钱包 · ')+checked.size+' 个已选</small></div><div class="desk-wallet-actions">'+(currentOnly?'<button type="button" id="position-manage"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 4v16M4 12h16"/></svg>生成钱包</button><button type="button" id="position-amounts" class="reference-set-amounts"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h3c4 0 6 12 10 12h5m-4-4 4 4-4 4M3 18h3c1.5 0 3-2 4-4m4-6c1-1 2-2 3-2h4m-4-4 4 4-4 4"/></svg>设置金额</button><details class="reference-wallet-more"><summary aria-label="更多钱包操作" title="更多钱包操作"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></summary><div class="reference-wallet-menu"><button type="button" data-reference-wallet-action="0"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM5 10l3 1 4 2 4-2 3-1 3 4-2 4-3-1-1 4H8l-1-4-3 1-2-4z"/></svg><span>归集 SOL</span></button><button type="button" data-reference-wallet-action="1"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h16l-4-4m4 4-4 4M21 17H5l4-4m-4 4 4 4"/></svg><span>迁移钱包</span></button><button type="button" data-reference-wallet-action="3"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h5c5 0 5-7 10-7h3m-4-4 4 4-4 4M8 12c5 0 5 7 10 7h3m-4-4 4 4-4 4"/></svg><span>拆分钱包</span></button><button type="button" data-reference-wallet-action="4" class="reference-wallet-delete"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg><span>移除</span></button></div></details><details class="reference-wallet-more reference-keys-more"><summary id="position-private-keys">私钥<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M15 2a7 7 0 0 0-6.7 9L2 17.3V22h4.7l2-2v-2h2l2.3-2.3A7 7 0 1 0 15 2zm2 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg></summary><div class="reference-wallet-menu reference-keys-menu"><button type="button" disabled data-key-preview="selected"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M15 2a7 7 0 0 0-6.7 9L2 17.3V22h4.7l2-2v-2h2l2.3-2.3A7 7 0 1 0 15 2zm2 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg><span>导出选中私钥</span></button><button type="button" data-key-preview="removed"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M15 2a7 7 0 0 0-6.7 9L2 17.3V22h4.7l2-2v-2h2l2.3-2.3A7 7 0 1 0 15 2zm2 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg><span>导出已移除私钥</span></button><button type="button" data-key-preview="import"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/></svg><span>导入私钥</span></button></div></details>':button("position-refresh",busy?"Refreshing…":"刷新持仓")+button("position-manage","管理钱包")+button("position-assets","资产"))+'</div></div>'+
   '<div class="cook-position-grid"><div><small>代币总持仓</small><strong>'+esc(total)+'</strong></div><div><small>SOL 总余额</small><strong>'+esc(formatUnits(all.sol_balance,9))+'</strong></div><div><small>已观测钱包</small><strong>'+(currentOnly?displayed.filter(r=>r.status==="Ready").length:all.observed_count)+' / '+all.wallet_count+'</strong></div></div>'+
   '<p class="desk-wallet-foot" role="status">'+esc(status)+(hiddenWallets.size?' · '+hiddenWallets.size+' 个钱包已从列表隐藏，资产保留。 <button type="button" data-restore-wallet-view>恢复</button>':'')+(!viewPreferenceSaved?' · 无法保存视图偏好。':'')+'</p>'+
   (currentOnly?'':'<div class="row position-filter"><label>搜索钱包 <input type="search" data-position-search placeholder="钱包地址" value="'+esc(query)+'"></label><button type="button" data-position-clear>清除选择</button></div>')+
   '<div class="cook-position-grid"><div><small>选中代币持仓</small><strong>'+esc(chosenToken)+'</strong></div><div><small>选中 SOL 余额</small><strong>'+esc(formatUnits(chosen.sol_balance,9))+'</strong></div></div>'+
   '<div class="scroll"><table><thead><tr><th><input type="checkbox" data-position-all aria-label="选择所有可见钱包" '+(visible.length&&visible.every(r=>checked.has(r.address))?"checked":"")+'></th><th>'+header("钱包","address")+'</th><th>'+header("SOL 余额","sol")+'</th><th>'+header("代币","tokens")+'</th>'+(currentOnly?'<th>供应量占比</th><th>收益</th>':'<th>成本</th><th>未实现盈亏</th><th>已实现盈亏</th>')+'<th>'+header("状态","status")+'</th></tr></thead><tbody>'+
   visible.map(r=>'<tr><td><input type="checkbox" data-position-check="'+esc(r.address)+'" aria-label="选择钱包 '+esc(r.address)+'" '+(checked.has(r.address)?"checked":"")+'></td><td><button type="button" data-position-wallet="'+esc(r.address)+'" aria-pressed="'+(selected===r.address)+'" title="'+esc(r.address)+'">'+esc(r.address.length>15?r.address.slice(0,6)+"…"+r.address.slice(-5):r.address)+'</button></td><td>'+esc(formatUnits(r.sol,9))+'</td><td>'+esc(currentOnly&&!project?.token?.mint&&r.tokens!==null?r.tokens+" 种":displayToken(r.tokens,r.decimals))+'</td>'+(currentOnly?'<td>'+esc(formatSupplyShare(r,inventorySnapshot?.token_supply,project?.token?.mint))+'</td><td>—</td>':'<td>—</td><td>—</td><td>—</td>')+'<td>'+esc(({Ready:"就绪",Loading:"加载中",Partial:"部分可用","RPC Error":"RPC 错误","Balance unverified":"余额未验证",Unverified:"未验证","Not managed":"未管理",Observed:"已观测"})[r.status]??r.status)+'</td></tr>').join("")+
   (!visible.length?'<tr><td colspan="'+(currentOnly?7:8)+'" class="muted">'+(currentOnly&&!displayRows().length?'<div class="reference-wallet-empty"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 6a3 3 0 0 1 3-3h14v2H6a1 1 0 0 0 0 2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a3 3 0 0 1-3-3zm15 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg><strong>暂无钱包</strong><span>请先创建钱包。</span><button type="button" data-reference-new-wallet>＋ 新建钱包</button></div>':displayRows().length?"暂无匹配钱包":"暂无已注册钱包")+'</td></tr>':"")+'</tbody></table></div>'+
   (currentOnly?'':'<section class="smith-section"><h3>卖出数量预览</h3><p class="muted">选择钱包后查看已观测代币余额的指定比例。仅只读，不创建订单或报价。</p><div class="row">'+[10,25,50,75,100].map(p=>'<button type="button" data-position-percent="'+p+'" aria-pressed="'+(p===percent)+'">'+p+'%</button>').join("")+'</div>'+
   '<label>自定义百分比 <input data-position-custom type="number" min="0" max="100" step="1" value="'+percent+'"></label>'+
   '<div class="trade-kv"><span>选中钱包</span><strong>'+esc(active?.address??"—")+'</strong><span>待卖出代币</span><strong>'+esc(estimate?displayToken(estimate.quantity,active.decimals):"—")+'</strong><span>剩余代币</span><strong>'+esc(estimate?displayToken(estimate.remaining,active.decimals):"—")+'</strong><span>预计收到 SOL</span><strong>需要报价</strong></div></section>');
  const refreshButton=host.querySelector("#position-refresh");if(refreshButton)refreshButton.disabled=busy||!project?.token?.mint;
  const restoreWalletView=host.querySelector("[data-restore-wallet-view]");if(restoreWalletView)restoreWalletView.onclick=()=>{hiddenWallets.clear();saveWalletView();draw()};
  const allCheck=host.querySelector("[data-position-all]");
  const selectable=visible;allCheck.disabled=!selectable.length;allCheck.checked=selectable.length>0&&selectable.every(r=>checked.has(r.address));allCheck.indeterminate=selectable.some(r=>checked.has(r.address))&&!selectable.every(r=>checked.has(r.address));
  allCheck.onchange=()=>{for(const r of selectable)allCheck.checked?checked.add(r.address):checked.delete(r.address);draw()};
  host.querySelectorAll("[data-position-check]").forEach(b=>{if(!available.has(b.dataset.positionCheck)){b.disabled=true;return}b.onchange=()=>{b.checked?checked.add(b.dataset.positionCheck):checked.delete(b.dataset.positionCheck);draw()}});
  const clear=host.querySelector("[data-position-clear]");if(clear)clear.onclick=()=>{checked.clear();draw()};
  const search=host.querySelector("[data-position-search]");if(search)search.oninput=e=>{query=e.target.value;draw();const input=host.querySelector("[data-position-search]");input.focus();try{input.setSelectionRange(query.length,query.length)}catch{}};
  host.querySelectorAll("[data-position-sort]").forEach(b=>b.onclick=()=>{const key=b.dataset.positionSort;sortDirection=sortField===key&&sortDirection==="asc"?"desc":"asc";sortField=key;draw()});
  if(refreshButton)refreshButton.onclick=refresh;
  host.querySelector("#position-manage").onclick=currentOnly?openGenerate:onManage;const newWallet=host.querySelector("[data-reference-new-wallet]");if(newWallet)newWallet.onclick=openGenerate;
  const assetsButton=host.querySelector("#position-assets");if(assetsButton)assetsButton.onclick=onAssets;
  const previewNotice=(title,message)=>{const doc=host.ownerDocument,dialog=doc.createElement("dialog");dialog.className="reference-wallet-dialog";dialog.innerHTML="<h3>"+esc(title)+"</h3><p>"+esc(message)+"</p><form method=\"dialog\"><button>关闭</button></form>";host.append(dialog);dialog.addEventListener("close",()=>dialog.remove(),{once:true});dialog.showModal()};
  const amounts=host.querySelector("#position-amounts");if(amounts)amounts.onclick=()=>{if(amountsDialog?.isConnected)return;amountsDialog=openAmountsPreview(amounts);};
  host.querySelectorAll("[data-reference-wallet-action]").forEach(button=>button.onclick=()=>{if(walletActionDialog?.isConnected)return;const menu=button.closest("details");menu.open=false;const source=displayRows().filter(r=>checked.has(r.address));if(button.dataset.referenceWalletAction==="4"){if(!source.length)return;for(const r of source){hiddenWallets.add(r.address);checked.delete(r.address)}saveWalletView();draw();return;}walletActionDialog=openWalletActionReview(menu.querySelector("summary"),{action:button.dataset.referenceWalletAction,rows:source,availableWallets:allInventoryRows(),esc});});
  const menus=host.querySelectorAll(".reference-wallet-more");menus.forEach(menu=>menu.addEventListener("toggle",()=>{if(menu.open)menus.forEach(other=>{if(other!==menu)other.open=false})}));
  host.querySelectorAll("[data-key-preview]:not(:disabled)").forEach(button=>button.onclick=()=>{button.closest("details").open=false;previewNotice(button.textContent.trim(),"仅界面预览，不读取、导入或导出私钥。");});
  host.querySelectorAll("[data-position-wallet]").forEach(b=>b.onclick=()=>{selected=rows.some(r=>r.address===b.dataset.positionWallet)?b.dataset.positionWallet:null;draw()});
  host.querySelectorAll("[data-position-percent]").forEach(b=>b.onclick=()=>{percent=Number(b.dataset.positionPercent);draw()});
  const custom=host.querySelector("[data-position-custom]");if(custom)custom.onchange=e=>{const v=e.target.valueAsNumber;if(Number.isInteger(v)&&v>=0&&v<=100){percent=v;draw()}else e.target.value=percent};
 }
 async function refresh(){
  if(disposed||!host.isConnected||busy||(!currentOnly&&!project))return;
  const id=++ticket,current=project;
  busy=true;status=lastObserved?"正在刷新持仓 · 上次观测："+lastObserved:"正在读取 Localnet 持仓…";draw();
  try{
   if(currentOnly&&!(await loadInventory()))throw Error("WALLET_LIST_INVALID");
   if(ticket!==id||disposed||!host.isConnected)return;
   if(currentOnly&&!inventory)throw Error("WALLET_LIST_INVALID");
   if(!currentOnly&&(!current?.token?.mint||current.network?.cluster!=="localnet"||!current.network?.genesis_hash))throw Error("SCOPE_MISMATCH");
   const snapshot=await adapter.portfolio({limit:5,...(currentOnly&&current?.token?.mint?{mint:current.token.mint}:{})});
   if(ticket!==id||disposed||!host.isConnected)return;
   if(!validInventorySnapshot(snapshot,current))throw Error("SCOPE_MISMATCH");
   if(currentOnly){inventorySnapshot=snapshot;inventoryFailed=false}
   // Only the original project-scoped rows are passed to the trade ticket.
   rows=positionRows(current,snapshot);lastObserved=String(snapshot.as_of??"时间未知");status="Localnet 只读快照 · "+lastObserved+" · 空闲时自动刷新。缺失余额和盈亏保持未知。";
  }catch(error){
   if(ticket!==id||disposed||!host.isConnected)return;
   if(currentOnly){inventorySnapshot=null;inventoryFailed=true}
   rows=positionRows(current,null);lastObserved=null;status=portfolioErrorMessage(error);
  }
  finally{if(ticket===id){busy=false;if(host.isConnected){draw();schedule()}else dispose()}}
 }
 draw();if(currentOnly)void refresh();
 return {setProject(next){if(project?.project_id===next?.project_id&&project?.revision===next?.revision&&project?.token?.mint===next?.token?.mint)return;ticket++;clearTimeout(timer);busy=false;lastObserved=null;inventorySnapshot=null;inventoryFailed=false;project=next;selected=null;checked.clear();query="";percent=25;rows=positionRows(next,null);status=next?"持仓尚未验证。":"请选择代币查看持仓。";draw();if(currentOnly||next?.token?.mint)void refresh();},selectWallet(address){selected=rows.some(r=>r.address===address)?address:null;draw()},refresh,dispose};
}
