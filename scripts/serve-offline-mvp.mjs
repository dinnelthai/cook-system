import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve,extname,sep } from "node:path";
const root=fileURLToPath(new URL("../",import.meta.url));
const allowed=["web/","src/inner-market/","src/core/","fixtures/synthetic/"];
const types={".html":"text/html; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8"};
const port=Number(process.env.PORT??4173);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error("invalid PORT");
createServer(async(req,res)=>{
 try{
  if(req.method!=="GET"){res.writeHead(405);res.end();return}
  const url=new URL(req.url,"http://127.0.0.1");
  const path=url.pathname==="/"?"web/index.html":decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const target=resolve(root,path);
  const relative=target.slice(root.length).split(sep).join("/");
  if(!target.startsWith(root)||!allowed.some(prefix=>relative.startsWith(prefix))||!types[extname(target)]){res.writeHead(404);res.end("Not found");return}
  const bytes=await readFile(target);
  res.writeHead(200,{"Content-Type":types[extname(target)],"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
  res.end(bytes);
 }catch{res.writeHead(404);res.end("Not found")}
}).listen(port,"127.0.0.1",()=>console.log("Offline MVP: http://127.0.0.1:"+port));
