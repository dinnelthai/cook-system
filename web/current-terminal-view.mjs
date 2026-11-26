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
 let disposed=false,project=null,projects=[],mode=initialMode==="launch"?"launch":"operations",directoryTicket=0,launchMounted=false;
 let storage=null;try{storage=main.ownerDocument.defaultView.sessionStorage}catch{}
 let panelCollapsed=mode!=="launch"&&readTradePanelCollapsed(storage);
 const alive=()=>!disposed&&isActive()&&main.isConnected;
 nav.innerHTML='<section class="meme-rail reference-token-rail"><div class="reference-chain-tabs" role="group" aria-label="Network"><button type="button" aria-pressed="true" data-chain="solana"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h17l-4 5H1z" fill="#42d9c3"/><path d="M1 10h17l4 5H5z" fill="#8399dd"/><path d="M5 17h17l-4 5H1z" fill="#b776da"/></svg>Solana</button><button type="button" data-chain="robinhood" disabled title="Network not connected"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M21 3c-4-3-10 0-13 5L3 19l5-3 3-1-1-2 4-1-1-2 4-1c3-2 5-4 4-6zM2 22l10-10 1 1L3 23z"/></svg>Robinhood</button></div><div class="reference-overview"><h2>Overview</h2><div class="reference-asset-card reference-sol-card"><small>SOL Balance</small><strong data-current-sol>—</strong><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h17l-4 5H1z" fill="#42d9c3"/><path d="M1 10h17l4 5H5z" fill="#8399dd"/><path d="M5 17h17l-4 5H1z" fill="#b776da"/></svg></div><div class="reference-asset-grid"><div class="reference-asset-card"><small>Tokens</small><strong data-current-count>—</strong><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2"><ellipse cx="12" cy="9" rx="9" ry="5"/><path d="M3 9v5c0 3 4 5 9 5s9-2 9-5V9M7 15v3m5-3v4m5-4v3"/></svg></div><div class="reference-asset-card"><small>Wallets</small><strong data-current-wallet-count>0</strong><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M3 5a3 3 0 0 1 3-3h14v2H6a1 1 0 0 0 0 2h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a3 3 0 0 1-3-3zm15 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg></div></div></div><div class="reference-token-select"><h2>Select Token</h2><form data-token-form><div class="reference-token-symbol"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2"><ellipse cx="12" cy="9" rx="9" ry="5"/><path d="M3 9v5c0 3 4 5 9 5s9-2 9-5V9M7 15v3m5-3v4m5-4v3"/></svg></div><div class="reference-token-address"><input id="terminal-project-select" aria-label="Token address" placeholder="Paste Token Address" autocomplete="off" spellcheck="false" disabled><button type="button" data-token-paste title="Paste Token Address" aria-label="Paste Token Address"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><rect x="7" y="2" width="13" height="16" rx="3"/><path d="M4 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1H6V7z"/></svg></button></div></form><p data-token-status class="muted" role="status" hidden></p></div></section>';
 main.innerHTML='<div class="meme-desk current-terminal"><section class="meme-center"><section class="desk-market-frame"><div class="meme-chart-toolbar"><div class="desk-market-title"><strong>Market</strong><small data-market-symbol>Current market data</small></div><div class="desk-market-actions"><button type="button" data-single-ticket aria-pressed="false">Single Wallet Trade</button><button type="button" data-market-swap aria-label="Swap chart and wallets">⇅</button><button type="button" data-market-fullscreen>Fullscreen</button><button type="button" data-market-toggle aria-expanded="true">Minimize Chart ↑</button></div></div><div data-market-body></div></section><section class="meme-lower"><div class="reference-workspace-divider" aria-hidden="true"><span>⠿</span></div><div class="meme-lower-tabs" role="group" aria-label="Current Meme Details"><button type="button" aria-pressed="true">Wallets</button></div><section class="meme-wallet" data-current-wallets></section></section><footer class="reference-terminal-footer"><span class="reference-footer-dot"></span><span>Localnet · Read-only observation</span><span data-reference-note>Trade panel preview · No orders or live quotes.</span><button type="button" data-footer-refresh>Refresh</button><button type="button" data-footer-settings>Settings</button></footer></section><aside id="current-trade-panel" class="meme-control reference-trade-panel" aria-label="Trade / Launch"><div class="reference-panel-chrome"><button type="button" data-panel-collapse aria-label="Hide trading panel" title="Hide trading panel"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button></div><div class="meme-mode" role="group" aria-label="Workspace Mode"><button type="button" data-current-mode="operations"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v17h18M7 13l5-5 4 3 5-6"/></svg>Trade</button><button type="button" data-current-mode="launch"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M13 3c3-2 7-1 8-1 0 3 0 7-3 10l-5 5-5-5 5-9zm4 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM8 7 4 8l-3 4 6 1 1-6zm8 9-1 4-4 3-1-6 6-1zM6 15l3 3-5 3 2-6z"/></svg>Launch</button></div><div data-reference-trade></div><div data-current-trade class="smith-trade" hidden></div><div data-current-launch class="terminal-launch-only" hidden></div></aside><button type="button" class="reference-panel-edge" data-panel-expand aria-label="Open trading panel" aria-controls="current-trade-panel" aria-expanded="false" title="Open trading panel" hidden><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg><span>Trade / Launch</span></button></div>';
 const q=s=>main.querySelector(s)||nav.querySelector(s),n=s=>nav.querySelector(s),walletHost=q("[data-current-wallets]"),launchHost=q("[data-current-launch]");

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
  n("[data-current-wallet-count]").textContent=project?String(model?.count??0):"0";
  if(model)trade.setWallets(model);
 }
 const wallet=mountPositionSnapshot(walletHost,{esc,currentOnly:true,onManage:()=>onNavigate("wallet"),onAssets:()=>onNavigate("wallet"),onSummary:drawHoldings});
 selectTradeWallet=address=>wallet.selectWallet(address);
 function drawProject(){
  const p=currentTerminalProject(project);
  q("[data-market-symbol]").textContent=p?.symbol?p.symbol+" / SOL":"Current market data";q("#terminal-project-select").value=p?.mint??"";
  market.setProject(project);
  trade.setProject(project);wallet.setProject(project);
 }
 function tokenStatus(message){const el=n("[data-token-status]");el.textContent=message;el.hidden=!message}
 async function load(){
  const own=++directoryTicket,input=q("#terminal-project-select");input.disabled=true;tokenStatus("");
  try{const result=await getProjectDirectory();if(!alive()||own!==directoryTicket)return;
   projects=result.projects;project=projects.find(p=>p.project_id===activeProjectId)??null;
   n("[data-current-count]").textContent=String(new Set(projects.map(p=>p.token?.mint).filter(Boolean)).size);
   input.disabled=false;drawProject();
  }catch{if(!alive()||own!==directoryTicket)return;project=null;projects=[];drawProject();drawHoldings(null);n("[data-current-count]").textContent="—";input.disabled=true;tokenStatus("Token directory unavailable. Use Refresh to retry.");}
 }
 function selectToken(){
  const input=q("#terminal-project-select"),mint=input.value.trim();if(!mint){onMode("operations");onNavigate("terminal",null);return;}
  const matches=projects.filter(p=>p.token?.mint===mint&&p.network?.cluster==="localnet");
  if(matches.length!==1){tokenStatus(matches.length?"Multiple local projects use this token. Select it in Meme Archive.":"Token is not registered in this Localnet workspace.");return;}
  tokenStatus("");onMode("operations");onNavigate("terminal",matches[0].project_id);
 }
 function drawMode(){
  q("[data-reference-trade]").hidden=mode!=="operations"||showSingle;q("[data-current-trade]").hidden=mode!=="operations"||!showSingle;launchHost.hidden=mode!=="launch";q("[data-single-ticket]").setAttribute("aria-pressed",String(showSingle));q("[data-single-ticket]").hidden=mode!=="operations";q("[data-reference-note]").hidden=mode!=="operations"||showSingle;
  q("[data-current-launch]").classList.toggle("terminal-launch-only",mode==="launch");
  main.querySelectorAll("[data-current-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.currentMode===mode)));
  if(mode==="launch"&&!launchMounted){launchMounted=true;mountProjectSetup(launchHost,{terminalMode:true,initialProjectId:activeProjectId,initialMessage:projectMessage,onActiveProjectId:id=>{onSelect(id);activeProjectId=id;void load()},isActive:()=>alive()&&mode==="launch",screenHeading,panel,note,table,esc,download,projectRegistry,record,errorKind});}
 }
 q("[data-footer-settings]").onclick=()=>onNavigate("logs");q("[data-footer-refresh]").onclick=async()=>{await load();if(alive()&&project)void wallet.refresh()};
 n("[data-token-form]").onsubmit=e=>{e.preventDefault();selectToken()};
 q("#terminal-project-select").onchange=()=>selectToken();
 n("[data-token-paste]").onclick=async()=>{try{const value=await main.ownerDocument.defaultView.navigator.clipboard.readText();if(!alive())return;q("#terminal-project-select").value=value.trim();selectToken()}catch{if(alive())tokenStatus("Paste the token address into the field.")}};
 q("[data-single-ticket]").onclick=()=>{showSingle=!showSingle;setPanelCollapsed(false);drawMode()};
 q("[data-market-swap]").onclick=()=>{const center=q(".meme-center");center.classList.toggle("desk-wallet-first")};
 q("[data-market-toggle]").onclick=e=>{const body=q("[data-market-body]");body.hidden=!body.hidden;e.target.textContent=body.hidden?"Expand Chart ↓":"Minimize Chart ↑";e.target.setAttribute("aria-expanded",String(!body.hidden))};
 main.querySelectorAll("[data-current-mode]").forEach(b=>b.onclick=()=>{const next=b.dataset.currentMode;if(next===mode)return;if(mode==="launch"){onMode(next);onNavigate("terminal",activeProjectId);return;}mode=next;onMode(mode);drawMode()});
 drawMode();void load();return ()=>{disposed=true;directoryTicket++;wallet.dispose();market.dispose()};
}
