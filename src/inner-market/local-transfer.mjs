import {Connection, PublicKey, SystemProgram, Transaction} from '@solana/web3.js';
import {parseSol, publicKey} from './local-faucet.mjs';

// Test-validator transfers only. A response is submission, not confirmation.
export function createLocalTransfer({endpoint,expectedGenesis,enabled=false,loadSigner,connection}={}) {
 let busy=false;
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
   const {blockhash}=await rpc.getLatestBlockhash('finalized');
   const tx=new Transaction({feePayer:signer.publicKey,recentBlockhash:blockhash}).add(SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:new PublicKey(to),lamports}));
   tx.sign(signer);
   const signature=await rpc.sendRawTransaction(tx.serialize(),{maxRetries:0,preflightCommitment:'confirmed'});
   return {network:'localnet',signature,status:'SUBMITTED_NOT_CONFIRMED'};
  }finally{busy=false}
 }};
}
