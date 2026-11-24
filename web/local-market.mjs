const intervals={60000:'1m',300000:'5m',900000:'15m',3600000:'1h'};
const U128_MAX=(1n<<128n)-1n;
function lamports(s){
 if(typeof s!=='string'||s.length>100||!/^\d+(?:\.\d+)?$/.test(s))throw Error('invalid volume');
 let [a,b='']=s.split('.');b=b.replace(/0+$/,'');
 if(b.length>9)throw Error('invalid volume precision');
 const n=BigInt(a)*1000000000n+BigInt(b.padEnd(9,'0')||'0');
 if(n>U128_MAX)throw Error('volume out of range');
 return n.toString();
}
function price(s){
 if(typeof s!=='string'||s.length>100||!/^\d+(?:\.\d+)?$/.test(s)||!Number.isFinite(Number(s))||Number(s)<=0)throw Error('invalid price');
 const [whole,fraction='']=s.split('.');
 return {n:BigInt(whole+fraction),scale:fraction.length};
}
function compare(a,b){const x=a.n*10n**BigInt(b.scale),y=b.n*10n**BigInt(a.scale);return x<y?-1:x>y?1:0}
export function mapLabCandles(rows){
 if(!Array.isArray(rows)||rows.length>1000)throw Error('invalid candle list');
 let last=-1;
 return rows.map(x=>{
  if(!x||typeof x.open_time!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x.open_time))throw Error('invalid candle time');
  const t=Date.parse(x.open_time);
  if(!Number.isSafeInteger(t)||t<0||t<=last)throw Error('invalid candle order');
  if(new Date(t).toISOString().slice(0,19)!==x.open_time.slice(0,19))throw Error('invalid candle date');
  last=t;
  const o=price(x.open),h=price(x.high),l=price(x.low),c=price(x.close);
  if(compare(l,h)>0||compare(l,o)>0||compare(l,c)>0||compare(h,o)<0||compare(h,c)<0)throw Error('invalid candle range');
  return {interval_start_ms:t,open_price:x.open,high_price:x.high,low_price:x.low,close_price:x.close,quote_volume_base_units:lamports(x.quote_volume)};
 });
}
export async function mountLocalMarket(host,interval,render){
 if(!host)return;
 try{
  const r=await fetch('/api/local-wallet/market-data',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({interval:intervals[interval]}),cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('行情接口不可用');const data=await r.json();
  const candles=mapLabCandles(data.candles);
  if(!host.isConnected)return;
  const main=host.closest('main'),source=host.closest('.pro-chart')?.querySelector('.pro-pane-head small');if(source)source.textContent='OHLCV · Pump Lab 索引';const status=main?.querySelector('.pro-statebar span:nth-child(2)');if(status)status.textContent='Pump Lab 索引响应 · '+new Date().toLocaleTimeString();const footer=main?.querySelector('.pro-bottom > span');if(footer)footer.textContent='数据来源：Pump Lab 索引快照（未经历史财务核验）';const heading=main?.querySelector('.pro-project h2');if(heading?.textContent.includes('未选择 Token')){heading.textContent='测试 Token / SOL';const sub=main.querySelector('.pro-project small');if(sub)sub.textContent=data.mint;}
  host.innerHTML=(candles.length?render({status:'CONSISTENT',candles}):'<p>该周期暂无已索引成交。</p>')+'<p class="muted">Pump Lab 索引行情 · 测试池 · 报价成交量为 Pump Lab 的费前名义额（SOL）；历史完整性未独立核验。</p>';
 }catch(e){if(host.isConnected){host.textContent='测试行情不可用；当前数据未知';const status=host.closest('main')?.querySelector('.pro-statebar span:nth-child(2)');if(status)status.textContent='行情响应失败 · 数据未知';}}
 if(host.isConnected)setTimeout(()=>mountLocalMarket(host,interval,render),10000);
}
