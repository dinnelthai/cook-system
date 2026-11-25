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

const formatQualityPrice=s=>{if(typeof s!=="string"||s.length>100||!/^\d+(?:\.\d+)?$/.test(s))throw Error("INVALID_CANDLE_PRICE");const [whole,fraction=""]=s.split(".");if(fraction.length>18)throw Error("INVALID_CANDLE_PRICE_PRECISION");const n=BigInt(whole+fraction);if(n<=0n)throw Error("INVALID_CANDLE_PRICE");return {n,scale:fraction.length};};
const qualityBps=(n,d)=>d===0n?null:(n*10000n/d).toString();
const qualitySeverity=code=>({LOW_SAMPLE_SIZE:"low",CANDLE_GAPS:"medium",LARGE_PRICE_MOVE:"high",WIDE_INTRABAR_RANGE:"medium",LARGE_OBSERVED_DRAWDOWN:"high",VOLUME_CONCENTRATION:"medium",NO_OBSERVED_VOLUME:"low"})[code]??"low";
/** Candle-only diagnostics. OHLCV cannot identify independent actors, buyer/seller
 * flow, wallet ownership, wash trading or intent. */
export function analyzeCandleQuality(candles,{intervalMs=60000}={}){
 if(!Array.isArray(candles)||candles.length>1000||![60000,300000,900000,3600000].includes(intervalMs))throw Error("INVALID_CANDLE_QUALITY_INPUT");
 if(!candles.length)return {schema_version:"cook-candle-quality.1",status:"NO_DATA",candle_count:0,metrics:null,alerts:[{code:"NO_MARKET_DATA",severity:"low",detail:"暂无可用 K 线"}],source_attestation:"UNKNOWN",buy_sell_flow_status:"UNAVAILABLE",actor_attribution_status:"UNAVAILABLE",wash_trade_detection_status:"UNAVAILABLE",execution_enabled:false,is_trading_signal:false};
 const parsed=candles.map((c,i)=>{
  if(!c||!Number.isSafeInteger(c.interval_start_ms)||c.interval_start_ms<0||(i&&c.interval_start_ms<=candles[i-1].interval_start_ms)||typeof c.quote_volume_base_units!=="string"||!/^\d+$/.test(c.quote_volume_base_units))throw Error("INVALID_CANDLE_QUALITY_INPUT");
  return {time:c.interval_start_ms,o:formatQualityPrice(c.open_price),h:formatQualityPrice(c.high_price),l:formatQualityPrice(c.low_price),c:formatQualityPrice(c.close_price),volume:BigInt(c.quote_volume_base_units)};
 });
 const scale=Math.max(...parsed.flatMap(c=>[c.o.scale,c.h.scale,c.l.scale,c.c.scale]));
 const units=p=>p.n*10n**BigInt(scale-p.scale);
 for(const c of parsed){c.o=units(c.o);c.h=units(c.h);c.l=units(c.l);c.c=units(c.c);if(c.l>c.h||c.l>c.o||c.l>c.c||c.h<c.o||c.h<c.c)throw Error("INVALID_CANDLE_RANGE");}
 let gaps=0,zeroVolume=0,totalVolume=0n,maxVolume=0n,maxRange=0n,maxDrawdown=0n,peak=parsed[0].h;
 for(let i=0;i<parsed.length;i++){
  const c=parsed[i];totalVolume+=c.volume;if(c.volume===0n)zeroVolume++;if(c.volume>maxVolume)maxVolume=c.volume;
  const range=qualityBps(c.h-c.l,c.o);if(range!==null&&BigInt(range)>maxRange)maxRange=BigInt(range);
  if(c.h>peak)peak=c.h;const dd=qualityBps(peak-c.l,peak);if(dd!==null&&BigInt(dd)>maxDrawdown)maxDrawdown=BigInt(dd);
  if(i){const delta=c.time-parsed[i-1].time;if(delta!==intervalMs)gaps+=Math.max(1,Math.ceil(delta/intervalMs)-1);}
 }
 const priceChange=qualityBps(parsed.at(-1).c-parsed[0].o,parsed[0].o),concentration=totalVolume?qualityBps(maxVolume,totalVolume):null;
 const alerts=[],largeMove=priceChange!==null&&(BigInt(priceChange)>=2000n||BigInt(priceChange)<=-2000n);
 const add=(code,detail)=>alerts.push({code,severity:qualitySeverity(code),detail});
 if(parsed.length<10)add("LOW_SAMPLE_SIZE","少于 10 根 K 线，样本不足以形成稳定判断");
 if(gaps)add("CANDLE_GAPS","观测区间存在 "+gaps+" 个缺失或不规则间隔");
 if(largeMove)add("LARGE_PRICE_MOVE","观测区间价格变化达到 20% 或以上");
 if(maxRange>=1500n)add("WIDE_INTRABAR_RANGE","至少一根 K 线的高低区间达到开盘价的 15%");
 if(maxDrawdown>=2000n)add("LARGE_OBSERVED_DRAWDOWN","从观测高点到后续低点的回撤达到 20%");
 if(concentration!==null&&BigInt(concentration)>=6000n&&parsed.length>1)add("VOLUME_CONCENTRATION","单根 K 线占总观测成交量至少 60%");
 if(totalVolume===0n)add("NO_OBSERVED_VOLUME","区间内没有可用的报价成交量");
 return {schema_version:"cook-candle-quality.1",status:parsed.length<10?"INSUFFICIENT_OBSERVATIONS":gaps?"OBSERVED_WITH_GAPS":"OBSERVED",candle_count:parsed.length,source:"PUMP_LAB_INDEX",source_attestation:"UNKNOWN",metrics:{missing_interval_count:gaps,zero_volume_candles:zeroVolume,total_quote_volume_base_units:totalVolume.toString(),price_change_bps:priceChange,max_intrabar_range_bps:maxRange.toString(),max_observed_drawdown_bps:maxDrawdown.toString(),max_candle_volume_share_bps:concentration},alerts,buy_sell_flow_status:"UNAVAILABLE_FROM_OHLCV",actor_attribution_status:"UNAVAILABLE_FROM_OHLCV",wash_trade_detection_status:"UNAVAILABLE_FROM_OHLCV",execution_enabled:false,is_trading_signal:false};
}

export async function mountLocalMarket(host,interval,render){
 if(!host)return;
 try{
  const r=await fetch('/api/local-wallet/market-data',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({interval:intervals[interval]}),cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('行情接口不可用');const data=await r.json();
  const candles=mapLabCandles(data.candles),quality=analyzeCandleQuality(candles,{intervalMs:interval});
  if(!host.isConnected)return;
  const main=host.closest('main'),source=host.closest('.pro-chart')?.querySelector('.pro-pane-head small');
  const qualityPanel=main?.querySelector("#market-quality");if(qualityPanel){const summary=qualityPanel.querySelector("[data-quality-summary]"),metrics=qualityPanel.querySelector("[data-quality-metrics]"),alerts=qualityPanel.querySelector("[data-quality-alerts]");const pct=v=>{if(v==null)return "未知";const n=BigInt(v),negative=n<0n,a=negative?-n:n;return (negative?"-":"")+(a/100n)+"."+(a%100n).toString().padStart(2,"0")+"%";};const sol=v=>{const n=BigInt(v);return (n/1000000000n)+"."+(n%1000000000n).toString().padStart(9,"0")+" SOL";};const names={NO_MARKET_DATA:"暂无市场数据",LOW_SAMPLE_SIZE:"样本数量不足",CANDLE_GAPS:"K 线时间缺口",LARGE_PRICE_MOVE:"价格大幅变化",WIDE_INTRABAR_RANGE:"单根波动区间较宽",LARGE_OBSERVED_DRAWDOWN:"观测回撤较大",VOLUME_CONCENTRATION:"成交量集中",NO_OBSERVED_VOLUME:"无可用成交量"};summary.textContent=quality.status+" · "+quality.candle_count+" 根 · 来源认证 UNKNOWN";metrics.replaceChildren();for(const [label,value] of [["价格变化",pct(quality.metrics?.price_change_bps)],["最大观测回撤",pct(quality.metrics?.max_observed_drawdown_bps)],["最大单根波动",pct(quality.metrics?.max_intrabar_range_bps)],["单根成交量占比",pct(quality.metrics?.max_candle_volume_share_bps)],["累计成交量",quality.metrics?sol(quality.metrics.total_quote_volume_base_units):"未知"],["缺失间隔",quality.metrics?.missing_interval_count??"未知"]]){const p=document.createElement("p");p.textContent=label+"："+value;metrics.append(p);}alerts.replaceChildren();for(const alert of quality.alerts){const p=document.createElement("p");p.textContent=(alert.severity==="high"?"[高] ":alert.severity==="medium"?"[中] ":"[低] ")+(names[alert.code]??alert.code)+"："+(alert.detail??"");alerts.append(p);}if(!quality.alerts.length){const p=document.createElement("p");p.textContent="未触发当前阈值告警；不代表市场健康或无操纵。";alerts.append(p);}}
if(source)source.textContent='OHLCV · Pump Lab 索引';const status=main?.querySelector('.pro-statebar span:nth-child(2)');if(status)status.textContent='Pump Lab 索引响应 · '+new Date().toLocaleTimeString();const footer=main?.querySelector('.pro-bottom > span');if(footer)footer.textContent='数据来源：Pump Lab 索引快照（未经历史财务核验）';const heading=main?.querySelector('.pro-project h2');if(heading?.textContent.includes('未选择 Token')){heading.textContent='测试 Token / SOL';const sub=main.querySelector('.pro-project small');if(sub)sub.textContent=data.mint;}
  host.innerHTML=(candles.length?render({status:'CONSISTENT',candles}):'<p>该周期暂无已索引成交。</p>')+'<p class="muted">Pump Lab 索引行情 · 测试池 · 报价成交量为 Pump Lab 的费前名义额（SOL）；历史完整性未独立核验。</p>';
 }catch(e){if(host.isConnected){host.textContent='测试行情不可用；当前数据未知';const main=host.closest('main'),status=main?.querySelector('.pro-statebar span:nth-child(2)'),quality=main?.querySelector("#market-quality");if(status)status.textContent='行情响应失败 · 数据未知';if(quality){quality.querySelector("[data-quality-summary]").textContent="行情不可用 · 数据未知";quality.querySelector("[data-quality-metrics]").replaceChildren();quality.querySelector("[data-quality-alerts]").textContent="未进行质量判断";}}}
 if(host.isConnected)setTimeout(()=>mountLocalMarket(host,interval,render),10000);
}
