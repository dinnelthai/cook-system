export function solToLamports(value){
 if(typeof value!=='string'||!/^(0|[1-9]\d*)(\.\d{1,9})?$/.test(value))throw Error('请输入有效 SOL 金额');
 const [whole,fraction='']=value.split('.'),amount=BigInt(whole)*1000000000n+BigInt(fraction.padEnd(9,'0'));
 if(amount===0n||amount>18446744073709551615n)throw Error('SOL 金额超出范围');return amount.toString();
}
export function portionOfBalance(value,percentage){
 if(typeof value!=='string'||!/^\d+$/.test(value)||!Number.isInteger(percentage)||percentage<1||percentage>100)throw Error('无有效余额或比例');
 const amount=BigInt(value)*BigInt(percentage)/100n;if(amount===0n)throw Error('卖出数量为零');return amount.toString();
}
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function post(path,body){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.code||'请求失败');return data;}
export function mountTradeTicket(host){
 let project=null,snapshot=null,side='buy',ticket=0;
 const status=text=>{const el=host.querySelector('[data-trade-status]');if(el)el.textContent=text;};
 function draw(){
  const members=new Map((project?.wallet_groups??[]).flatMap(g=>g.members).filter(w=>w.enabled).map(w=>[w.wallet_address,w]));
  const wallets=(snapshot?.wallets??[]).filter(w=>members.has(w.address));
  const markets=(project?.markets??[]).filter(m=>m.venue==='PUMP_SWAP'&&m.verification_status==='VERIFIED');
  host.innerHTML='<section class="smith-section"><h3>Localnet Trade</h3><p class="muted">项目绑定 · 钱包逐笔执行</p><div class="bundle-direction"><button type="button" data-buy>买入</button><button type="button" data-sell>卖出</button></div><label>市场<select data-market>'+markets.map(m=>'<option value="'+escapeHtml(m.market_id)+'">'+escapeHtml(m.market_id)+'</option>').join('')+'</select></label><p>'+(project?'已启用并受管钱包：'+wallets.length:'请选择项目')+'</p><div data-wallets>'+wallets.map(w=>'<label><input type="checkbox" data-wallet="'+escapeHtml(w.address)+'"> '+escapeHtml(w.address)+' <small>SOL: '+escapeHtml(w.balance_status==='AVAILABLE'?w.balance_lamports:'未知')+' lamports</small><input data-amount="'+escapeHtml(w.address)+'" inputmode="decimal" placeholder="'+(side==='buy'?'买入 SOL':'卖出百分比')+'"></label>').join('')+'</div><button type="button" data-refresh>刷新余额</button> <button type="button" data-preview>检查交易</button><p role="status" data-trade-status>交易执行尚未接入；检查不会发送交易。</p><div data-output></div></section>';
  host.querySelector('[data-buy]').onclick=()=>{side='buy';draw();};host.querySelector('[data-sell]').onclick=()=>{side='sell';draw();};
  host.querySelector('[data-refresh]').onclick=()=>refresh();
  host.querySelector('[data-preview]').onclick=async()=>{
   const context=project, epoch=ticket;try{
    if(!context||!snapshot)throw Error('请选择项目并刷新钱包余额');
    const market=host.querySelector('[data-market]').value;if(!market)throw Error('没有已验证的 PumpSwap 市场');
    const selected=[...host.querySelectorAll('[data-wallet]:checked')];if(!selected.length)throw Error('请选择钱包');
    const orders=selected.map(el=>{const wallet=el.dataset.wallet,w=snapshot.wallets.find(x=>x.address===wallet),field=[...host.querySelectorAll('[data-amount]')].find(x=>x.dataset.amount===wallet);let amount;
     if(side==='buy')amount=solToLamports(field.value.trim());else{if(w.token_accounts_status!=='AVAILABLE')throw Error('Token 余额未知');const balance=w.token_accounts.filter(a=>a.mint===context.token.mint).reduce((n,a)=>n+BigInt(a.amount_base_units),0n);amount=portionOfBalance(balance.toString(),Number(field.value));}return {wallet,amount_base_units:amount};});
    status('正在检查项目、市场与余额…');const result=await post('/api/local-wallet/project-trade-preview',{project_id:context.project_id,revision:context.revision,market_id:market,side,orders});if(epoch!==ticket||project!==context)return;
    status('检查完成；暂无可执行报价，交易尚未启用。');host.querySelector('[data-output]').textContent=orders.length+' 个钱包，总数量 '+result.total_base_units+' 基础单位；余额不含网络费用。';
   }catch(e){if(epoch===ticket)status('检查失败：'+e.message);}
  };
 }
 async function refresh(){const epoch=++ticket;snapshot=null;draw();status('正在读取 Localnet 钱包余额…');try{const data=await post('/api/local-wallet/portfolio',{limit:1});if(epoch!==ticket)return;snapshot=data;draw();status('余额已读取。选择钱包并输入金额。');}catch(e){if(epoch===ticket)status('余额不可用：'+e.message);}}
 draw();return {setProject(next){if(project?.project_id===next?.project_id&&project?.revision===next?.revision)return;project=next;snapshot=null;ticket++;draw();if(project)refresh();}};
}
