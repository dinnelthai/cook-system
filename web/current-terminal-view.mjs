import {mountTradePanelPreview} from "./trade-panel-preview.mjs";
import {mountTradeTicket} from "./trade-ticket-view.mjs";
import {mountCurrentMarket} from "./current-market-view.mjs";
// Current terminal deliberately excludes historical reports, accounting and audit views.
const PANEL_KEY="cook.current-terminal.trade-panel-collapsed";
export function readTradePanelCollapsed(storage){try{return storage?.getItem(PANEL_KEY)==="true"}catch{return false}}
export function writeTradePanelCollapsed(storage,value){try{storage?.setItem(PANEL_KEY,String(Boolean(value)))}catch{}}
export function currentTerminalProject(project){
 if(!project)return null;
 return {project_id:project.project_id,name:project.profile?.name??"",symbol:project.profile?.symbol??"",mint:project.token?.mint??null,network:project.network?.cluster??null,stage:project.lifecycle?.stage??"UNKNOWN"};
}
export function mountCurrentTerminal({main,nav,esc,activeProjectId,getProjectDirectory,mountPositionSnapshot,mountProjectSetup,screenHeading,panel,note,table,download,projectRegistry,record,errorKind,projectMessage,isActive,onNavigate,onSelect,initialMode,onMode}){
 let disposed=false,project=null,projects=[],mode=initialMode==="launch"?"launch":"operations",query="",directoryTicket=0,launchMounted=false;
 let storage=null;try{storage=main.ownerDocument.defaultView.sessionStorage}catch{}
 let panelCollapsed=mode!=="launch"&&readTradePanelCollapsed(storage);
 const alive=()=>!disposed&&isActive()&&main.isConnected;
 nav.innerHTML='<section class="meme-rail"><div class="desk-overview"><div class="desk-overview-title"><strong>Overview</strong><span>Solana · Localnet</span></div><div class="desk-balance"><small>SOL Balance · Selected Meme</small><strong data-current-sol>—</strong></div><div class="desk-overview-stats"><div><small>Memes</small><strong data-current-count>—</strong></div><div><small>Wallets</small><strong data-current-wallet-count>—</strong></div></div><button type="button" data-manage-wallets>Manage Wallets</button></div><div class="meme-rail-head"><strong>My Memes</strong><button type="button" data-new-meme aria-label="New Meme">＋</button></div><label>Search Memes<input type="search" data-meme-search placeholder="Name / Symbol / Mint"></label><div data-current-memes role="status">Loading Memes…</div><button type="button" data-launch-meme>＋ Launch Meme</button><div class="reference-rail-project" data-rail-project></div><div class="reference-rail-footer"><span>Localnet Wallets</span><button type="button" data-rail-wallet>Manage</button></div></section>';
 main.innerHTML='<div class="meme-desk current-terminal"><section class="meme-center"><section class="cook-position-strip reference-project-select"><div class="cook-position-head"><div><small>SELECT TOKEN</small><h2 data-current-symbol>No Meme Selected</h2></div><span class="cook-data-label" data-current-stage>Localnet</span></div><div class="row"><label>Project <select id="terminal-project-select" disabled><option value="">Select Project</option></select></label><button type="button" data-current-reload>Refresh</button></div><p class="muted" data-current-mint>—</p></section><section class="desk-market-frame"><div class="meme-chart-toolbar"><div class="desk-market-title"><strong>Market</strong><small data-market-symbol>Current market data</small></div><div class="desk-market-actions"><button type="button" data-single-ticket aria-pressed="false">Single Wallet Trade</button><button type="button" data-market-swap aria-label="Swap chart and wallets">⇅</button><button type="button" data-market-fullscreen>Fullscreen</button><button type="button" data-market-toggle aria-expanded="true">Minimize Chart ↑</button></div></div><div data-market-body></div></section><section class="meme-lower"><div class="reference-workspace-divider" aria-hidden="true"><span>⠿</span></div><div class="meme-lower-tabs" role="group" aria-label="Current Meme Details"><button type="button" aria-pressed="true">Wallets</button></div><section class="meme-wallet" data-current-wallets></section></section><footer class="reference-terminal-footer"><span class="reference-footer-dot"></span><span>Localnet · Read-only observation</span><span data-reference-note>Trade panel preview · No orders or live quotes.</span><button type="button" data-footer-refresh>Refresh</button><button type="button" data-footer-settings>Settings</button></footer></section><aside id="current-trade-panel" class="meme-control reference-trade-panel" aria-label="Trade / Launch"><div class="reference-panel-chrome"><button type="button" data-panel-collapse aria-label="Hide trading panel" title="Hide trading panel"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button></div><div class="meme-mode" role="group" aria-label="Workspace Mode"><button type="button" data-current-mode="operations"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v17h18M7 13l5-5 4 3 5-6"/></svg>Trade</button><button type="button" data-current-mode="launch"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M13 3c3-2 7-1 8-1 0 3 0 7-3 10l-5 5-5-5 5-9zm4 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM8 7 4 8l-3 4 6 1 1-6zm8 9-1 4-4 3-1-6 6-1zM6 15l3 3-5 3 2-6z"/></svg>Launch</button></div><div data-reference-trade></div><div data-current-trade class="smith-trade" hidden></div><div data-current-launch class="terminal-launch-only" hidden></div></aside><button type="button" class="reference-panel-edge" data-panel-expand aria-label="Open trading panel" aria-controls="current-trade-panel" aria-expanded="false" title="Open trading panel" hidden><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg><span>Trade / Launch</span></button></div>';
 const q=s=>main.querySelector(s)||nav.querySelector(s),n=s=>nav.querySelector(s),walletHost=q("[data-current-wallets]"),launchHost=q("[data-current-launch]");
 n("[data-rail-project]").append(q(".reference-project-select"));
 const desk=q(".current-terminal"),rightPanel=q("#current-trade-panel"),edge=q("[data-panel-expand]"),collapse=q("[data-panel-collapse]");
 function setPanelCollapsed(value,{focus=false}={}){panelCollapsed=Boolean(value);desk.classList.toggle("desk-panel-hidden",panelCollapsed);rightPanel.hidden=panelCollapsed;edge.hidden=!panelCollapsed;edge.setAttribute("aria-expanded",String(!panelCollapsed));writeTradePanelCollapsed(storage,panelCollapsed);if(focus)(panelCollapsed?edge:collapse).focus({preventScroll:true});}
 collapse.onclick=()=>setPanelCollapsed(true,{focus:true});edge.onclick=()=>setPanelCollapsed(false,{focus:true});
 setPanelCollapsed(panelCollapsed);
 const market=mountCurrentMarket(q("[data-market-body]"),{esc});
 const frame=q(".desk-market-frame"),fullscreen=q("[data-market-fullscreen]");fullscreen.disabled=typeof frame.requestFullscreen!=="function";fullscreen.onclick=async()=>{try{if(frame.ownerDocument.fullscreenElement===frame)await frame.ownerDocument.exitFullscreen();else{const body=q("[data-market-body]");if(body.hidden)q("[data-market-toggle]").click();await frame.requestFullscreen()}}catch{fullscreen.title="Fullscreen unavailable"}};frame.addEventListener("fullscreenchange",()=>{fullscreen.textContent=frame.ownerDocument.fullscreenElement===frame?"Exit Fullscreen":"Fullscreen"});
 let showSingle=false;mountTradePanelPreview(q("[data-reference-trade]"));let selectTradeWallet=()=>{};const trade=mountTradeTicket(q("[data-current-trade]"),{esc,onWalletSelect:address=>selectTradeWallet(address)});
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
  q("[data-current-symbol]").textContent=p?.symbol||"No Meme Selected";q("[data-market-symbol]").textContent=p?.symbol?p.symbol+" / SOL":"Current market data";q("[data-current-stage]").textContent=p?.stage?.replaceAll("_"," ")??"Localnet";
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
  q("[data-reference-trade]").hidden=mode!=="operations"||showSingle;q("[data-current-trade]").hidden=mode!=="operations"||!showSingle;launchHost.hidden=mode!=="launch";q("[data-single-ticket]").setAttribute("aria-pressed",String(showSingle));q("[data-single-ticket]").hidden=mode!=="operations";q("[data-reference-note]").hidden=mode!=="operations"||showSingle;
  q("[data-current-launch]").classList.toggle("terminal-launch-only",mode==="launch");
  main.querySelectorAll("[data-current-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.currentMode===mode)));
  if(mode==="launch"&&!launchMounted){launchMounted=true;mountProjectSetup(launchHost,{terminalMode:true,initialProjectId:activeProjectId,initialMessage:projectMessage,onActiveProjectId:id=>{onSelect(id);activeProjectId=id;void load()},isActive:()=>alive()&&mode==="launch",screenHeading,panel,note,table,esc,download,projectRegistry,record,errorKind});}
 }
 function openNew(){setPanelCollapsed(false);onMode("launch");onNavigate("terminal",null)}
 n("[data-rail-wallet]").onclick=()=>onNavigate("wallet");q("[data-footer-settings]").onclick=()=>onNavigate("logs");q("[data-footer-refresh]").onclick=()=>q("[data-current-reload]").click();n("[data-new-meme]").onclick=openNew;n("[data-launch-meme]").onclick=openNew;n("[data-manage-wallets]").onclick=()=>onNavigate("wallet");
 n("[data-meme-search]").oninput=e=>{query=e.target.value;list()};
 q("#terminal-project-select").onchange=e=>{onMode("operations");onNavigate("terminal",e.target.value||null)};
 q("[data-current-reload]").onclick=async()=>{await load();if(alive()&&project)void wallet.refresh()};
 q("[data-single-ticket]").onclick=()=>{showSingle=!showSingle;setPanelCollapsed(false);drawMode()};
 q("[data-market-swap]").onclick=()=>{const center=q(".meme-center");center.classList.toggle("desk-wallet-first")};
 q("[data-market-toggle]").onclick=e=>{const body=q("[data-market-body]");body.hidden=!body.hidden;e.target.textContent=body.hidden?"Expand Chart ↓":"Minimize Chart ↑";e.target.setAttribute("aria-expanded",String(!body.hidden))};
 main.querySelectorAll("[data-current-mode]").forEach(b=>b.onclick=()=>{const next=b.dataset.currentMode;if(next===mode)return;if(mode==="launch"){onMode(next);onNavigate("terminal",activeProjectId);return;}mode=next;onMode(mode);drawMode()});
 drawMode();void load();return ()=>{disposed=true;directoryTicket++;wallet.dispose();market.dispose()};
}
