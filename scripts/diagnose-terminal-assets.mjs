// Read-only terminal diagnostics; no key material, signing or writes.
const raw=process.env.COOK_TERMINAL_URL??"http://127.0.0.1:4173";
const base=new URL(raw);
if(base.protocol!=="http:"||!["127.0.0.1","[::1]"].includes(base.hostname)||base.username||base.password||base.pathname!=="/"||base.search||base.hash)throw Error("INVALID_TERMINAL_URL");
async function request(path,body){
 const response=await fetch(new URL(path,base),{...(body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{}),redirect:"error",signal:AbortSignal.timeout(20000)});
 const data=await response.json();
 if(!response.ok)return {http_status:response.status,code:typeof data.code==="string"&&/^[A-Z_]{1,64}$/.test(data.code)?data.code:"REQUEST_FAILED"};
 return data;
}
try{
 const health=await request("/api/terminal/health");
 const inventory=await request("/api/local-wallet/list",{});
 const portfolio=await request("/api/local-wallet/portfolio",{limit:1});
 const verified=portfolio.schema_version==="cook-local-wallet-portfolio.1"&&portfolio.network==="localnet"&&portfolio.read_only===true&&portfolio.execution_enabled===false;
 const configured=typeof process.env.COOK_LOCAL_GENESIS_HASH==="string"&&process.env.COOK_LOCAL_GENESIS_HASH.length>0;
 const output={terminal:base.origin,rpc_status:health.rpc?.status??health.code??"UNKNOWN",rpc_genesis_hash:health.rpc?.genesis_hash??null,client_shell_genesis_configured:configured,client_shell_genesis_matches:configured&&health.rpc?.genesis_hash?health.rpc.genesis_hash===process.env.COOK_LOCAL_GENESIS_HASH:null,inventory_count:Array.isArray(inventory.wallets)?inventory.wallets.length:null,inventory_code:inventory.code??null,portfolio_code:portfolio.code??null,portfolio_verified:verified,balance_status:verified?portfolio.balance_status:null,token_status:verified?portfolio.token_holdings_status:null,deadline_reached:verified?portfolio.deadline_reached:null,observed_balances:verified&&Array.isArray(portfolio.wallets)?portfolio.wallets.filter(w=>w.balance_status==="AVAILABLE").length:null};
 console.log(JSON.stringify(output,null,2));
 if(!verified||portfolio.balance_status!=="AVAILABLE"||portfolio.token_holdings_status!=="AVAILABLE")process.exitCode=1;
}catch{console.error("Read-only diagnostic failed: check terminal server address and startup logs.");process.exitCode=1;}
