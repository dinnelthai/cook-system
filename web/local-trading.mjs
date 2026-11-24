async function api(action,body){const r=await fetch('/api/local-wallet/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.code||'请求失败');return data}
export async function mountLocalTrading(host){
 host.innerHTML='<h3>Localnet 多钱包交易</h3><p data-market>正在读取测试市场…</p><form><label>方向<select data-side><option value="buy">买入</option><option value="sell">卖出全部持仓</option></select></label><label data-amount-label>每个钱包买入参考金额（SOL）<input data-amount value="0.001" inputmode="decimal"></label><p class="muted">逐钱包提交；每笔确认后执行下一笔。滑点 1%，实际支出上限可能增加 1%；另付网络费用和账户租金。状态不明时停止。</p><div data-wallets>正在读取钱包…</div><button class="primary" disabled>执行测试交易</button></form><p data-result role="status"></p>';
 const q=s=>host.querySelector(s),form=q('form'),result=q('[data-result]'),side=q('[data-side]');let busy=false,marketInfo;
 side.onchange=()=>{q('[data-amount-label]').hidden=side.value==='sell'};
 try{
  const [market,list]=await Promise.all([api('market',{}),api('list',{})]);
  marketInfo=market;q('[data-market]').textContent='PumpSwap 测试池 · '+market.mint;
  const target=q('[data-wallets]');target.replaceChildren();
  for(const wallet of list.wallets){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=wallet.address;label.append(input,document.createTextNode(' '+wallet.address));target.append(label)}
  if(!list.wallets.length)target.textContent='请先创建钱包';else form.querySelector('button').disabled=false;
 }catch(e){q('[data-market]').textContent='测试市场不可用：'+e.message;return}
 form.onsubmit=e=>{e.preventDefault();if(busy)return;const addresses=[...q('[data-wallets]').querySelectorAll('input:checked')].map(x=>x.value);if(!addresses.length){result.textContent='请选择钱包';return}const direction=side.value;const amount=q('[data-amount]').value.trim();if(!confirm('Localnet：'+addresses.length+' 个钱包逐笔'+(direction==='buy'?'买入，每个 '+amount+' SOL':'卖出全部持仓')+'？'))return;
  busy=true;form.querySelector('button').disabled=true;result.textContent='正在逐笔执行，请勿重复提交…';const body={side:direction,addresses,mint:marketInfo.mint,pool:marketInfo.pool};if(direction==='buy')body.amount=amount;
  api('trade',body).then(data=>{result.replaceChildren();for(const x of data.results){const p=document.createElement('p');p.textContent=x.wallet+'：'+x.status+(x.reason?' / '+x.reason:'')+(x.signature?' / '+x.signature:'');result.append(p)}}).catch(err=>{result.textContent='结果无法确认：'+err.message+'。请先核对钱包和链上交易，勿重复提交。'}).finally(()=>{busy=false;form.querySelector('button').disabled=false});
 };
}
