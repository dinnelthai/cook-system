const intervals={60000:'1m',300000:'5m',900000:'15m',3600000:'1h'};
function lamports(s){if(typeof s!=='string'||!/^\d+(?:\.\d+)?$/.test(s))throw Error('invalid volume');let [a,b='']=s.split('.');b=b.replace(/0+$/,'');if(b.length>9)throw Error('invalid volume precision');return (BigInt(a)*1000000000n+BigInt(b.padEnd(9,'0')||'0')).toString()}
export async function mountLocalMarket(host,interval,render){
 if(!host)return;
 try{
  const r=await fetch('/api/local-wallet/market-data',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({interval:intervals[interval]}),cache:'no-store'});if(!r.ok)throw Error('行情接口不可用');const data=await r.json();
  const candles=data.candles.map(x=>{const t=Date.parse(x.open_time);if(!Number.isSafeInteger(t)||t<0)throw Error('行情时间异常');for(const k of ['open','high','low','close'])if(typeof x[k]!=='string'||!/^(?:\d+)(?:\.\d+)?$/.test(x[k])||!Number.isFinite(Number(x[k]))||Number(x[k])<=0)throw Error('行情价格异常');return {interval_start_ms:t,open_price:x.open,high_price:x.high,low_price:x.low,close_price:x.close,quote_volume_base_units:lamports(x.quote_volume)}});
  if(!host.isConnected)return;
  const main=host.closest('main'),source=host.closest('.pro-chart')?.querySelector('.pro-pane-head small');if(source)source.textContent='OHLCV · Pump Lab 索引';const status=main?.querySelector('.pro-statebar span:nth-child(2)');if(status)status.textContent='Pump Lab 索引快照';const footer=main?.querySelector('.pro-bottom > span');if(footer)footer.textContent='数据来源：Pump Lab 索引快照（未经历史财务核验）';const heading=main?.querySelector('.pro-project h2');if(heading?.textContent.includes('未选择 Token')){heading.textContent='测试 Token / SOL';const sub=main.querySelector('.pro-project small');if(sub)sub.textContent=data.mint;}
  host.innerHTML=(candles.length?render({status:'CONSISTENT',candles}):'<p>该周期暂无已索引成交。</p>')+'<p class="muted">Pump Lab 索引行情 · 测试池 · 报价成交量为 Pump Lab 的费前名义额（SOL）；历史完整性未独立核验。</p>';
 }catch(e){if(host.isConnected)host.textContent='测试行情不可用：'+e.message}
 if(host.isConnected)setTimeout(()=>mountLocalMarket(host,interval,render),10000);
}
