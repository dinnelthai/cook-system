import {mountTradeTicket} from "./trade-ticket-view.mjs";
import {mountCurrentMarket} from "./current-market-view.mjs";
// Current terminal deliberately excludes historical reports, accounting and audit views.
export function currentTerminalProject(project){
 if(!project)return null;
 return {project_id:project.project_id,name:project.profile?.name??"",symbol:project.profile?.symbol??"",mint:project.token?.mint??null,network:project.network?.cluster??null,stage:project.lifecycle?.stage??"UNKNOWN"};
}
export function mountCurrentTerminal({main,nav,esc,activeProjectId,getProjectDirectory,mountPositionSnapshot,mountProjectSetup,screenHeading,panel,note,table,download,projectRegistry,record,errorKind,projectMessage,isActive,onNavigate,onSelect,initialMode,onMode}){
 let disposed=false,project=null,projects=[],mode=initialMode==="launch"?"launch":"operations",query="",directoryTicket=0,launchMounted=false;
 const alive=()=>!disposed&&isActive()&&main.isConnected;
 nav.innerHTML='<section class="meme-rail"><div class="desk-overview"><div class="desk-overview-title"><strong>My Assets</strong><span>Localnet</span></div><div class="desk-balance"><small>Selected Meme SOL Balance</small><strong data-current-sol>—</strong></div><div class="desk-overview-stats"><div><small>Memes</small><strong data-current-count>—</strong></div><div><small>Registered Wallets</small><strong data-current-wallet-count>—</strong></div></div><button type="button" data-manage-wallets>Manage Wallets</button></div><div class="meme-rail-head"><strong>My Memes</strong><button type="button" data-new-meme aria-label="New Meme">＋</button></div><label>Search Memes<input type="search" data-meme-search placeholder="Name / Symbol / Mint"></label><div data-current-memes role="status">Loading Memes…</div><button type="button" data-launch-meme>＋ Launch Meme</button></section>';
 main.innerHTML='<div class="meme-desk current-terminal"><section class="meme-center"><section class="cook-position-strip"><div class="cook-position-head"><div><small>CURRENT MEME</small><h2 data-current-symbol>No Meme Selected</h2></div><span class="cook-data-label" data-current-stage>Localnet</span></div><div class="row"><label>Project <select id="terminal-project-select" disabled><option value="">Select Project</option></select></label><button type="button" data-current-reload>Refresh</button></div><p class="muted" data-current-mint>—</p></section><section class="desk-market-frame"><div class="meme-chart-toolbar"><div class="desk-market-title"><strong>Market</strong><small>Current market data</small></div><div class="desk-market-actions"><button type="button" data-market-swap aria-label="Swap chart and wallets">⇅</button><button type="button" data-market-fullscreen>Fullscreen</button><button type="button" data-market-toggle aria-expanded="true">Minimize</button></div></div><div data-market-body></div></section><section class="meme-lower"><div class="meme-lower-tabs" role="group" aria-label="Current Meme Details"><button type="button" aria-pressed="true">Wallets</button></div><section class="meme-wallet" data-current-wallets></section></section></section><aside class="meme-control"><div class="meme-mode" role="group" aria-label="Workspace Mode"><button type="button" data-current-mode="operations">Trade</button><button type="button" data-current-mode="launch">Launch</button></div><div data-current-trade class="smith-trade"></div><div data-current-launch class="terminal-launch-only" hidden></div></aside></div>';
 const q=s=>main.querySelector(s),n=s=>nav.querySelector(s),walletHost=q("[data-current-wallets]"),launchHost=q("[data-current-launch]");
 const market=mountCurrentMarket(q("[data-market-body]"),{esc});
 const frame=q(".desk-market-frame"),fullscreen=q("[data-market-fullscreen]");fullscreen.disabled=typeof frame.requestFullscreen!=="function";fullscreen.onclick=async()=>{try{if(frame.ownerDocument.fullscreenElement===frame)await frame.ownerDocument.exitFullscreen();else{const body=q("[data-market-body]");if(body.hidden)q("[data-market-toggle]").click();await frame.requestFullscreen()}}catch{fullscreen.title="Fullscreen unavailable"}};frame.addEventListener("fullscreenchange",()=>{fullscreen.textContent=frame.ownerDocument.fullscreenElement===frame?"Exit Fullscreen":"Fullscreen"});
 let selectTradeWallet=()=>{};const trade=mountTradeTicket(q("[data-current-trade]"),{esc,onWalletSelect:address=>selectTradeWallet(address)});
 function drawHoldings(model){
  if(!alive())return;
  if(model&&(model.project_id!==(project?.project_id??null)||model.mint!==(project?.token?.mint??null)))return;
  n("[data-current-sol]").textContent=model?.sol??"—";
  n("[data-current-wallet-count]").textContent=project?String(model?.count??0):"—";
  if(model)trade.setWallets(model);
 }
 const wallet=mountPositionSnapshot(walletHost,{esc,currentOnly:true,onManage:()=>onNavigate("wallet"),onAssets:()=>onNavigate("wallet"),onSummary:drawHoldings});
 selectTradeWallet=address=>wallet.selectWallet(address);
 function list(){
  const search=query.trim().toLowerCase(),visible=projects.filter(p=>[p.profile?.name,p.profile?.symbol,p.token?.mint].some(v=>String(v??"").toLowerCase().includes(search)));
  n("[data-current-count]").textContent=String(projects.length);
  n("[data-current-memes]").innerHTML=visible.map(p=>'<button type="button" class="meme-project '+(p.project_id===activeProjectId?"selected":"")+'" data-current-id="'+esc(p.project_id)+'"><span class="meme-avatar">'+esc((p.profile?.symbol??"?").slice(0,2))+'</span><span class="meme-project-label"><strong>'+esc(p.profile?.symbol)+'</strong><small>'+esc(p.profile?.name)+'</small></span></button>').join("")||'<p class="muted">'+(search?"No matching Memes":"No Memes yet")+'</p>';
  n("[data-current-memes]").querySelectorAll("[data-current-id]").forEach(b=>b.onclick=()=>{onMode("operations");onNavigate("terminal",b.dataset.currentId)});
 }
 function drawProject(){
  const p=currentTerminalProject(project);
  q("[data-current-symbol]").textContent=p?.symbol||"No Meme Selected";q("[data-current-stage]").textContent=p?.stage?.replaceAll("_"," ")??"Localnet";
  q("[data-current-mint]").textContent=p?.mint?"Mint: "+p.mint:"No registered token mint";
  market.setProject(project);
  trade.setProject(project);wallet.setProject(project);
 }
 async function load(){
  const own=++directoryTicket;q("[data-current-reload]").disabled=true;
  try{const result=await getProjectDirectory();if(!alive()||own!==directoryTicket)return;
   projects=result.projects;project=projects.find(p=>p.project_id===activeProjectId)??null;
   const select=q("#terminal-project-select");select.innerHTML='<option value="">Select Project</option>'+projects.map(p=>'<option value="'+esc(p.project_id)+'"'+(p.project_id===activeProjectId?" selected":"")+'>'+esc(p.profile?.symbol+" · "+p.profile?.name)+'</option>').join("");select.disabled=false;list();drawProject();
  }catch{if(!alive()||own!==directoryTicket)return;project=null;projects=[];const select=q("#terminal-project-select");select.innerHTML='<option value="">Select Project</option>';select.disabled=true;drawProject();drawHoldings(null);n("[data-current-count]").textContent="—";n("[data-current-memes]").textContent="Project directory unavailable. Retry.";}
  finally{if(alive()&&own===directoryTicket)q("[data-current-reload]").disabled=false}
 }
 function drawMode(){
  q("[data-current-trade]").hidden=mode!=="operations";launchHost.hidden=mode!=="launch";
  q("[data-current-launch]").classList.toggle("terminal-launch-only",mode==="launch");
  main.querySelectorAll("[data-current-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.currentMode===mode)));
  if(mode==="launch"&&!launchMounted){launchMounted=true;mountProjectSetup(launchHost,{terminalMode:true,initialProjectId:activeProjectId,initialMessage:projectMessage,onActiveProjectId:id=>{onSelect(id);activeProjectId=id;void load()},isActive:()=>alive()&&mode==="launch",screenHeading,panel,note,table,esc,download,projectRegistry,record,errorKind});}
 }
 function openNew(){onMode("launch");onNavigate("terminal",null)}
 n("[data-new-meme]").onclick=openNew;n("[data-launch-meme]").onclick=openNew;n("[data-manage-wallets]").onclick=()=>onNavigate("wallet");
 n("[data-meme-search]").oninput=e=>{query=e.target.value;list()};
 q("#terminal-project-select").onchange=e=>{onMode("operations");onNavigate("terminal",e.target.value||null)};
 q("[data-current-reload]").onclick=async()=>{await load();if(alive()&&project)void wallet.refresh()};
 q("[data-market-swap]").onclick=()=>{const center=q(".meme-center"),lower=q(".meme-lower");if(frame.nextElementSibling===lower)frame.before(lower);else lower.before(frame)};
 q("[data-market-toggle]").onclick=e=>{const body=q("[data-market-body]");body.hidden=!body.hidden;e.target.textContent=body.hidden?"Expand":"Minimize";e.target.setAttribute("aria-expanded",String(!body.hidden))};
 main.querySelectorAll("[data-current-mode]").forEach(b=>b.onclick=()=>{const next=b.dataset.currentMode;if(next===mode)return;if(mode==="launch"){onMode(next);onNavigate("terminal",activeProjectId);return;}mode=next;onMode(mode);drawMode()});
 drawMode();void load();return ()=>{disposed=true;directoryTicket++;wallet.dispose();market.dispose()};
}
