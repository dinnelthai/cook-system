const key="cook.localnet.activeWallet";
let selected="";try{selected=localStorage.getItem(key)||""}catch{}
function choose(address){selected=address;try{localStorage.setItem(key,address)}catch{}}
async function api(action,body){
 const r=await fetch("/api/local-wallet/"+action,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
 const j=await r.json();if(!r.ok)throw Error(j.code||"请求失败");return j;
}
const fmt=n=>{const v=BigInt(n);return (v/1000000000n)+"."+(v%1000000000n).toString().padStart(9,"0").replace(/0+$/,"").padEnd(2,"0")+" SOL"};
function fill(select,rows){
 select.replaceChildren();
 if(!rows.length){select.add(new Option("尚无钱包",""));choose("");return}
 if(!rows.some(w=>w.address===selected))choose(rows[0].address);
 for(const w of rows)select.add(new Option(w.address,w.address));
 select.value=selected;
}
export async function mountWalletSelector(host,onManage){
 host.innerHTML='<div class="row wallet-picker"><span>当前钱包</span><select aria-label="当前钱包" disabled></select><button type="button">钱包管理</button></div><small data-state role="status"></small>';
 const sel=host.querySelector("select"),state=host.querySelector("[data-state]");host.querySelector("button").onclick=onManage;
 sel.onchange=()=>{choose(sel.value);state.textContent="当前钱包已切换";};
 try{const {wallets}=await api("list",{});fill(sel,wallets);sel.disabled=!wallets.length;if(!wallets.length)state.textContent="请先创建钱包"}catch{state.textContent="钱包服务不可用"}
}
export function mountLocalFaucet(host){
 host.innerHTML='<div class="terminal-heading"><div><h3>钱包管理</h3><small>Localnet · SOL</small></div><button data-create class="primary">＋ 创建钱包</button></div><label>当前钱包<select data-wallet aria-label="选择钱包" disabled></select></label><div class="stat"><small>链上余额</small><strong data-balance-value>— SOL</strong></div><form data-form><label>申请数量（SOL）<input data-amount type="text" inputmode="decimal" required value="1"></label><div class="row"><button type="button" data-balance disabled>刷新余额</button><button type="submit" class="primary" disabled>获取 SOL</button></div></form><form data-transfer><label>转入钱包<select data-target aria-label="转入钱包"></select></label><label>转账数量（SOL）<input data-transfer-amount type="text" inputmode="decimal" required value="0.1"></label><button type="submit">转账给钱包</button></form><p data-output role="status">正在读取钱包</p><details><summary>交易签名</summary><pre data-signature>—</pre></details>';
 const q=s=>host.querySelector(s),sel=q("[data-wallet]"),out=q("[data-output]");let busy=false;
 function controls(){sel.disabled=busy||!sel.value;q("[data-create]").disabled=busy;q("[data-balance]").disabled=busy||!sel.value;q("[data-form] [type=submit]").disabled=busy||!sel.value;q("[data-transfer] [type=submit]").disabled=busy||!sel.value||!q("[data-target]").value}
 async function load(){const {wallets}=await api("list",{});fill(sel,wallets);const target=q("[data-target]");target.replaceChildren();for(const w of wallets)target.add(new Option(w.address,w.address));target.value=wallets.find(w=>w.address!==sel.value)?.address||"";controls();return wallets}
 async function balance(){q("[data-balance-value]").textContent="— SOL";if(!sel.value)return;const r=await api("balance",{address:sel.value});q("[data-balance-value]").textContent=fmt(r.balance_lamports)}
 async function task(fn){if(busy)return;busy=true;controls();try{await fn()}catch(e){out.textContent="操作未确认："+e.message+"。如已申请资金，请先刷新余额。"}finally{busy=false;controls()}}
 sel.onchange=()=>{choose(sel.value);if(q("[data-target]").value===sel.value){const other=[...q("[data-target]").options].find(o=>o.value!==sel.value);q("[data-target]").value=other?.value||"";}q("[data-signature]").textContent="—";task(async()=>{out.textContent="已切换钱包";await balance()})};
 q("[data-create]").onclick=()=>task(async()=>{const w=await api("create",{});choose(w.address);await load();out.textContent="钱包已创建并设为当前钱包";q("[data-signature]").textContent="—";await balance()});
 q("[data-balance]").onclick=()=>task(async()=>{await balance();out.textContent="余额已刷新"});
 q("[data-form]").onsubmit=e=>{e.preventDefault();const address=sel.value,amount=q("[data-amount]").value.trim();if(!address||!confirm("向当前 Localnet 钱包申请 "+amount+" SOL？"))return;task(async()=>{const r=await api("airdrop",{address,amount});q("[data-signature]").textContent=r.signature;out.textContent="已提交，尚未确认到账。请稍后刷新余额。";await balance()})};
 q("[data-transfer]").onsubmit=e=>{e.preventDefault();const from=sel.value,to=q("[data-target]").value,amount=q("[data-transfer-amount]").value.trim();if(!from||!to||!confirm("从当前 Localnet 钱包转账 "+amount+" SOL？"))return;task(async()=>{const r=await api("transfer",{from,to,amount});q("[data-signature]").textContent=r.signature;out.textContent=r.status==="CONFIRMED"?"转账已确认。":r.status==="FAILED"?"链上已确认失败，请检查签名和余额。":"转账结果未知，禁止直接重复提交；请先核对签名与双方余额。";await balance()})};
 task(async()=>{const rows=await load();out.textContent=rows.length?"已读取钱包":"点击创建钱包开始";if(rows.length)await balance()});
}
