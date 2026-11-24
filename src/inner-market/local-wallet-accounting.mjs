import { parseBaseUnits,U128_MAX } from "../core/integer.mjs";

const alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function publicKey(value,name){
  if(typeof value!=="string"||value.length<32||value.length>44)throw new TypeError(name+" must be a 32-byte base58 public identifier");
  let n=0n;
  for(const c of value){const i=alphabet.indexOf(c);if(i<0)throw new TypeError("invalid base58 "+name);n=n*58n+BigInt(i)}
  const leading=value.match(/^1*/)[0].length;
  const bytes=n===0n?0:Math.ceil(n.toString(16).length/2);
  if(leading+bytes!==32)throw new TypeError(name+" must decode to 32 bytes");
  return value;
}
function exactKeys(o,keys){
  if(!o||typeof o!=="object"||Array.isArray(o)||Object.keys(o).some(k=>!keys.includes(k)))throw new TypeError("unexpected configuration field; secrets are not accepted");
}
/** Public identifiers only. No signer, RPC, secret loading or submission. */
export function validateLocalWalletConfig(config){
  exactKeys(config,["mode","network","expectedGenesisHash","feePayerPublicKey"]);
  if(config.mode!=="READ_ONLY"||config.network!=="localnet")throw new Error("only read-only localnet accounting is supported");
  return Object.freeze({mode:config.mode,network:config.network,expectedGenesisHash:publicKey(config.expectedGenesisHash,"genesis hash"),feePayerPublicKey:publicKey(config.feePayerPublicKey,"fee payer")});
}
/** Reconcile historical, independently verified test receipts including failed transactions. */
export function auditLocalNetworkFees({config,observedGenesisHash,receipts,historyComplete=false}){
  const c=validateLocalWalletConfig(config);
  if(observedGenesisHash!==c.expectedGenesisHash)throw new Error("test network identity mismatch");
  if(!Array.isArray(receipts)||typeof historyComplete!=="boolean")throw new TypeError("receipts and completeness required");
  let fees=0n,failed=0n,count=0;const seen=new Set(),issues=[];
  for(const r of receipts){
    if(!r||typeof r.signature!=="string"||!r.signature.trim()||seen.has(r.signature))throw new Error("missing or duplicate receipt");
    seen.add(r.signature);
    if(r.genesisHash!==observedGenesisHash)throw new Error("receipt network mismatch");
    if(r.finality!=="FINALIZED"||r.reconciliation!=="PASS"){issues.push("UNVERIFIED_RECEIPT:"+r.signature);continue;}
    if(!["SUCCESS","FAILED"].includes(r.outcome))throw new Error("unknown receipt outcome");
    const payer=publicKey(r.feePayerPublicKey,"receipt fee payer");
    if(payer!==c.feePayerPublicKey)continue;
    const fee=parseBaseUnits(r.feeLamports,{name:"network fee",max:U128_MAX});
    fees+=fee;count++;
    if(r.outcome==="FAILED")failed+=fee;
  }
  if(!historyComplete)issues.push("HISTORY_INCOMPLETE");
  return {status:issues.length?"REVIEW_REQUIRED":"RECONCILED",network:"localnet",fee_payer_public_key:c.feePayerPublicKey,confirmed_receipt_count:count,observed_network_fee_lamports:fees.toString(),observed_failed_tx_fee_lamports:failed.toString(),verified_network_fee_lamports:issues.length?null:fees.toString(),issues,execution_enabled:false,note:"Historical network fee accounting only; no transaction creation, signing or debiting. Source attestations are caller supplied."};
}
