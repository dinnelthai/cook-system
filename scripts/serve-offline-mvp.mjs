import { createServer } from "node:http";
import { homedir } from "node:os";
import { openProjectStore } from "../src/inner-market/project-store.mjs";
import { createProjectHttpHandler } from "../src/inner-market/project-http.mjs";
import {createWalletStore} from "../src/inner-market/local-wallet-store.mjs";
import {createLocalTrading} from "../src/inner-market/local-trading.mjs";
import {createLocalTransfer} from "../src/inner-market/local-transfer.mjs";
import {createLocalFaucet} from "../src/inner-market/local-faucet.mjs";
import {createLocalWalletPortfolio} from "../src/inner-market/local-wallet-portfolio.mjs";
import { checkLocalRpcHealth } from "../src/inner-market/local-rpc-health.mjs";
import { buildTerminalState } from "../src/inner-market/terminal-state.mjs";
import { realpath } from "node:fs/promises";
import {readBoundedRegularFile} from "../src/core/bounded-private-file.mjs";
import {resolveLocalFeatureFlags} from "../src/core/local-feature-flags.mjs";
import { fileURLToPath } from "node:url";
import { resolve,extname,sep,relative as relativePath,isAbsolute,join } from "node:path";
const root=await realpath(fileURLToPath(new URL("../",import.meta.url)));
const allowed=["web/","src/inner-market/","src/core/","fixtures/synthetic/"];
const types={".html":"text/html; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8"};
const reportPath=process.env.COOK_TERMINAL_REPORT;
const localFeatures=resolveLocalFeatureFlags();
const maxReportBytes=16*1024*1024;
const workspaceEnabled=process.env.COOK_HISTORICAL_WORKSPACE==="1";
const workspacePath=process.env.COOK_HISTORICAL_WORKSPACE_DB??resolve(root,".cook-system","historical-workspace","workspace.sqlite");
const workspaceHandler=workspaceEnabled?(await import("../src/inner-market/historical-workspace-http.mjs")).createHistoricalWorkspaceHandler({path:workspacePath,readRequestJson}):null;
async function readRequestJson(req,maxBytes){
 const chunks=[];let total=0,tooLarge=false;
 for await(const part of req){const chunk=Buffer.isBuffer(part)?part:Buffer.from(part);total+=chunk.length;if(total>maxBytes){tooLarge=true;chunks.length=0;continue;}if(!tooLarge)chunks.push(chunk);}
 if(tooLarge)throw Error("BODY_TOO_LARGE");
 try{return new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks,total));}catch{throw Error("INVALID_BODY_ENCODING");}
}
const projectStorePath=process.env.COOK_PROJECT_DB??join(homedir(),".cook-system","projects.sqlite");
const projectStore=openProjectStore(projectStorePath);
const projectHttp=createProjectHttpHandler({store:projectStore,readRequestJson});
const port=Number(process.env.PORT??4173);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error("invalid PORT");
const wallets=createWalletStore();
const walletPortfolio=createLocalWalletPortfolio({endpoint:process.env.COOK_LOCAL_RPC_URL,expectedGenesis:process.env.COOK_LOCAL_GENESIS_HASH,walletStore:wallets});
const faucet=createLocalFaucet({endpoint:process.env.COOK_LOCAL_RPC_URL,expectedGenesis:process.env.COOK_LOCAL_GENESIS_HASH,enabled:localFeatures.faucet});
const transfers=createLocalTransfer({endpoint:process.env.COOK_LOCAL_RPC_URL,expectedGenesis:process.env.COOK_LOCAL_GENESIS_HASH,enabled:localFeatures.transfer,loadSigner:wallets.loadSigner});
const trading=createLocalTrading({endpoint:process.env.COOK_LOCAL_RPC_URL,expectedGenesis:process.env.COOK_LOCAL_GENESIS_HASH,enabled:localFeatures.trading,labUrl:process.env.COOK_PUMP_LAB_URL,wallets});
const server=createServer(async(req,res)=>{
 try{
  const requestHost=req.headers.host,requestOrigin=req.headers.origin;
  if(!["127.0.0.1:"+port,"localhost:"+port].includes(requestHost)||req.headers["sec-fetch-site"]==="cross-site"||(requestOrigin&&requestOrigin!=="http://"+requestHost)){res.writeHead(403,{"Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify({code:"FORBIDDEN"}));return;}
  const requestPath=new URL(req.url,"http://127.0.0.1").pathname;
  if(requestPath==="/api/projects"||requestPath.startsWith("/api/projects/")){await projectHttp(req,res);return;}
  if(["/api/historical-workspace","/api/historical-workspace/revisions","/api/historical-workspace/query"].includes(req.url)){
   if(!workspaceHandler){res.writeHead(503,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify({code:"WORKSPACE_DISABLED"}));return;}
   await workspaceHandler(req,res);return;
  }
  if(["/api/local-wallet/balance","/api/local-wallet/airdrop","/api/local-wallet/list","/api/local-wallet/create","/api/local-wallet/transfer","/api/local-wallet/portfolio","/api/local-wallet/market","/api/local-wallet/market-data","/api/local-wallet/trade"].includes(req.url)){
   const send=(status,body)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(body))};
   const host=req.headers.host,origin=req.headers.origin;
   if(!["127.0.0.1:"+port,"localhost:"+port].includes(host)||req.headers["sec-fetch-site"]==="cross-site"||(origin&&origin!=="http://"+host)){send(403,{code:"FORBIDDEN"});return}
   if(req.method!=="POST"||req.headers["content-type"]!=="application/json"){send(405,{code:"POST_JSON_REQUIRED"});return}
   try{
    const raw=await readRequestJson(req,4096);
    const data=JSON.parse(raw),fund=req.url.endsWith("/airdrop");
    if(req.url.endsWith("/list")||req.url.endsWith("/create")){if(!data||typeof data!=="object"||Array.isArray(data)||Object.keys(data).length)throw Error("INVALID_BODY");send(200,req.url.endsWith("/list")?{wallets:await wallets.list()}:await wallets.create());return;}
    if(req.url.endsWith("/portfolio")){if(!data||typeof data!=="object"||Array.isArray(data)||Object.keys(data).some(k=>k!=="limit"))throw Error("INVALID_BODY");send(200,await walletPortfolio.snapshot(data));return;}
    if(req.url.endsWith("/market-data")){if(!data||typeof data!=="object"||Array.isArray(data)||Object.keys(data).some(k=>k!=="interval"))throw Error("INVALID_BODY");send(200,await trading.snapshot(data.interval));return;}
    if(req.url.endsWith("/market")){if(!data||typeof data!=="object"||Array.isArray(data)||Object.keys(data).length)throw Error("INVALID_BODY");send(200,await trading.market());return;}
    if(req.url.endsWith("/trade")){if(!data||typeof data!=="object"||Array.isArray(data)||Object.keys(data).some(k=>!["side","amount","addresses","mint","pool"].includes(k)))throw Error("INVALID_BODY");send(200,{results:await trading.batch(data)});return;}
    if(req.url.endsWith("/transfer")){
     if(!data||typeof data!=="object"||Array.isArray(data)||Object.keys(data).some(k=>!["from","to","amount"].includes(k)))throw Error("INVALID_BODY");
     const owned=await wallets.list();if(!owned.some(w=>w.address===data.to))throw Error("WALLET_NOT_FOUND");
     send(200,await transfers.transfer(data));return;
    }
    if(!data||typeof data!=="object"||Array.isArray(data)||Object.keys(data).some(k=>!(fund?["address","amount"]:["address"]).includes(k)))throw Error("INVALID_BODY");
    send(200,await (fund?faucet.airdrop(data.address,data.amount):faucet.balance(data.address)));
   }catch(e){if(e.message==="BODY_TOO_LARGE"){send(413,{code:e.message});return;}if(e.message==="INVALID_BODY_ENCODING"){send(400,{code:e.message});return;}const allowed=new Set(["INVALID_BODY","INVALID_PUBLIC_KEY","INVALID_AMOUNT","AMOUNT_OUT_OF_RANGE","FAUCET_DISABLED","INVALID_LOCAL_CONFIGURATION","GENESIS_MISMATCH","FAUCET_BUSY","RPC_UNAVAILABLE","RPC_REJECTED","SIGNATURE_UNKNOWN","BALANCE_INVALID","WALLET_DIRECTORY_UNSAFE","WALLET_CREATE_BUSY","WALLET_LIMIT","WALLET_KEY_INVALID","WALLET_NOT_FOUND","TRANSFER_DISABLED","TRANSFER_BUSY","SAME_WALLET","TRADE_DISABLED","TRADE_BUSY","PORTFOLIO_UNAVAILABLE","PORTFOLIO_BUSY","PORTFOLIO_DATA_INVALID","INVALID_PORTFOLIO_LIMIT","PORTFOLIO_RPC_UNAVAILABLE","TOKEN_DECIMALS_CONFLICT","LAB_UNAVAILABLE","UNSUPPORTED_MARKET","MARKET_CHANGED"]);send(e.message==="PORTFOLIO_UNAVAILABLE"?503:e.message==="GENESIS_MISMATCH"?409:e.message==="PORTFOLIO_RPC_UNAVAILABLE"?502:400,{code:allowed.has(e.message)?e.message:"LOCAL_RPC_REQUEST_FAILED"})}return;
  }
  if(req.method!=="GET"){res.writeHead(405);res.end();return}
  const url=new URL(req.url,"http://127.0.0.1");
  if(["/api/terminal/report","/api/terminal/health"].includes(url.pathname)){
   const host=req.headers.host;
   if(!["127.0.0.1:"+port,"localhost:"+port].includes(host)||req.headers["sec-fetch-site"]==="cross-site"){res.writeHead(403);res.end();return}
   const json=(status,payload)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(payload));};
   if(url.pathname==="/api/terminal/health"){json(200,{report_bridge:reportPath?"CONFIGURED":"NOT_CONFIGURED",rpc:await checkLocalRpcHealth(process.env.COOK_LOCAL_RPC_URL),execution_enabled:false});return}
   if(!reportPath){json(503,{code:"REPORT_BRIDGE_NOT_CONFIGURED"});return}
   try{
    const bytes=await readBoundedRegularFile(reportPath,maxReportBytes);
    const input=JSON.parse(bytes.toString("utf8"));buildTerminalState(input);
    json(200,input);
   }catch{json(422,{code:"REPORT_VALIDATION_FAILED"});}
   return;
  }
  const path=url.pathname==="/"?"web/index.html":decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const target=resolve(root,path);
  const relative=relativePath(root,target).split(sep).join("/");
  if(isAbsolute(relative)||relative===".."||relative.startsWith("../")||!allowed.some(prefix=>relative.startsWith(prefix))||!types[extname(target)]){res.writeHead(404);res.end("Not found");return}
  const resolved=await realpath(target);
  if(resolved!==target){res.writeHead(404);res.end("Not found");return}
  const bytes=await readBoundedRegularFile(resolved,maxReportBytes);
  res.writeHead(200,{"Content-Type":types[extname(target)],"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
  res.end(bytes);
 }catch{res.writeHead(404);res.end("Not found")}
});
server.headersTimeout=10_000;
server.requestTimeout=15_000;
server.keepAliveTimeout=5_000;
server.maxRequestsPerSocket=100;
server.maxConnections=64;
server.on("close",()=>projectStore.close());
server.listen(port,"127.0.0.1",()=>console.log("Offline MVP: http://127.0.0.1:"+port));
