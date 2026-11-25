// Explicitly enabled local-validator faucet only. No signer, secret, arbitrary RPC or public cluster.
const alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function publicKey(s){
 if(typeof s!=="string"||s.length<32||s.length>44)throw Error("INVALID_PUBLIC_KEY");
 let n=0n;for(const c of s){const i=alphabet.indexOf(c);if(i<0)throw Error("INVALID_PUBLIC_KEY");n=n*58n+BigInt(i)}
 if(s.match(/^1*/)[0].length+(n===0n?0:Math.ceil(n.toString(16).length/2))!==32)throw Error("INVALID_PUBLIC_KEY");
 return s;
}
export function parseSol(s){
 if(typeof s!=="string"||!/^\d{1,3}(\.\d{1,9})?$/.test(s))throw Error("INVALID_AMOUNT");
 const [a,b=""]=s.split(".");const n=BigInt(a)*1000000000n+BigInt(b.padEnd(9,"0"));
 if(n<1n||n>100000000000n)throw Error("AMOUNT_OUT_OF_RANGE");
 return Number(n);
}
export function createLocalFaucet({endpoint,expectedGenesis,enabled=false,fetchImpl=globalThis.fetch}={}){
 let u;
 const configured=(requiresWrite=false)=>{if((requiresWrite&&!enabled)||!expectedGenesis||/^(5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp|EtWTRABZaYq6iMfeYKouRu166VU2xqa1|4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z)/.test(expectedGenesis))throw Error("FAUCET_DISABLED");
  try{publicKey(expectedGenesis);u=new URL(endpoint)}catch{throw Error("INVALID_LOCAL_CONFIGURATION")}
  if(u.protocol!=="http:"||!["127.0.0.1","[::1]"].includes(u.hostname)||u.username||u.password||u.pathname!=="/"||u.search||u.hash)throw Error("INVALID_LOCAL_CONFIGURATION");
 };
 let counter=0,busy=false;
 async function rpc(method,params=[]){
  const id=++counter;const r=await fetchImpl(u.href,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id,method,params}),redirect:"error",signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error("RPC_UNAVAILABLE");const j=await r.json();if(j.id!==id||j.error||!Object.hasOwn(j,"result"))throw Error("RPC_REJECTED");return j.result;
 }
 async function verify(requiresWrite=false){configured(requiresWrite);if(await rpc("getGenesisHash")!==expectedGenesis)throw Error("GENESIS_MISMATCH")}
 async function readBalance(address){const v=await rpc("getBalance",[address,{commitment:"finalized"}]);if(!Number.isSafeInteger(v?.value)||v.value<0)throw Error("BALANCE_INVALID");return String(v.value)}
 return {
  async balance(address){publicKey(address);await verify();return {network:"localnet",address,balance_lamports:await readBalance(address)}},
  async airdrop(address,amount){
   publicKey(address);const lamports=parseSol(amount);
   if(busy)throw Error("FAUCET_BUSY");busy=true;
   try{await verify(true);const signature=await rpc("requestAirdrop",[address,lamports,{commitment:"confirmed"}]);
    if(typeof signature!=="string"||!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature))throw Error("SIGNATURE_UNKNOWN");
    return {network:"localnet",address,requested_lamports:String(lamports),signature,status:"SUBMITTED_NOT_CONFIRMED"};
   }finally{busy=false}
  }
 };
}
