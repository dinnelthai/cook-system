import {createRequire} from 'node:module';
import {Connection,PublicKey,Transaction} from '@solana/web3.js';
import {publicKey,parseSol} from './local-faucet.mjs';
import WebSocket from 'ws';
import {runTradeBatch} from './local-trade-batch.mjs';
const require=createRequire(import.meta.url),BN=require('bn.js');
const {OnlinePumpAmmSdk,PUMP_AMM_SDK}=require('@pump-fun/pump-sdk/swap');
const SOL='So11111111111111111111111111111111111111112';
export function createLocalTrading({endpoint,expectedGenesis,enabled,labUrl,wallets}={}){
 let busy=false;
 function validate(){
  if(!enabled||!expectedGenesis||/^(5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp|EtWTRABZaYq6iMfeYKouRu166VU2xqa1|4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z)/.test(expectedGenesis))throw Error('TRADE_DISABLED');
  let rpc,lab;try{publicKey(expectedGenesis);rpc=new URL(endpoint);lab=new URL(labUrl)}catch{throw Error('INVALID_LOCAL_CONFIGURATION')}
  if(rpc.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(rpc.hostname)||rpc.username||rpc.password||rpc.pathname!=='/'||rpc.search||rpc.hash)throw Error('INVALID_LOCAL_CONFIGURATION');
  if(lab.protocol!=='http:'||!/^192\.168\.(?:\d{1,3})\.(?:\d{1,3})$/.test(lab.hostname)||lab.username||lab.password||lab.pathname!=='/'||lab.search||lab.hash)throw Error('INVALID_LOCAL_CONFIGURATION');
  return {rpc:rpc.href,lab:lab.href};
 }
 async function labMarket(){
  const {lab}=validate();const opts={redirect:'error',signal:AbortSignal.timeout(8000)};
  const c=await fetch(new URL('/ui-config',lab),opts);if(!c.ok)throw Error('LAB_UNAVAILABLE');const config=await c.json();publicKey(config.defaultMint);if(typeof config.readKey!=='string'||!config.readKey)throw Error('LAB_UNAVAILABLE');
  const r=await fetch(new URL('/v1/tokens/'+config.defaultMint,lab),{...opts,headers:{'x-api-key':config.readKey}});if(!r.ok)throw Error('LAB_UNAVAILABLE');const token=await r.json();
  if(token.mint!==config.defaultMint||token.stage!=='pumpswap')throw Error('UNSUPPORTED_MARKET');publicKey(token.pool);
  return {mint:token.mint,pool:token.pool,key:config.readKey,lab};
 }
 async function market(){const {mint,pool}=await labMarket();return {mint,pool}}
 async function snapshot(interval){
  if(!['1m','5m','15m','1h'].includes(interval))throw Error('INVALID_BODY');
  const {mint,pool,key,lab}=await labMarket();const url=new URL('/stream',lab);url.protocol='ws:';
  return await new Promise((resolve,reject)=>{
   let done=false;const ws=new WebSocket(url.href,['pumplab','key.'+key],{maxPayload:1024*1024,handshakeTimeout:8000});
   const timer=setTimeout(()=>finish(null),8000);
   function finish(value){if(done)return;done=true;clearTimeout(timer);ws.close();if(!value)reject(Error('LAB_UNAVAILABLE'));else resolve(value)}
   ws.on('open',()=>ws.send(JSON.stringify({mint,pool,interval,limit:200})));
   ws.on('error',()=>finish(null));
   ws.on('message',bytes=>{try{const v=JSON.parse(bytes.toString());if(v.type!=='market'||!Array.isArray(v.candles))return;
    const candles=v.candles.slice(-80).filter(x=>x.mint===mint&&x.pool===pool&&x.interval===interval).map(x=>({open_time:x.open_time,open:x.open,high:x.high,low:x.low,close:x.close,quote_volume:x.quote_volume}));
    finish({mint,pool,interval,candles});
   }catch{finish(null)}});
  });
 }
 async function batch({side,amount,addresses,mint,pool}){
  const {rpc:url}=validate();if(!['buy','sell'].includes(side)||!Array.isArray(addresses)||!addresses.length||addresses.length>20||new Set(addresses).size!==addresses.length)throw Error('INVALID_BODY');
  if(side==='buy')parseSol(amount);else if(amount!==undefined)throw Error('INVALID_BODY');publicKey(mint);publicKey(pool);
  for(const a of addresses)publicKey(a);const owned=await wallets.list();if(addresses.some(a=>!owned.some(w=>w.address===a)))throw Error('WALLET_NOT_FOUND');
  if(busy)throw Error('TRADE_BUSY');busy=true;
  try{
   const rpc=new Connection(url,{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(u,o)=>fetch(u,{...o,redirect:'error',signal:AbortSignal.timeout(8000)})});
   if(await rpc.getGenesisHash()!==expectedGenesis)throw Error('GENESIS_MISMATCH');const m=await market();if(m.mint!==mint||m.pool!==pool)throw Error('MARKET_CHANGED');const sdk=new OnlinePumpAmmSdk(rpc);
   return await runTradeBatch(addresses,async address=>{
    let submitted=false,signature;
    try{
     if(await rpc.getGenesisHash()!==expectedGenesis)return {status:'UNKNOWN',reason:'GENESIS_MISMATCH'};
     const signer=await wallets.loadSigner(address),state=await sdk.swapSolanaState(new PublicKey(m.pool),signer.publicKey);
     if(state.pool.baseMint.toBase58()!==m.mint||state.pool.quoteMint.toBase58()!==SOL)return {status:'REJECTED',reason:'MARKET_MISMATCH'};
     const raw=side==='buy'?new BN(String(parseSol(amount))):new BN((await rpc.getTokenAccountBalance(state.userBaseTokenAccount,'confirmed')).value.amount);
     if(raw.isZero())return {status:'REJECTED',reason:'NO_TOKENS'};
     const ix=side==='buy'?await PUMP_AMM_SDK.buyQuoteInput(state,raw,1):await PUMP_AMM_SDK.sellBaseInput(state,raw,1);
     const sim=await rpc.simulateTransaction(new Transaction({feePayer:signer.publicKey}).add(...ix),[signer]);if(sim.value.err)return {status:'REJECTED',reason:'SIMULATION_FAILED'};
     const latest=await rpc.getLatestBlockhash('confirmed'),tx=new Transaction({feePayer:signer.publicKey,recentBlockhash:latest.blockhash}).add(...ix);tx.sign(signer);
     submitted=true;signature=await rpc.sendRawTransaction(tx.serialize(),{maxRetries:0,preflightCommitment:'confirmed'});
     for(let i=0;i<30;i++){
      const status=(await rpc.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];
      if(status?.err)return {status:'FAILED',signature};
      if(status&&['confirmed','finalized'].includes(status.confirmationStatus))return {status:'CONFIRMED',signature};
      if(await rpc.getBlockHeight('confirmed')>latest.lastValidBlockHeight)return {status:'UNKNOWN',signature,reason:'BLOCKHASH_EXPIRED'};
      await new Promise(resolve=>setTimeout(resolve,1000));
     }
     return {status:'UNKNOWN',signature,reason:'CONFIRMATION_TIMEOUT'};
    }catch{return {status:submitted?'UNKNOWN':'REJECTED',...(signature?{signature}:{}),reason:submitted?'SUBMISSION_UNCERTAIN':'PREPARATION_FAILED'}}
   });
  }finally{busy=false}
 }
 return {market,batch,snapshot};
}
