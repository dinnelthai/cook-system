let mainAddress="";
export function mountLocalFaucet(host){
 host.innerHTML='<h3>主钱包 · Localnet 测试 SOL</h3><p class="muted">本地 Validator Faucet；不需要私钥，不使用主网资金。</p><form data-form><label>主钱包公钥<input data-address required maxlength="44" autocomplete="off"></label><label>充值数量（SOL）<input data-amount type="text" inputmode="decimal" required value="1"></label><div class="row"><button type="button" data-balance>查询余额</button><button type="submit" class="primary">获取测试 SOL</button></div></form><pre data-output role="status">等待查询</pre>';
 const q=s=>host.querySelector(s);q("[data-address]").value=mainAddress;
 let busy=false;
 async function call(fund){
  if(busy)return;const address=q("[data-address]").value.trim();mainAddress=address;
  const amount=q("[data-amount]").value.trim();const out=q("[data-output]");
  if(fund&&!confirm("仅向本地测试链的钱包申请 "+amount+" SOL？"))return;
  busy=true;q("[data-balance]").disabled=true;q("[type=submit]").disabled=true;out.textContent="请求中…";
  try{
   const response=await fetch("/api/local-wallet/"+(fund?"airdrop":"balance"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(fund?{address,amount}:{address}),cache:"no-store"});
   const result=await response.json();if(!response.ok)throw Error(result.code||"请求失败");
   out.textContent=fund?"Faucet 已返回签名，尚未确认到账。请查询余额。\n"+result.signature:"已最终确认余额： "+formatSol(result.balance_lamports)+" SOL";
  }catch(e){out.textContent="未能确认请求结果："+e.message+"。请先查询余额，勿盲目重试。"}
  finally{busy=false;q("[data-balance]").disabled=false;q("[type=submit]").disabled=false}
 }
 function formatSol(n){const v=BigInt(n);return (v/1000000000n)+"."+(v%1000000000n).toString().padStart(9,"0")}
 q("[data-form]").onsubmit=e=>{e.preventDefault();call(true)};q("[data-balance]").onclick=()=>call(false);
}
