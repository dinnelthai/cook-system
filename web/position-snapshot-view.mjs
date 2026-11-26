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
  const accounts=w?.token_accounts?.filter(a=>a.mint===mint)??[];
  const decimals=accounts[0]?.decimals??null;
  const known=!!w&&!conflicts&&w.token_accounts_status==="AVAILABLE"&&Array.isArray(w.token_accounts)&&accounts.every(a=>raw(a.amount_base_units)&&Number.isInteger(a.decimals)&&a.decimals>=0&&a.decimals<=18&&a.decimals===decimals)&&new Set(accounts.map(a=>a.token_account)).size===accounts.length;
  return {address,sol:w?.balance_status==="AVAILABLE"&&raw(w.balance_lamports)?w.balance_lamports:null,tokens:known?accounts.reduce((n,a)=>n+BigInt(a.amount_base_units),0n).toString():null,decimals:known?decimals:null,status:!valid?"Unverified":!w?"Not managed":known?"Observed":"Partial"};
 });
}
export function previewQuantity(rawBalance,percent){
 if(!raw(rawBalance)||!Number.isInteger(percent)||percent<0||percent>100)return null;
 const n=BigInt(rawBalance),quantity=n*BigInt(percent)/100n;
 return {quantity:quantity.toString(),remaining:(n-quantity).toString()};
}
const displayToken=(value,decimals)=>value==="0"?"0":formatUnits(value,decimals);
export function mountPositionSnapshot(host,{esc,onManage,onAssets,adapter=createWalletAdapter({mode:WALLET_MODE.LOCALNET})}){
 let project=null,rows=[],ticket=0,status="Select a Meme.",percent=25,selected=null;
 function draw(){
  const active=rows.find(r=>r.address===selected);
  const estimate=active?previewQuantity(active.tokens,percent):null;
  const known=rows.filter(r=>r.tokens!==null);
  const nonzero=known.filter(r=>r.tokens!=="0");
  const decimals=nonzero[0]?.decimals??0;
  const total=rows.length&&known.length===rows.length&&nonzero.every(r=>r.decimals===decimals)?displayToken(known.reduce((n,r)=>n+BigInt(r.tokens),0n).toString(),decimals):"—";
  const button=(id,label)=>'<button type="button" id="'+id+'">'+label+'</button>';
  host.innerHTML='<div class="desk-wallet-toolbar"><div><h3>Wallets</h3><small class="muted">'+rows.length+' registered wallets</small></div><div class="desk-wallet-actions">'+button("position-refresh","Refresh Holdings")+button("position-manage","Manage Wallets")+button("position-assets","Assets")+'</div></div>'+
   '<div class="cook-position-grid"><div><small>Total Token Holdings</small><strong>'+esc(total)+'</strong></div><div><small>Observed Wallets</small><strong>'+known.length+' / '+rows.length+'</strong></div></div>'+
   '<p class="desk-wallet-foot" role="status">'+esc(status)+'</p>'+
   '<div class="scroll"><table><thead><tr><th>Wallet</th><th>SOL Balance</th><th>Tokens</th><th>Cost</th><th>Unrealized PnL</th><th>Realized PnL</th><th>Status</th></tr></thead><tbody>'+
   rows.map(r=>'<tr><td><button type="button" data-position-wallet="'+esc(r.address)+'" aria-pressed="'+(selected===r.address)+'">'+esc(r.address)+'</button></td><td>'+esc(formatUnits(r.sol,9))+'</td><td>'+esc(displayToken(r.tokens,r.decimals))+'</td><td>—</td><td>—</td><td>—</td><td>'+esc(r.status)+'</td></tr>').join("")+
   '</tbody></table></div>'+
   '<section class="smith-section"><h3>Sell Quantity Preview</h3><p class="muted">Select a wallet to calculate a percentage of its observed token balance. Read-only; no order or quote is created.</p><div class="row">'+[10,25,50,75,100].map(p=>'<button type="button" data-position-percent="'+p+'" aria-pressed="'+(p===percent)+'">'+p+'%</button>').join("")+'</div>'+
   '<label>Custom percentage <input data-position-custom type="number" min="0" max="100" step="1" value="'+percent+'"></label>'+
   '<div class="trade-kv"><span>Selected Wallet</span><strong>'+esc(active?.address??"—")+'</strong><span>Tokens to Sell</span><strong>'+esc(estimate?displayToken(estimate.quantity,active.decimals):"—")+'</strong><span>Remaining Tokens</span><strong>'+esc(estimate?displayToken(estimate.remaining,active.decimals):"—")+'</strong><span>Estimated SOL Received</span><strong>Quote required</strong></div></section>';
  host.querySelector("#position-refresh").disabled=!project?.token?.mint;
  host.querySelector("#position-refresh").onclick=refresh;
  host.querySelector("#position-manage").onclick=onManage;
  host.querySelector("#position-assets").onclick=onAssets;
  host.querySelectorAll("[data-position-wallet]").forEach(b=>b.onclick=()=>{selected=b.dataset.positionWallet;draw()});
  host.querySelectorAll("[data-position-percent]").forEach(b=>b.onclick=()=>{percent=Number(b.dataset.positionPercent);draw()});
  host.querySelector("[data-position-custom]").onchange=e=>{const v=e.target.valueAsNumber;if(Number.isInteger(v)&&v>=0&&v<=100){percent=v;draw()}else e.target.value=percent};
 }
 async function refresh(){
  const id=++ticket,current=project;
  rows=positionRows(current,null);status="Reading Localnet holdings…";draw();
  if(!current?.token?.mint||current.network?.cluster!=="localnet"||!current.network?.genesis_hash){status="No verified Localnet project scope.";draw();return}
  try{
   const snapshot=await adapter.portfolio({limit:5});
   if(ticket!==id||!host.isConnected)return;
   if(snapshot?.schema_version!=="cook-local-wallet-portfolio.1"||snapshot.genesis_hash!==current.network.genesis_hash||snapshot.network!=="localnet"||snapshot.read_only!==true||snapshot.execution_enabled!==false)throw Error("SCOPE_MISMATCH");
   rows=positionRows(current,snapshot);status="Localnet read-only snapshot · "+String(snapshot.as_of??"Time unknown")+" · Refresh after confirmed transactions. Missing balances and PnL remain unknown.";
  }catch{if(ticket!==id||!host.isConnected)return;status="Portfolio unavailable or scope mismatch. No balances inferred."}
  draw();
 }
 draw();
 return {setProject(next){if(project?.project_id===next?.project_id&&project?.revision===next?.revision&&project?.token?.mint===next?.token?.mint)return;ticket++;project=next;selected=null;percent=25;rows=positionRows(next,null);status=next?"Holdings not yet verified.":"Select a Meme.";draw();if(next?.token?.mint)void refresh();},refresh};
}
