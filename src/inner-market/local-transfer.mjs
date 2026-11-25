import {Connection, PublicKey, SystemProgram, Transaction} from '@solana/web3.js';
import {parseSol, publicKey} from './local-faucet.mjs';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
/** Localnet-only transfer. Submission acknowledgement is never reported as confirmation. */
export function createLocalTransfer({endpoint,expectedGenesis,enabled=false,loadSigner,connection,confirmationPolls=20,pollIntervalMs=500}={}){
 let busy=false;
 if(!Number.isSafeInteger(confirmationPolls)||confirmationPolls<1||confirmationPolls>120||!Number.isSafeInteger(pollIntervalMs)||pollIntervalMs<0||pollIntervalMs>5000)throw Error('INVALID_CONFIRMATION_POLICY');
 function validateConfiguration(){
  if(!enabled||!expectedGenesis||/^(5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp|EtWTRABZaYq6iMfeYKouRu166VU2xqa1|4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z)/.test(expectedGenesis))throw Error('TRANSFER_DISABLED');
  let url;try{publicKey(expectedGenesis);url=new URL(endpoint)}catch{throw Error('INVALID_LOCAL_CONFIGURATION')}
  if(url.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('INVALID_LOCAL_CONFIGURATION');
  return url.href;
 }
 return {async transfer({from,to,amount}){
  const url=validateConfiguration();publicKey(from);publicKey(to);const lamports=parseSol(amount);
  if(from===to)throw Error('SAME_WALLET');if(busy)throw Error('TRANSFER_BUSY');busy=true;
  try{
   const rpc=connection??new Connection(url,{commitment:'finalized',disableRetryOnRateLimit:true,fetch:(url,options)=>fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(8000)})});
   if(await rpc.getGenesisHash()!==expectedGenesis)throw Error('GENESIS_MISMATCH');
   const signer=await loadSigner(from);if(signer.publicKey.toBase58()!==from)throw Error('WALLET_KEY_INVALID');
   const latest=await rpc.getLatestBlockhash('finalized');
   if(typeof latest?.blockhash!=='string'||!Number.isSafeInteger(latest.lastValidBlockHeight)||latest.lastValidBlockHeight<0)throw Error('BLOCKHASH_UNAVAILABLE');
   const tx=new Transaction({feePayer:signer.publicKey,recentBlockhash:latest.blockhash}).add(SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:new PublicKey(to),lamports}));
   tx.sign(signer);
   let submitted=false,signature;
   try{
    submitted=true;
    signature=await rpc.sendRawTransaction(tx.serialize(),{maxRetries:0,preflightCommitment:'confirmed'});
    if(typeof signature!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature))return {network:'localnet',status:'UNKNOWN',reason:'SIGNATURE_UNAVAILABLE'};
    for(let i=0;i<confirmationPolls;i++){
     const response=await rpc.getSignatureStatuses([signature],{searchTransactionHistory:true});
     const status=response?.value?.[0];
     if(status?.err)return {network:'localnet',signature,status:'FAILED'};
     if(status&&(['confirmed','finalized'].includes(status.confirmationStatus)||status.confirmations===null))return {network:'localnet',signature,status:'CONFIRMED'};
     const height=await rpc.getBlockHeight('confirmed');
     if(Number.isSafeInteger(height)&&height>latest.lastValidBlockHeight)return {network:'localnet',signature,status:'UNKNOWN',reason:'BLOCKHASH_EXPIRED'};
     if(i+1<confirmationPolls&&pollIntervalMs)await sleep(pollIntervalMs);
    }
    return {network:'localnet',signature,status:'UNKNOWN',reason:'CONFIRMATION_TIMEOUT'};
   }catch{
    return {network:'localnet',...(signature?{signature}:{}),status:submitted?'UNKNOWN':'REJECTED',reason:'SUBMISSION_OR_CONFIRMATION_UNCERTAIN'};
   }
  }finally{busy=false}
 }};
}
