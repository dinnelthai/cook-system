import {Connection,PublicKey} from "@solana/web3.js";
import {publicKey} from "./local-faucet.mjs";
const TOKEN_PROGRAMS=["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA","TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];
const CLUSTER_GENESIS=/^(5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp|EtWTRABZaYq6iMfeYKouRu166VU2xqa1|4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z)/;
const validAmount=v=>typeof v==="string"&&v.length<=39&&/^(0|[1-9][0-9]*)$/.test(v);
const asKey=v=>{if(typeof v!=="string")throw Error("PORTFOLIO_DATA_INVALID");return publicKey(v)};
function transferRows(tx){
 const rows=[...(tx?.transaction?.message?.instructions??[]),...(tx?.meta?.innerInstructions??[]).flatMap(x=>x.instructions??[])],out=[];
 for(const ix of rows){
  const p=ix?.parsed,info=p?.info;if(!info||typeof p.type!=="string")continue;
  if(ix.program==="system"&&p.type==="transfer"&&typeof info.source==="string"&&typeof info.destination==="string"&&(typeof info.lamports==="number"||validAmount(info.lamports))){
   out.push({asset:"SOL",from:info.source,to:info.destination,amount_base_units:String(info.lamports),decimals:9});
  }else if(["spl-token","spl-token-2022"].includes(ix.program)&&["transfer","transferChecked"].includes(p.type)&&typeof info.source==="string"&&typeof info.destination==="string"){
   const amount=info.tokenAmount?.amount??info.amount,decimals=info.tokenAmount?.decimals??null;
   if(validAmount(String(amount))&&(decimals===null||Number.isInteger(decimals)))out.push({asset:"TOKEN",mint:typeof info.mint==="string"?info.mint:null,from:info.source,to:info.destination,amount_base_units:String(amount),decimals});
  }
 }
 return out;
}
/** Read-only portfolio over locally managed key addresses. Never loads a signer. */
export function createLocalWalletPortfolio({endpoint,expectedGenesis,walletStore,requestTimeoutMs=3000,snapshotTimeoutMs=12000,connectionFactory=(url,signal)=>new Connection(url,{commitment:"confirmed",disableRetryOnRateLimit:true,fetch:(u,o)=>fetch(u,{...o,redirect:"error",signal:AbortSignal.any([signal,AbortSignal.timeout(requestTimeoutMs)])})})}={}){
 if(!Number.isSafeInteger(requestTimeoutMs)||requestTimeoutMs<1||requestTimeoutMs>30000||!Number.isSafeInteger(snapshotTimeoutMs)||snapshotTimeoutMs<1||snapshotTimeoutMs>120000)throw Error("INVALID_PORTFOLIO_TIMEOUT");
 let busy=false;
 function endpointUrl(){
  if(!endpoint||!expectedGenesis||CLUSTER_GENESIS.test(expectedGenesis))throw Error("PORTFOLIO_UNAVAILABLE");
  try{publicKey(expectedGenesis);const u=new URL(endpoint);if(u.protocol!=="http:"||!["127.0.0.1","[::1]"].includes(u.hostname)||u.username||u.password||u.pathname!=="/"||u.search||u.hash)throw Error();return u.href;}catch{throw Error("PORTFOLIO_UNAVAILABLE");}
 }
 async function walletSnapshot(connection,wallet,limit,call){
  const owner=new PublicKey(asKey(wallet.address));
  let balance=null,balanceStatus="UNAVAILABLE";
  try{const n=await call(()=>connection.getBalance(owner,"confirmed"));if(Number.isSafeInteger(n)&&n>=0){balance=String(n);balanceStatus="AVAILABLE";}}catch{}
  const tokenAccounts=[],seenAccounts=new Set();let tokenSuccess=0,invalidAccounts=0;
  for(const program of TOKEN_PROGRAMS){
   try{
    const response=await call(()=>connection.getParsedTokenAccountsByOwner(owner,{programId:new PublicKey(program)},"confirmed"));
    if(!Array.isArray(response?.value))throw Error("INVALID_TOKEN_ACCOUNT_RESPONSE");
    tokenSuccess++;
    for(const row of response.value){
     const info=row?.account?.data?.parsed?.info,amount=info?.tokenAmount;
     try{
       if(!validAmount(amount?.amount)||!Number.isInteger(amount?.decimals)||amount.decimals<0||amount.decimals>18)throw Error("INVALID_TOKEN_ROW");
       const address=asKey(row.pubkey.toBase58()),mint=asKey(info.mint);
       if(seenAccounts.has(address))throw Error("DUPLICATE_TOKEN_ACCOUNT");
       seenAccounts.add(address);tokenAccounts.push({token_account:address,mint,amount_base_units:amount.amount,decimals:amount.decimals});
      }catch{invalidAccounts++;}
    }
   }catch{}
  }
  const tokenStatus=tokenSuccess===TOKEN_PROGRAMS.length&&invalidAccounts===0?"AVAILABLE":tokenSuccess?"PARTIAL":"UNAVAILABLE";
  let history=[],historyStatus="UNAVAILABLE";
  try{
   const signatures=await call(()=>connection.getSignaturesForAddress(owner,{limit},"confirmed"));
   if(!Array.isArray(signatures))throw Error("INVALID_SIGNATURE_RESPONSE");
   const parsed=signatures.length?await call(()=>connection.getParsedTransactions(signatures.map(x=>x.signature),{commitment:"confirmed",maxSupportedTransactionVersion:0})):[];
   if(!Array.isArray(parsed)||parsed.length!==signatures.length)throw Error("INVALID_PARSED_TRANSACTION_RESPONSE");
   history=signatures.map((s,i)=>{
    const tx=parsed[i],failed=Boolean(s.err??tx?.meta?.err);
    return {signature:s.signature,block_time:Number.isSafeInteger(s.blockTime)?s.blockTime:null,status:failed?"FAILED":tx?"CONFIRMED":"UNKNOWN",fee_lamports:Number.isSafeInteger(tx?.meta?.fee)?String(tx.meta.fee):null,transfers:tx?transferRows(tx):[]};
   });
   historyStatus=history.some(x=>x.status==="UNKNOWN")?"PARTIAL":"AVAILABLE";
  }catch{}
  return {address:wallet.address,created_at:wallet.created_at??null,balance_lamports:balance,balance_status:balanceStatus,token_accounts_status:tokenStatus,invalid_token_account_count:invalidAccounts,token_accounts:tokenAccounts,history_status:historyStatus,recent_transactions:history};
 }
 return {async snapshot({limit=5}={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>20)throw Error("INVALID_PORTFOLIO_LIMIT");
  if(busy)throw Error("PORTFOLIO_BUSY");busy=true;
  const controller=new AbortController(),deadline=performance.now()+snapshotTimeoutMs;
  const overall=setTimeout(()=>controller.abort(),snapshotTimeoutMs);
  const call=async fn=>{
   const remaining=Math.floor(deadline-performance.now());
   if(remaining<=0||controller.signal.aborted)throw Error("PORTFOLIO_DEADLINE");
   let timer;
   try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("PORTFOLIO_REQUEST_TIMEOUT")),Math.min(remaining,requestTimeoutMs));})]);}
   finally{clearTimeout(timer);}
  };
  try{
   const url=endpointUrl(),rows=await call(()=>walletStore.list());
   if(!Array.isArray(rows)||rows.length>20)throw Error("PORTFOLIO_DATA_INVALID");
   const seen=new Set();for(const w of rows){asKey(w.address);if(seen.has(w.address))throw Error("PORTFOLIO_DATA_INVALID");seen.add(w.address);}
   const connection=connectionFactory(url,controller.signal);
   let genesis;try{genesis=await call(()=>connection.getGenesisHash())}catch{throw Error("PORTFOLIO_RPC_UNAVAILABLE")}
   if(genesis!==expectedGenesis)throw Error("GENESIS_MISMATCH");
   const wallets=[];for(const wallet of rows)wallets.push(await walletSnapshot(connection,wallet,limit,call));
   let total=0n;for(const w of wallets)if(w.balance_lamports!==null)total+=BigInt(w.balance_lamports);
   const holdings=new Map();
   for(const w of wallets)for(const a of w.token_accounts){const old=holdings.get(a.mint);if(old&&old.decimals!==a.decimals)throw Error("TOKEN_DECIMALS_CONFLICT");holdings.set(a.mint,{mint:a.mint,decimals:a.decimals,amount_base_units:(BigInt(old?.amount_base_units??"0")+BigInt(a.amount_base_units)).toString(),account_count:(old?.account_count??0)+1});}
   const balanceComplete=wallets.every(w=>w.balance_status==="AVAILABLE");
   return {schema_version:"cook-local-wallet-portfolio.1",network:"localnet",genesis_hash:expectedGenesis,read_only:true,execution_enabled:false,as_of:new Date().toISOString(),wallet_count:wallets.length,total_sol_balance_lamports:balanceComplete?total.toString():null,balance_status:balanceComplete?"AVAILABLE":"PARTIAL",wallets,token_holdings_status:wallets.every(w=>w.token_accounts_status==="AVAILABLE")?"AVAILABLE":"PARTIAL",snapshot_consistency:"NON_ATOMIC_OBSERVATION",deadline_reached:controller.signal.aborted||performance.now()>=deadline,token_holdings:[...holdings.values()]};
  }finally{clearTimeout(overall);controller.abort();busy=false}
 }};
}
