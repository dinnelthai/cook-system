import test from "node:test";
import assert from "node:assert/strict";
import {createLocalWalletPortfolio} from "../src/inner-market/local-wallet-portfolio.mjs";
const a="11111111111111111111111111111111",b="11111111111111111111111111111112",mint="11111111111111111111111111111113",signature="1".repeat(64),genesis="11111111111111111111111111111114",program="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const row=(address,amount,decimals=2)=>({pubkey:{toBase58:()=>address},account:{data:{parsed:{info:{mint,tokenAmount:{amount,decimals}}}}}});
function fixture(){
 const calls=[];const connection={
  getGenesisHash:async()=>genesis,
  getBalance:async owner=>owner.toBase58()===a?1000000000:2000000000,
  getParsedTokenAccountsByOwner:async(owner,filter)=>{calls.push(["tokens",owner.toBase58(),filter.programId.toBase58()]);return {value:filter.programId.toBase58()===program&&owner.toBase58()===a?[row("11111111111111111111111111111115","500")]:[]};},
  getSignaturesForAddress:async(owner)=>owner.toBase58()===a?[{signature,blockTime:100,err:null}]:[],
  getParsedTransactions:async signatures=>signatures.map(()=>({transaction:{message:{instructions:[{program:"system",parsed:{type:"transfer",info:{source:a,destination:b,lamports:100}}},{program:"spl-token",parsed:{type:"transferChecked",info:{source:a,destination:b,mint,tokenAmount:{amount:"500",decimals:2}}}}]}},meta:{err:null,fee:5000,innerInstructions:[]}}))
 };
 const walletStore={list:async()=>[{address:a,created_at:"t1"},{address:b,created_at:"t2"}],loadSigner:async()=>{throw Error("must not load signer")}};
 return {service:createLocalWalletPortfolio({endpoint:"http://127.0.0.1:8899",expectedGenesis:genesis,walletStore,connectionFactory:url=>{assert.equal(url,"http://127.0.0.1:8899/");return connection;}}),calls};
}
test("portfolio reads only managed wallets and aggregates exact SOL and SPL balances",async()=>{
 const {service,calls}=fixture(),result=await service.snapshot({limit:5});
 assert.equal(result.schema_version,"cook-local-wallet-portfolio.1");assert.equal(result.execution_enabled,false);assert.equal(result.wallet_count,2);assert.equal(result.total_sol_balance_lamports,"3000000000");assert.equal(result.token_holdings[0].amount_base_units,"500");assert.equal(result.wallets[0].recent_transactions[0].status,"CONFIRMED");assert.equal(result.wallets[0].recent_transactions[0].transfers.length,2);assert.ok(calls.every(x=>[a,b].includes(x[1])));
});
test("portfolio pins local Genesis and rejects public or malformed endpoints",async()=>{
 const {service}=fixture();const {snapshot}=service;await assert.rejects(()=>snapshot({limit:21}),/INVALID_PORTFOLIO_LIMIT/);
 const walletStore={list:async()=>[]};
 for(const options of [{endpoint:"https://api.mainnet-beta.solana.com"},{endpoint:"http://192.168.1.2:8899"},{expectedGenesis:"EtWTRABZaYq6iMfeYKouRu166VU2xqa1"}]){
  const svc=createLocalWalletPortfolio({endpoint:"http://127.0.0.1:8899",expectedGenesis:genesis,walletStore,...options});await assert.rejects(()=>svc.snapshot(),/PORTFOLIO_UNAVAILABLE/);
 }
 const mismatch=createLocalWalletPortfolio({endpoint:"http://127.0.0.1:8899",expectedGenesis:genesis,walletStore,connectionFactory:()=>({getGenesisHash:async()=>"wrong"})});await assert.rejects(()=>mismatch.snapshot(),/GENESIS_MISMATCH/);
});
test("partial RPC failures remain unknown and are never converted to zero",async()=>{
 const walletStore={list:async()=>[{address:a}]},connectionFactory=()=>({getGenesisHash:async()=>genesis,getBalance:async()=>{throw Error("offline")},getParsedTokenAccountsByOwner:async()=>{throw Error("offline")},getSignaturesForAddress:async()=>{throw Error("offline")}});
 const result=await createLocalWalletPortfolio({endpoint:"http://127.0.0.1:8899",expectedGenesis:genesis,walletStore,connectionFactory}).snapshot();
 assert.equal(result.balance_status,"PARTIAL");assert.equal(result.total_sol_balance_lamports,null);assert.equal(result.wallets[0].balance_lamports,null);assert.equal(result.wallets[0].token_accounts_status,"UNAVAILABLE");assert.equal(result.wallets[0].history_status,"UNAVAILABLE");
});

test("malformed token rows cannot be reported as a complete portfolio",async()=>{
 const walletStore={list:async()=>[{address:a}]};
 const connectionFactory=()=>({getGenesisHash:async()=>genesis,getBalance:async()=>0,
 getParsedTokenAccountsByOwner:async()=>({value:[row("invalid","500")]}),getSignaturesForAddress:async()=>[]});
 const result=await createLocalWalletPortfolio({endpoint:"http://127.0.0.1:8899",expectedGenesis:genesis,walletStore,connectionFactory}).snapshot();
 assert.equal(result.token_holdings_status,"PARTIAL");
 assert.equal(result.wallets[0].invalid_token_account_count,2);
 assert.equal(result.snapshot_consistency,"NON_ATOMIC_OBSERVATION");
 assert.deepEqual(result.token_holdings,[]);
});

test("stalled read calls are bounded and do not leave the portfolio permanently busy",async()=>{
 const never=()=>new Promise(()=>{}),walletStore={list:async()=>[{address:a}]};
 const connectionFactory=()=>({getGenesisHash:async()=>genesis,getBalance:never,getParsedTokenAccountsByOwner:never,getSignaturesForAddress:never});
 const service=createLocalWalletPortfolio({endpoint:"http://127.0.0.1:8899",expectedGenesis:genesis,walletStore,connectionFactory,requestTimeoutMs:10,snapshotTimeoutMs:30});
 for(let i=0;i<2;i++){
  const r=await service.snapshot();assert.equal(r.balance_status,"PARTIAL");assert.equal(r.total_sol_balance_lamports,null);assert.equal(r.token_holdings_status,"PARTIAL");
 }
});

test("failed and unknown local receipts never expose instruction amounts as executed transfers",async()=>{
 const walletStore={list:async()=>[{address:a}]};
 const tx={transaction:{message:{instructions:[{program:"system",parsed:{type:"transfer",info:{source:a,destination:b,lamports:100}}}]}},meta:{err:{InstructionError:[0,"fixture"]},fee:5000}};
 const connectionFactory=()=>({getGenesisHash:async()=>genesis,getBalance:async()=>0,getParsedTokenAccountsByOwner:async()=>({value:[]}),
 getSignaturesForAddress:async()=>[{signature,err:null},{signature:"2".repeat(64),err:null}],getParsedTransactions:async()=>[tx,{transaction:tx.transaction}]});
 const r=await createLocalWalletPortfolio({endpoint:"http://127.0.0.1:8899",expectedGenesis:genesis,walletStore,connectionFactory}).snapshot();
 const [failed,unknown]=r.wallets[0].recent_transactions;
 assert.equal(failed.status,"FAILED");assert.equal(failed.fee_lamports,"5000");assert.deepEqual(failed.transfers,[]);
 assert.equal(unknown.status,"UNKNOWN");assert.deepEqual(unknown.transfers,[]);assert.equal(r.wallets[0].history_status,"PARTIAL");
});
test("same token account returned for multiple managed wallets is not double counted",async()=>{
 const walletStore={list:async()=>[{address:a},{address:b}]};
 const connectionFactory=()=>({getGenesisHash:async()=>genesis,getBalance:async()=>0,getParsedTokenAccountsByOwner:async(owner,filter)=>({value:filter.programId.toBase58()===program?[row("11111111111111111111111111111115","500")]:[]}),getSignaturesForAddress:async()=>[]});
 const r=await createLocalWalletPortfolio({endpoint:"http://127.0.0.1:8899",expectedGenesis:genesis,walletStore,connectionFactory}).snapshot();
 assert.equal(r.token_account_scope_conflict,true);assert.equal(r.token_holdings_status,"PARTIAL");assert.equal(r.token_holdings[0].amount_base_units,"500");
});
