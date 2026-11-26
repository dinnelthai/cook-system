/**
 * Browser wallet boundary. Localnet is the only executable mode of the offline
 * MVP. Mainnet is reserved for Phantom; no local signing fallback is allowed.
 * Project identity, transaction policy and RPC verification remain server-owned.
 */
const LOCAL_ACTIONS = new Set(["list","create","create-batch","export","import","balance","portfolio","airdrop","transfer"]);
export const WALLET_MODE = Object.freeze({LOCALNET:"localnet",MAINNET:"mainnet"});
export function createWalletAdapter({mode,fetchImpl=globalThis.fetch}={}){
 if(mode===WALLET_MODE.MAINNET){
  const unavailable=async()=>{throw Error("PHANTOM_ADAPTER_NOT_IMPLEMENTED")};
  return Object.freeze({
   mode,provider:"phantom",ready:false,
   capabilities:Object.freeze({create:false,balance:false,portfolio:false,faucet:false,transfer:false,sign:false}),
   list:unavailable,create:unavailable,createBatch:unavailable,exportKeys:unavailable,importKeys:unavailable,balance:unavailable,portfolio:unavailable,airdrop:unavailable,transfer:unavailable
  });
 }
 if(mode!==WALLET_MODE.LOCALNET)throw Error("INVALID_WALLET_MODE");
 if(typeof fetchImpl!=="function")throw Error("WALLET_TRANSPORT_UNAVAILABLE");
 async function request(action,body){
  if(!LOCAL_ACTIONS.has(action))throw Error("WALLET_ACTION_NOT_SUPPORTED");
  const r=await fetchImpl("/api/local-wallet/"+action,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
  const j=await r.json();
  if(!r.ok)throw Error(j.code||"REQUEST_FAILED");
  return j;
 }
 return Object.freeze({
  mode,provider:"local-wallet",ready:true,
  capabilities:Object.freeze({create:true,balance:true,portfolio:true,faucet:true,transfer:true,sign:false}),
  list:()=>request("list",{}),
  create:()=>request("create",{}),
  createBatch:({count})=>request("create-batch",{count}),
  exportKeys:({addresses})=>request("export",{addresses}),
  importKeys:({wallets})=>request("import",{wallets}),
  balance:({address})=>request("balance",{address}),
  portfolio:({limit,mint})=>request("portfolio",{limit,...(mint===undefined?{}:{mint})}),
  airdrop:({address,amount})=>request("airdrop",{address,amount}),
  transfer:({from,to,amount})=>request("transfer",{from,to,amount})
 });
}
