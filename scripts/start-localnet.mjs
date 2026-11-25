import {createServer,connect} from 'node:net';
import {spawn} from 'node:child_process';
import {validateForwardConfig} from '../src/inner-market/local-forward-config.mjs';
import {buildLocalServerEnvironment} from '../src/inner-market/local-server-env.mjs';
const cfg=validateForwardConfig({rpc:process.env.COOK_REMOTE_RPC_URL,ws:process.env.COOK_REMOTE_WS_URL,genesis:process.env.COOK_LOCAL_GENESIS_HASH});
const response=await fetch(cfg.rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getGenesisHash'}),redirect:'error',signal:AbortSignal.timeout(8000)});
const body=await response.json();if(!response.ok||body.result!==cfg.genesis)throw Error('GENESIS_MISMATCH');
function forward(port,target){return new Promise((resolve,reject)=>{
 const server=createServer(client=>{const upstream=connect(target,cfg.host);client.pipe(upstream).pipe(client);client.on('error',()=>upstream.destroy());upstream.on('error',()=>client.destroy())});
 server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve(server));
})}
let http,ws;try{http=await forward(18899,cfg.rpcPort);ws=await forward(18900,cfg.wsPort)}catch(e){http?.close();throw e}
const child=spawn(process.execPath,['scripts/serve-offline-mvp.mjs'],{stdio:'inherit',env:buildLocalServerEnvironment(process.env,{port:Number(process.env.PORT||'4183'),rpcUrl:'http://127.0.0.1:18899'})});
let closing=false;function shutdown(){if(closing)return;closing=true;child.kill('SIGTERM');http.close();ws.close()}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);child.on('error',()=>{shutdown();process.exitCode=1});child.on('exit',code=>{shutdown();process.exitCode=code??1});
