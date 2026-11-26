import {mapLabCandles} from "./local-market.mjs";
import {candleTimeLayout,candleLineSegments} from "./terminal-display.mjs";
const INTERVALS={"1m":60000,"5m":300000,"15m":900000,"1h":3600000};
export function scopedIndexCandles(project,response,interval){
 if(project?.network?.cluster!=="localnet"||!project.network.genesis_hash||!project?.token?.mint||!INTERVALS[interval]||response?.mint!==project.token.mint||response.interval!==interval||typeof response.pool!=="string"||!project.markets?.some(m=>m.venue==="PUMP_SWAP"&&m.market_account===response.pool&&m.verification_status==="VERIFIED"))throw Error("MARKET_SCOPE_MISMATCH");
 const candles=mapLabCandles(response.candles);
 if(candles.length&&!candleTimeLayout(candles,INTERVALS[interval]))throw Error("MARKET_INTERVAL_INVALID");
 return candles;
}
export function renderCurrentCandles(candles,interval,style,esc){
 if(!candles.length)return '<div class="empty-state"><strong>No indexed trades</strong><span>No candles available for this interval.</span></div>';
 const points=candles.slice(-80),layout=candleTimeLayout(points,INTERVALS[interval],32,532);
 const values=points.flatMap(c=>[Number(c.low_price),Number(c.high_price)]),lo=Math.min(...values),hi=Math.max(...values),span=hi-lo||hi*.01;
 if(!layout||!Number.isFinite(span)||span<=0)return '<p>Chart precision unavailable.</p>';
 const x=i=>layout.positions[i],y=v=>144-(v-lo)/span*110,w=layout.width;
 const vols=points.map(c=>Number(c.quote_volume_base_units)),max=Math.max(1,...vols);
 let svg='<svg viewBox="0 0 600 205" role="img" aria-label="Indexed price and volume" class="current-ohlcv">';
 for(const fraction of [0,.5,1]){const p=lo+span*fraction;svg+='<path d="M26 '+y(p)+' H536" stroke="#304049"/><text x="598" y="'+(y(p)+3)+'" text-anchor="end" fill="#93a5ae" font-size="10">'+esc(p.toPrecision(5))+'</text>';}
 points.forEach((c,i)=>{const o=Number(c.open_price),cl=Number(c.close_price),col=cl>=o?"#42dfb1":"#ff8293",xx=x(i),hh=y(Number(c.high_price)),ll=y(Number(c.low_price));svg+='<g><title>'+esc(new Date(c.interval_start_ms).toISOString()+" · O "+c.open_price+" H "+c.high_price+" L "+c.low_price+" C "+c.close_price)+'</title>';
 if(style==="candles")svg+='<path d="M'+xx+' '+hh+' V'+ll+'" stroke="'+col+'"/><rect x="'+(xx-w/2)+'" y="'+Math.min(y(o),y(cl))+'" width="'+w+'" height="'+Math.max(1,Math.abs(y(o)-y(cl)))+'" fill="'+col+'"/>';
 if(style==="bars")svg+='<path d="M'+xx+' '+hh+' V'+ll+' M'+(xx-w/2)+' '+y(o)+' H'+xx+' M'+xx+' '+y(cl)+' H'+(xx+w/2)+'" stroke="'+col+'" fill="none"/>';
 if(style==="line")svg+='<circle cx="'+xx+'" cy="'+y(cl)+'" r="1.8" fill="#55d6f4"/>';
 const h=vols[i]/max*28;svg+='<rect x="'+(xx-w/2)+'" y="'+(181-h)+'" width="'+w+'" height="'+h+'" fill="'+col+'" opacity=".55"/></g>'});
 if(style==="line")for(const group of candleLineSegments(points,INTERVALS[interval]))if(group.length>1)svg+='<polyline points="'+group.map(i=>x(i)+","+y(Number(points[i].close_price))).join(" ")+'" stroke="#55d6f4" stroke-width="1.5" fill="none"/>';
 return svg+'<text x="26" y="198" fill="#93a5ae" font-size="9">'+esc(new Date(points[0].interval_start_ms).toISOString())+'</text><text x="536" y="198" fill="#93a5ae" font-size="9" text-anchor="end">'+esc(new Date(points.at(-1).interval_start_ms).toISOString())+'</text></svg><p class="muted">'+points.length+' candles · UTC · '+layout.missing_intervals+' missing intervals · Indexed data, network provenance not independently verified.</p>';
}
export function mountCurrentMarket(host,{esc,fetchImpl=globalThis.fetch}){
 let project=null,interval="1m",style="candles",candles=null,epoch=0,timer=null,disposed=false,status="Select a Meme.",controller=null;
 host.innerHTML='<div class="desk-chart-tools"><div class="row current-chart-intervals">'+Object.keys(INTERVALS).map(i=>'<button type="button" data-current-interval="'+i+'">'+i+'</button>').join("")+'</div><div class="row">'+["candles","bars","line"].map(s=>'<button type="button" data-current-style="'+s+'">'+s[0].toUpperCase()+s.slice(1)+'</button>').join("")+'<button type="button" data-current-market-refresh>Refresh</button></div></div><div data-current-chart class="current-chart"></div><p class="muted" data-current-market-status role="status"></p>';
 const q=s=>host.querySelector(s);
 function draw(){host.querySelectorAll("[data-current-interval]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.currentInterval===interval)));host.querySelectorAll("[data-current-style]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.currentStyle===style)));q("[data-current-chart]").innerHTML=candles===null?'<div class="empty-state"><strong>'+esc(project?.token?.mint?"Market data unavailable":"No token selected")+'</strong><span>'+esc(status)+'</span></div>':renderCurrentCandles(candles,interval,style,esc);q("[data-current-market-status]").textContent=status;}
 async function refresh(){clearTimeout(timer);controller?.abort();const own=++epoch,current=project;const selectedInterval=interval;controller=new AbortController();
 if(disposed||!current?.token?.mint||current.network?.cluster!=="localnet"||!current.network?.genesis_hash||!current.markets?.some(m=>m.venue==="PUMP_SWAP"&&m.verification_status==="VERIFIED")){candles=null;status=current?.token?.mint?"Verified PumpSwap market binding required.":"Select an issued Meme.";draw();return;}
 candles=null;status="Reading Pump Lab index…";draw();
 try{const response=await fetchImpl("/api/local-wallet/market-data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({interval:selectedInterval}),cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])});if(!response.ok)throw Error("MARKET_UNAVAILABLE");const data=await response.json();if(disposed||own!==epoch||!host.isConnected)return;candles=scopedIndexCandles(current,data,selectedInterval);status="Pump Lab index · Observed "+new Date().toISOString()+" · Genesis not attested by the index.";}catch{if(disposed||own!==epoch||!host.isConnected)return;candles=null;status="Index unavailable or market identity mismatch.";}
 if(!disposed&&own===epoch&&host.isConnected){draw();timer=setTimeout(()=>{if(!host.hidden&&host.ownerDocument.visibilityState!=="hidden")void refresh();else timer=setTimeout(()=>void refresh(),15000)},15000)}
 }
 host.querySelectorAll("[data-current-interval]").forEach(b=>b.onclick=()=>{interval=b.dataset.currentInterval;void refresh()});host.querySelectorAll("[data-current-style]").forEach(b=>b.onclick=()=>{style=b.dataset.currentStyle;draw()});q("[data-current-market-refresh]").onclick=refresh;draw();
 return {setProject(next){project=next;void refresh()},refresh,dispose(){disposed=true;epoch++;clearTimeout(timer);controller?.abort()}};
}
