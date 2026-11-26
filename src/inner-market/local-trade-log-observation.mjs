import {decodePumpTransaction,archivedPumpReceiptIssue} from "../adapters/pump/pump-transaction-parser.mjs";
import {reconcilePumpSwapTradesWithTransaction} from "../adapters/pump/transaction-reconciler.mjs";
const SOL="So11111111111111111111111111111111111111112";
const kinds=new Set(["POOL_BUY_EXECUTED","POOL_SELL_EXECUTED"]);
const amount=v=>typeof v==="string"&&/^[1-9][0-9]{0,19}$/.test(v)&&BigInt(v)<2n**64n;
// Strict retrospective receipt observations only. No signer, orders, quote or routing.
// Parsed Web3 public keys are serialized to their public base58 representations.
export function observedReceiptTrades(tx,signatureRow,owner,{decode=decodePumpTransaction,reconcile=reconcilePumpSwapTradesWithTransaction}={}){
 try{
  if(signatureRow?.confirmationStatus!=="finalized"||signatureRow.err!==null||tx?.meta?.err!==null||!Number.isSafeInteger(signatureRow.slot)||!Number.isSafeInteger(signatureRow.blockTime)||signatureRow.blockTime<0||signatureRow.blockTime>8640000000000)return [];
  if(typeof signatureRow.signature!=="string"||!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signatureRow.signature))return [];
  const receipt=JSON.parse(JSON.stringify(tx));
  if(archivedPumpReceiptIssue(receipt,signatureRow.signature,signatureRow.slot))return [];
  const decoded=decode({transaction:receipt,signature:signatureRow.signature,network:"local_sim"});
  if(decoded.status!=="DECODED"||!Array.isArray(decoded.events)||decoded.events.length!==1)return [];
  const e=decoded.events[0],p=e?.payload;
  if(!kinds.has(e?.event_kind)||e.provenance!=="observed_chain"||e.market?.network!=="local_sim"||p?.actor_address!==owner||e.market.quote_mint!==SOL||p.quote_mint!==SOL||p.base_mint!==e.market.token_mint||typeof p.pool_address!=="string"||!amount(p.token_amount_base_units)||!amount(p.quote_amount_base_units)||p.signature!==signatureRow.signature)return [];
  // Never substitute pool notional for a user's actual quote amount.
  const explicit=e.event_kind==="POOL_BUY_EXECUTED"?p.raw_amount_fields?.user_quote_amount_in:p.raw_amount_fields?.user_quote_amount_out;
  if(explicit!==p.quote_amount_base_units)return [];
  if(reconcile({transaction:receipt,tradeEvents:[e]}).status!=="PASS")return [];
  return [{signature:signatureRow.signature,wallet:owner,mint:e.market.token_mint,pool:p.pool_address,side:e.event_kind==="POOL_BUY_EXECUTED"?"BUY":"SELL",quote_lamports:p.quote_amount_base_units,block_time:signatureRow.blockTime,slot:signatureRow.slot,evidence:"FINALIZED_RECEIPT_BALANCE_MATCH"}];
 }catch{return []}
}
