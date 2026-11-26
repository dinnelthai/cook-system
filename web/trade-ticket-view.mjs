import {formatUnits,previewQuantity} from "./position-snapshot-view.mjs";
const raw=v=>typeof v==="string"&&/^(0|[1-9][0-9]{0,38})$/.test(v);
export function parseTicketAmount(value,decimals){
 const s=String(value).trim();if(!Number.isInteger(decimals)||decimals<0||decimals>18||!/^\d{1,20}(?:\.\d{1,18})?$/.test(s))return null;
 const [whole,frac=""]=s.split(".");if(frac.length>decimals)return null;
 const n=BigInt(whole)*10n**BigInt(decimals)+BigInt(frac.padEnd(decimals,"0")||"0");
 return n>0n&&n<(1n<<64n)?n.toString():null;
}
export function validateTicket({side,amount,wallet}){
 if(!wallet)return {status:"SELECT_WALLET"};
 if(!["BUY","SELL"].includes(side))return {status:"INVALID_SIDE"};
 const decimals=side==="BUY"?9:wallet.decimals,balance=side==="BUY"?wallet.sol:wallet.tokens;
 if(!raw(balance)||!Number.isInteger(decimals))return {status:"BALANCE_UNKNOWN"};
 const quantity=parseTicketAmount(amount,decimals);
 if(!quantity)return {status:"INVALID_AMOUNT"};
 if(BigInt(quantity)>BigInt(balance))return {status:"INSUFFICIENT_BALANCE"};
 return {status:"INPUT_VALID",quantity,remaining:(BigInt(balance)-BigInt(quantity)).toString(),decimals};
}
export function mountTradeTicket(host,{esc,onWalletSelect}){
 let project=null,rows=[],address=null,side="BUY",amount="",review=false,observationBusy=false;
 const q=s=>host.querySelector(s),short=s=>s.length>16?s.slice(0,7)+"…"+s.slice(-5):s;
 host.innerHTML='<section class="smith-section current-trade-ticket"><div class="trade-heading"><h3>Trade</h3><small>Localnet</small></div><div class="bundle-direction" role="group" aria-label="Trade side"><button type="button" data-ticket-side="BUY">Buy</button><button type="button" data-ticket-side="SELL">Sell</button></div><label>Wallet<select data-ticket-wallet><option value="">Select wallet</option></select></label><div class="trade-kv"><span>SOL Balance</span><strong data-ticket-sol>—</strong><span>Token Balance</span><strong data-ticket-tokens>—</strong></div><label data-ticket-label for="trade-amount">Amount (SOL)</label><input id="trade-amount" data-ticket-amount type="text" inputmode="decimal" placeholder="0.00" autocomplete="off"><div class="row" data-ticket-percent hidden>'+[25,50,75,100].map(n=>'<button type="button" data-ticket-pct="'+n+'">'+n+'%</button>').join("")+'</div><p data-ticket-message class="trade-hint" role="status"></p><div class="trade-kv"><span>Estimated Receive</span><strong>Quote required</strong><span>Network Fee</span><strong>Quote required</strong></div><button type="button" class="primary smith-action" data-ticket-review>Review Input</button><div data-ticket-review-panel hidden class="ticket-review-panel"><h4>Input Review</h4><div class="trade-kv"><span>Wallet</span><strong data-review-wallet></strong><span>Side</span><strong data-review-side></strong><span>Amount</span><strong data-review-amount></strong><span>Remaining balance before fees</span><strong data-review-remaining></strong></div><p class="trade-hint">Input validated against the observed balance only. This is not a market quote or order.</p><button type="button" data-ticket-edit>Edit</button></div></section><section class="smith-section"><h3>Transaction Status</h3><p class="trade-hint">Execution: DISABLED</p><p class="muted">Quote and submission service not connected. No transaction created.</p></section>';
 const selected=()=>rows.find(r=>r.address===address);
 const display=(v,d)=>v==="0"?"0":formatUnits(v,d);
 function draw(){
  const row=selected(),result=validateTicket({side,amount,wallet:row}),ok=result.status==="INPUT_VALID"&&!observationBusy&&!!project?.token?.mint;
  const dropdown=q("[data-ticket-wallet]");dropdown.innerHTML='<option value="">Select wallet</option>'+rows.map(r=>'<option value="'+esc(r.address)+'"'+(r.address===address?" selected":"")+'>'+esc(short(r.address))+'</option>').join("");dropdown.disabled=!rows.length;
  host.querySelectorAll("[data-ticket-side]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.ticketSide===side)));
  q("[data-ticket-sol]").textContent=display(row?.sol,9);q("[data-ticket-tokens]").textContent=display(row?.tokens,row?.decimals);
  q("[data-ticket-label]").textContent="Amount ("+(side==="BUY"?"SOL":project?.profile?.symbol||"Tokens")+")";
  const input=q("[data-ticket-amount]");if(input.value!==amount)input.value=amount;input.disabled=!row||!project?.token?.mint;
  q("[data-ticket-percent]").hidden=side!=="SELL";host.querySelectorAll("[data-ticket-pct]").forEach(b=>b.disabled=!row||!raw(row.tokens)||!Number.isInteger(row.decimals)||observationBusy);
  q("[data-ticket-message]").textContent=observationBusy?"Refreshing wallet observation…":!project?.token?.mint?"Select an issued Meme.":({SELECT_WALLET:"Select a wallet from the table or dropdown.",BALANCE_UNKNOWN:"Wallet balance unavailable.",INVALID_AMOUNT:"Enter a positive amount in supported precision.",INSUFFICIENT_BALANCE:"Amount exceeds observed balance.",INPUT_VALID:"Amount within observed balance; fees not included."}[result.status]??"Check input.");
  q("[data-ticket-review]").disabled=!ok;q("[data-ticket-review-panel]").hidden=!review||!ok;
  if(review&&ok){q("[data-review-wallet]").textContent=address;q("[data-review-side]").textContent=side;q("[data-review-amount]").textContent=amount;q("[data-review-remaining]").textContent=display(result.remaining,result.decimals);}
 }
 host.querySelectorAll("[data-ticket-side]").forEach(b=>b.onclick=()=>{side=b.dataset.ticketSide;amount="";review=false;draw()});
 q("[data-ticket-wallet]").onchange=e=>{address=e.target.value||null;amount="";review=false;onWalletSelect(address);draw()};
 q("[data-ticket-amount]").oninput=e=>{amount=e.target.value;review=false;draw()};
 host.querySelectorAll("[data-ticket-pct]").forEach(b=>b.onclick=()=>{const row=selected(),p=previewQuantity(row?.tokens,Number(b.dataset.ticketPct));if(p){amount=display(p.quantity,row.decimals);review=false;draw()}});
 q("[data-ticket-review]").onclick=()=>{review=true;draw()};q("[data-ticket-edit]").onclick=()=>{review=false;draw();q("[data-ticket-amount]").focus()};
 draw();return {setProject(next){const changed=project?.project_id!==next?.project_id||project?.revision!==next?.revision||project?.token?.mint!==next?.token?.mint;project=next;if(changed){rows=[];address=null;side="BUY";amount="";review=false;observationBusy=false}draw()},setWallets(model){if(model.project_id!==(project?.project_id??null)||model.mint!==(project?.token?.mint??null))return;rows=model.rows;observationBusy=model.busy;const next=rows.some(r=>r.address===model.active)?model.active:null;if(next!==address){address=next;amount=""}review=false;draw()}};
}
