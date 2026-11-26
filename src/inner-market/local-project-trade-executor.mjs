import {createRequire} from "node:module";
import {Connection,PublicKey,Transaction} from "@solana/web3.js";
import {publicKey} from "./local-faucet.mjs";
import {PUMP_AMM_PROGRAM_ID} from "../adapters/pump/pump-decoder.mjs";
const require=createRequire(import.meta.url),BN=require("bn.js"),bs58=require("bs58");
const {OnlinePumpAmmSdk,PUMP_AMM_SDK,buyQuoteInput:calculateBuyQuote,sellBaseInput:calculateSellQuote}=require("@pump-fun/pump-sdk/swap");
const SOL="So11111111111111111111111111111111111111112";
const PUBLIC_GENESIS=/^(5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp|EtWTRABZaYq6iMfeYKouRu166VU2xqa1|4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z)/;

/** Real Localnet signer/broadcaster for a server-bound project preview. The
 * caller must persist onSubmitted before this method sends any bytes. */
export function createLocalProjectTradeExecutor({endpoint,expectedGenesis,enabled,wallets,connectionFactory=url=>new Connection(url,{commitment:"confirmed",disableRetryOnRateLimit:true,fetch:(u,o)=>fetch(u,{...o,redirect:"error",signal:AbortSignal.timeout(8000)})}),sdkFactory=rpc=>new OnlinePumpAmmSdk(rpc),instructionFactory=(side,state,amount,quote)=>side==="buy"?PUMP_AMM_SDK.buyInstructions(state,new BN(quote.estimated_receive_base_units),new BN(quote.slippage_limit_base_units)):PUMP_AMM_SDK.sellInstructions(state,amount,new BN(quote.slippage_limit_base_units)),polls=30,pollDelayMs=1000,blockPollDelayMs=500}={}){
 function rpcUrl(){
  if(!enabled||!expectedGenesis||PUBLIC_GENESIS.test(expectedGenesis))throw Error("PROJECT_TRADE_EXECUTION_DISABLED");
  let url;try{publicKey(expectedGenesis);url=new URL(endpoint)}catch{throw Error("INVALID_LOCAL_CONFIGURATION")}
  if(url.protocol!=="http:"||!["127.0.0.1","[::1]"].includes(url.hostname)||url.username||url.password||url.pathname!=="/"||url.search||url.hash)throw Error("INVALID_LOCAL_CONFIGURATION");
  return url.href;
 }
 async function waitBlocks({blocks,project}){
  if(!Number.isInteger(blocks)||blocks<0||blocks>20||project.network?.cluster!=="localnet"||project.network.genesis_hash!==expectedGenesis)throw Error("INVALID_TRADE_DELAY_BLOCKS");if(blocks===0)return {blocks_waited:0};
  const rpc=connectionFactory(rpcUrl());if(await rpc.getGenesisHash()!==expectedGenesis)throw Error("GENESIS_MISMATCH");const start=await rpc.getBlockHeight("confirmed");if(!Number.isSafeInteger(start)||start<0)throw Error("BLOCK_HEIGHT_UNAVAILABLE");
  for(let attempt=0;attempt<120;attempt++){const current=await rpc.getBlockHeight("confirmed");if(Number.isSafeInteger(current)&&current>=start+blocks)return {blocks_waited:current-start};if(blockPollDelayMs)await new Promise(resolve=>setTimeout(resolve,blockPollDelayMs))}
  throw Error("BLOCK_DELAY_TIMEOUT");
 }
 async function reconcile({signature}){
  if(typeof signature!=="string"||!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature))throw Error("INVALID_TRANSACTION_SIGNATURE");
  const rpc=connectionFactory(rpcUrl());if(await rpc.getGenesisHash()!==expectedGenesis)throw Error("GENESIS_MISMATCH");
  const status=(await rpc.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];
  if(status?.err)return {status:"FAILED",signature,reason:"CHAIN_REJECTED"};
  if(status&&["confirmed","finalized"].includes(status.confirmationStatus))return {status:"CONFIRMED",signature};
  return {status:"UNKNOWN",signature,reason:"CONFIRMATION_PENDING"};
 }
 function quoteFromState(side,state,amount,slippageBps){
  const slippage=slippageBps/100;
  if(side==="buy"){
   const q=calculateBuyQuote({quote:amount,slippage,quoteTransferFee:state.quoteTransferFee,tradeV2:false,baseReserve:state.poolBaseAmount,quoteReserve:state.poolQuoteAmount,virtualQuoteReserves:state.pool.virtualQuoteReserves,baseMintAccount:state.baseMintAccount,baseMint:state.baseMint,coinCreator:state.pool.coinCreator,creator:state.pool.creator,feeConfig:state.feeConfig,globalConfig:state.globalConfig,quoteMint:state.pool.quoteMint,isMayhemMode:state.pool.isMayhemMode,creatorFeeBps:state.pool.creatorFeeBps});
   return {estimated_receive_base_units:q.base.toString(),slippage_limit_base_units:q.maxQuote.toString(),estimated_fee_base_units:(amount.sub(q.internalQuoteWithoutFees)).toString()};
  }
  const q=calculateSellQuote({base:amount,slippage,quoteTransferFee:state.quoteTransferFee,baseReserve:state.poolBaseAmount,quoteReserve:state.poolQuoteAmount,virtualQuoteReserves:state.pool.virtualQuoteReserves,feeBucketsTotal:state.pool.protocolFees.add(state.pool.creatorFees),baseMintAccount:state.baseMintAccount,baseMint:state.baseMint,coinCreator:state.pool.coinCreator,creator:state.pool.creator,feeConfig:state.feeConfig,globalConfig:state.globalConfig,quoteMint:state.pool.quoteMint,isMayhemMode:state.pool.isMayhemMode,creatorFeeBps:state.pool.creatorFeeBps});
  return {estimated_receive_base_units:q.uiQuote.toString(),slippage_limit_base_units:q.minQuote.toString(),estimated_fee_base_units:(q.internalQuoteAmountOut.sub(q.uiQuote)).toString()};
 }
 async function quoteWallet({project,preview,order}){
  const url=rpcUrl();if(project.network?.cluster!=="localnet"||project.network.genesis_hash!==expectedGenesis||preview.project_id!==project.project_id||preview.mint!==project.token?.mint)throw Error("PROJECT_TRADE_BINDING_MISMATCH");const market=project.markets?.find(m=>m.market_id===preview.market_id);if(!market||market.market_account!==preview.market_account||market.identity?.curve_program_id!==PUMP_AMM_PROGRAM_ID)throw Error("PROJECT_MARKET_MISMATCH");
  const rpc=connectionFactory(url);if(await rpc.getGenesisHash()!==expectedGenesis)throw Error("GENESIS_MISMATCH");const user=new PublicKey(order.wallet),state=await sdkFactory(rpc).swapSolanaState(new PublicKey(market.market_account),user);if(state.pool.baseMint.toBase58()!==preview.mint||state.pool.quoteMint.toBase58()!==SOL)throw Error("MARKET_CHANGED");return quoteFromState(preview.side,state,new BN(order.amount_base_units),preview.slippage_bps);
 }
 async function executeWallet({project,preview,order,preSign,onSubmitted}){
  const url=rpcUrl();if(typeof onSubmitted!=="function")throw Error("PROJECT_TRADE_JOURNAL_REQUIRED");
  if(project.network?.cluster!=="localnet"||project.network.genesis_hash!==expectedGenesis||preview.project_id!==project.project_id||preview.project_revision!==project.revision||preview.mint!==project.token?.mint)throw Error("PROJECT_TRADE_BINDING_MISMATCH");
  const market=project.markets?.find(m=>m.market_id===preview.market_id);
  if(!market||market.market_account!==preview.market_account||market.venue!=="PUMP_SWAP"||market.verification_status!=="VERIFIED"||market.identity?.curve_program_id!==PUMP_AMM_PROGRAM_ID)throw Error("PROJECT_MARKET_MISMATCH");
  publicKey(order.wallet);if(!/^[1-9][0-9]{0,19}$/.test(order.amount_base_units)||BigInt(order.amount_base_units)>=2n**64n)throw Error("INVALID_TRADE_AMOUNT");
  const owned=await wallets.list();if(!owned.some(w=>w.address===order.wallet))throw Error("WALLET_NOT_FOUND");
  const rpc=connectionFactory(url);if(await rpc.getGenesisHash()!==expectedGenesis)throw Error("GENESIS_MISMATCH");
  const signer=await wallets.loadSigner(order.wallet);if(signer.publicKey.toBase58()!==order.wallet)throw Error("WALLET_KEY_INVALID");
  const sdk=sdkFactory(rpc),state=await sdk.swapSolanaState(new PublicKey(market.market_account),signer.publicKey);
  if(state.pool.baseMint.toBase58()!==preview.mint||state.pool.quoteMint.toBase58()!==SOL)throw Error("MARKET_CHANGED");
  const amount=new BN(order.amount_base_units),side=preview.side;
  const nativeBalance=await rpc.getBalance(signer.publicKey,"confirmed");if(!Number.isSafeInteger(nativeBalance)||nativeBalance<0)return {status:"REJECTED",reason:"BALANCE_UNAVAILABLE"};const solBalance=BigInt(nativeBalance);
  if(side==="buy"){
   if(solBalance<BigInt(order.amount_base_units))return {status:"REJECTED",reason:"INSUFFICIENT_BALANCE"};
  }else{
   const balance=(await rpc.getTokenAccountBalance(state.userBaseTokenAccount,"confirmed")).value.amount;if(!/^\d+$/.test(balance)||BigInt(balance)<BigInt(order.amount_base_units))return {status:"REJECTED",reason:"INSUFFICIENT_BALANCE"};
  }
  const slippageBps=preview.slippage_bps;if(!Number.isInteger(slippageBps)||slippageBps<1||slippageBps>5000||!/^\d+$/.test(order.estimated_receive_base_units??"")||!/^\d+$/.test(order.slippage_limit_base_units??""))throw Error("PROJECT_TRADE_QUOTE_INVALID");
  const instructions=await instructionFactory(side,state,amount,order);
  const simulation=await rpc.simulateTransaction(new Transaction({feePayer:signer.publicKey}).add(...instructions),[signer]);if(simulation.value.err)return {status:"REJECTED",reason:"SIMULATION_FAILED"};
  const latest=await rpc.getLatestBlockhash("confirmed"),tx=new Transaction({feePayer:signer.publicKey,recentBlockhash:latest.blockhash}).add(...instructions);
  const maxSpend=side==="buy"?BigInt(order.slippage_limit_base_units):0n;if(side==="buy"&&solBalance<maxSpend)return {status:"REJECTED",reason:"INSUFFICIENT_BALANCE"};
  if(typeof rpc.getFeeForMessage==="function"){const fee=(await rpc.getFeeForMessage(tx.compileMessage(),"confirmed"))?.value;if(!Number.isSafeInteger(fee)||solBalance<maxSpend+BigInt(fee))return {status:"REJECTED",reason:"INSUFFICIENT_BALANCE_FOR_FEE"}}
  if(typeof preSign!=="function")throw Error("PROJECT_TRADE_AUTHORIZATION_RECHECK_REQUIRED");preSign();tx.sign(signer);
  const signature=tx.signature?bs58.encode(tx.signature):null;if(!signature)throw Error("TRANSACTION_SIGNATURE_MISSING");
  await onSubmitted({signature});
  let returned;try{returned=await rpc.sendRawTransaction(tx.serialize(),{maxRetries:0,preflightCommitment:"confirmed"})}catch{return {status:"UNKNOWN",signature,reason:"SUBMISSION_UNCERTAIN"}}
  if(typeof returned!=="string"||returned!==signature)return {status:"UNKNOWN",signature,reason:"SIGNATURE_MISMATCH"};
  const chainSignature=signature;
  for(let i=0;i<polls;i++){
   const status=(await rpc.getSignatureStatuses([chainSignature],{searchTransactionHistory:true})).value[0];
   if(status?.err)return {status:"FAILED",signature:chainSignature,reason:"CHAIN_REJECTED"};
   if(status&&["confirmed","finalized"].includes(status.confirmationStatus))return {status:"CONFIRMED",signature:chainSignature};
   if(await rpc.getBlockHeight("confirmed")>latest.lastValidBlockHeight)return {status:"UNKNOWN",signature:chainSignature,reason:"BLOCKHASH_EXPIRED"};
   if(pollDelayMs)await new Promise(resolve=>setTimeout(resolve,pollDelayMs));
  }
  return {status:"UNKNOWN",signature:chainSignature,reason:"CONFIRMATION_TIMEOUT"};
 }
 return {quoteWallet,executeWallet,reconcile,waitBlocks};
}
