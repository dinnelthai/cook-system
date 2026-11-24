import {SolanaRpcClient} from "../adapters/pump/solana-rpc.mjs";

/** Optional localhost-only health check; proves connectivity, not network identity.
 * Never accepts a client-provided URL or arbitrary RPC method. */
export async function checkLocalRpcHealth(endpoint,{fetchImpl=globalThis.fetch}={}){
 if(!endpoint)return {status:"NOT_CONFIGURED",network_verified:false};
 let u;
 try{u=new URL(endpoint);}catch{return {status:"INVALID_CONFIGURATION",network_verified:false};}
 if(!["http:","https:"].includes(u.protocol)||!["127.0.0.1","localhost","[::1]"].includes(u.hostname)||u.username||u.password||u.search||u.hash)return {status:"INVALID_CONFIGURATION",network_verified:false};
 try{
  const client=new SolanaRpcClient({endpoint:u.href,fetchImpl:(url,init)=>fetchImpl(url,{...init,redirect:"error"}),timeoutMs:3000,maxRetries:0,commitment:"finalized"});
  const [health,version,slot,genesis]=await Promise.all([client.request("getHealth"),client.request("getVersion"),client.getSlot(),client.request("getGenesisHash")]);
  if(health!=="ok"||!Number.isSafeInteger(slot)||slot<0||typeof genesis!=="string"||!genesis.length||typeof version?.["solana-core"]!=="string")return {status:"REVIEW_REQUIRED",network_verified:false};
  return {status:"RPC_REACHABLE",network_verified:false,slot,version:version["solana-core"],genesis_hash:genesis};
 }catch{return {status:"RPC_UNAVAILABLE",network_verified:false};}
}
