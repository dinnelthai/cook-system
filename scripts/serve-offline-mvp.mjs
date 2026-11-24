import { createServer } from "node:http";
import { checkLocalRpcHealth } from "../src/inner-market/local-rpc-health.mjs";
import { buildTerminalState } from "../src/inner-market/terminal-state.mjs";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve,extname,sep } from "node:path";
const root=fileURLToPath(new URL("../",import.meta.url));
const allowed=["web/","src/inner-market/","src/core/","fixtures/synthetic/"];
const types={".html":"text/html; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8"};
const reportPath=process.env.COOK_TERMINAL_REPORT;
const maxReportBytes=16*1024*1024;
const port=Number(process.env.PORT??4173);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error("invalid PORT");
createServer(async(req,res)=>{
 try{
  if(req.method!=="GET"){res.writeHead(405);res.end();return}
  const url=new URL(req.url,"http://127.0.0.1");
  if(["/api/terminal/report","/api/terminal/health"].includes(url.pathname)){
   const host=req.headers.host;
   if(!["127.0.0.1:"+port,"localhost:"+port].includes(host)||req.headers["sec-fetch-site"]==="cross-site"){res.writeHead(403);res.end();return}
   const json=(status,payload)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(payload));};
   if(url.pathname==="/api/terminal/health"){json(200,{report_bridge:reportPath?"CONFIGURED":"NOT_CONFIGURED",rpc:await checkLocalRpcHealth(process.env.COOK_LOCAL_RPC_URL),execution_enabled:false});return}
   if(!reportPath){json(503,{code:"REPORT_BRIDGE_NOT_CONFIGURED"});return}
   try{
    const info=await stat(reportPath);
    if(!info.isFile()||info.size>maxReportBytes){json(422,{code:"REPORT_FILE_INVALID"});return}
    const bytes=await readFile(reportPath);
    if(bytes.length>maxReportBytes){json(422,{code:"REPORT_FILE_TOO_LARGE"});return}
    const input=JSON.parse(bytes.toString("utf8"));buildTerminalState(input);
    json(200,input);
   }catch{json(422,{code:"REPORT_VALIDATION_FAILED"});}
   return;
  }
  const path=url.pathname==="/"?"web/index.html":decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const target=resolve(root,path);
  const relative=target.slice(root.length).split(sep).join("/");
  if(!target.startsWith(root)||!allowed.some(prefix=>relative.startsWith(prefix))||!types[extname(target)]){res.writeHead(404);res.end("Not found");return}
  const bytes=await readFile(target);
  res.writeHead(200,{"Content-Type":types[extname(target)],"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
  res.end(bytes);
 }catch{res.writeHead(404);res.end("Not found")}
}).listen(port,"127.0.0.1",()=>console.log("Offline MVP: http://127.0.0.1:"+port));
