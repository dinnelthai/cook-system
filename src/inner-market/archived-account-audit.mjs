import {isLocalHistoricalNetwork} from "../core/source-provenance.mjs";
import {parseBaseUnits,U64_MAX} from "../core/integer.mjs";

const label=(v,name)=>{if(typeof v!=="string"||!v.trim()||v!==v.trim()||v.length>256)throw new TypeError("invalid "+name);return v;};
const index=(v,name)=>{if(!Number.isSafeInteger(v)||v<0)throw new TypeError("invalid "+name);return v;};
const amount=(v,name)=>parseBaseUnits(typeof v==="number"&&Number.isSafeInteger(v)&&v>=0?String(v):v,{name,max:U64_MAX});
const fail=(code)=>{throw new Error(code);};
const arrays=(v,name)=>{if(!Array.isArray(v))fail("MISSING_"+name);return v;};

/** Strict offline normalization of an archived, JSON-encoded Localnet RPC receipt.
 * Finality and genesis labels are caller supplied. This never connects to RPC,
 * signs, submits, or authenticates a transaction. Unsupported shapes fail closed.
 */
export function normalizeArchivedReceipt(record,expectedGenesis){
 if(record?.genesisHash!==expectedGenesis)fail("GENESIS_MISMATCH");
 if(record.finality!=="FINALIZED")fail("RECEIPT_NOT_FINALIZED");
 const tx=record.transaction,meta=tx?.meta,message=tx?.transaction?.message;
 if(!meta||!message||!Object.hasOwn(meta,"err")||meta.err===undefined)fail("MISSING_METADATA");
 const signature=label(record.signature,"signature");
 if(tx.transaction.signatures?.[0]!==signature)fail("SIGNATURE_MISMATCH");
 const slot=index(tx.slot,"slot"),transactionIndex=index(record.transactionIndex,"transaction index");
 const staticKeys=arrays(message.accountKeys,"ACCOUNT_KEYS");
 // This adapter accepts raw JSON encoding, not jsonParsed key objects.
 const loaded=meta.loadedAddresses??{};
 if(message.addressTableLookups?.length&&(!Array.isArray(loaded.writable)||!Array.isArray(loaded.readonly)))fail("MISSING_LOADED_ADDRESSES");
 const keys=[...staticKeys,...arrays(loaded.writable??[],"LOADED_WRITABLE"),...arrays(loaded.readonly??[],"LOADED_READONLY")].map(k=>label(k,"account key"));
 if(!keys.length||new Set(keys).size!==keys.length)fail("INVALID_ACCOUNT_KEYS");
 const pre=arrays(meta.preBalances,"PRE_BALANCES"),post=arrays(meta.postBalances,"POST_BALANCES");
 if(pre.length!==keys.length||post.length!==keys.length)fail("BALANCE_LENGTH_MISMATCH");
 const fee=amount(meta.fee,"fee");
 const native=keys.map((address,i)=>({address,before:amount(pre[i],"pre balance"),after:amount(post[i],"post balance")}));
 const tokenRows=(rows)=>{
  const result=new Map();
  for(const row of rows){
   const i=index(row?.accountIndex,"token account index");
   if(i>=keys.length||result.has(i))fail("INVALID_TOKEN_ACCOUNT_INDEX");
   const decimals=index(row.uiTokenAmount?.decimals,"token decimals");if(decimals>255)fail("INVALID_TOKEN_DECIMALS");
   result.set(i,{mint:label(row.mint,"mint"),owner:label(row.owner,"token owner"),decimals,amount:amount(row.uiTokenAmount?.amount,"token amount")});
  }
  return result;
 };
 const beforeTokens=tokenRows(arrays(meta.preTokenBalances,"PRE_TOKEN_BALANCES"));
 const afterTokens=tokenRows(arrays(meta.postTokenBalances,"POST_TOKEN_BALANCES"));
 const tokens=[];
 for(const i of new Set([...beforeTokens.keys(),...afterTokens.keys()])){
  const a=beforeTokens.get(i),b=afterTokens.get(i);
  if(a&&b&&(a.mint!==b.mint||a.owner!==b.owner||a.decimals!==b.decimals))fail("TOKEN_IDENTITY_CHANGED");
  // A missing token row is not assumed zero unless the corresponding account
  // has zero native balance (new/closed account). Other cases need review.
  if((!a&&native[i].before!==0n)||(!b&&native[i].after!==0n))fail("AMBIGUOUS_TOKEN_BALANCE");
  const identity=a??b;
  tokens.push({address:keys[i],mint:identity.mint,owner:identity.owner,decimals:identity.decimals,before:a?.amount??0n,after:b?.amount??0n});
 }
 const outcome=meta.err===null?"SUCCESS":"FAILED";
 const issues=[];
 if(native.reduce((sum,r)=>sum+r.after-r.before,0n)!==-fee)issues.push("NATIVE_CONSERVATION_MISMATCH");
 if(outcome==="FAILED"&&(native.some((r,i)=>r.after-r.before!==(i===0?-fee:0n))||tokens.some(r=>r.before!==r.after)))issues.push("FAILED_RECEIPT_UNEXPECTED_DELTA");
 return {signature,slot,transactionIndex,outcome,fee,feePayer:keys[0],native,tokens,issues};
}

/** Closed historical interval audit for one explicitly designated native account
 * and one token account. Not a portfolio valuation or trade attribution engine.
 * Independent snapshots are supplied by the caller and must be attested elsewhere.
 */
export function auditArchivedAccountInterval(input){
 const {scope,opening,closing,receipts,historyComplete}=input??{};
 if(!isLocalHistoricalNetwork(scope?.network)||scope?.mode!=="READ_ONLY")fail("LOCALNET_READ_ONLY_REQUIRED");
 const genesis=label(scope.genesisHash,"genesis"),wallet=label(scope.wallet,"wallet"),tokenAccount=label(scope.tokenAccount,"token account"),mint=label(scope.mint,"mint");
 if(wallet===tokenAccount)fail("ACCOUNT_IDENTITY_CONFLICT");
 const start=index(scope.openingSlot,"opening slot"),end=index(scope.closingSlot,"closing slot");
 if(end<=start||typeof historyComplete!=="boolean")fail("INVALID_INTERVAL");
 const snapshot=(v,slot)=>{
  if(v?.genesisHash!==genesis||v.slot!==slot||v.wallet!==wallet||v.tokenAccount!==tokenAccount||v.mint!==mint)fail("SNAPSHOT_SCOPE_MISMATCH");
  return {native:amount(v.lamports,"snapshot lamports"),token:amount(v.tokenAmount,"snapshot token")};
 };
 const a=snapshot(opening,start),b=snapshot(closing,end);
 if(!Array.isArray(receipts)||receipts.length>10000)fail("INVALID_RECEIPT_LIST");
 const seen=new Set(),positions=new Set();
 const normalized=receipts.map(r=>normalizeArchivedReceipt(r,genesis));
 for(const r of normalized){
  if(seen.has(r.signature))fail("DUPLICATE_RECEIPT");
  seen.add(r.signature);
  const pos=r.slot+":"+r.transactionIndex;
  if(positions.has(pos))fail("DUPLICATE_TRANSACTION_POSITION");
  positions.add(pos);
  if(r.slot<=start||r.slot>end)fail("RECEIPT_OUTSIDE_INTERVAL");
 }
 normalized.sort((x,y)=>x.slot-y.slot||x.transactionIndex-y.transactionIndex);
 let native=a.native,token=a.token,fees=0n,failedFees=0n;
 const issues=[];
 if(!historyComplete)issues.push({code:"HISTORY_INCOMPLETE"});
 for(const r of normalized){
  const n=r.native.find(x=>x.address===wallet),t=r.tokens.find(x=>x.address===tokenAccount);
  const tokenNative=r.native.find(x=>x.address===tokenAccount);
  const issue=code=>issues.push({code,signature:r.signature});
  for(const code of r.issues)issue(code);
  if(!n&&!tokenNative)issue("UNRELATED_RECEIPT");
  if(n){if(n.before!==native)issue("NATIVE_CONTINUITY_MISMATCH");native+=n.after-n.before;}
  if(tokenNative&&!t&&(tokenNative.before!==0n||tokenNative.after!==0n))issue("TOKEN_EVIDENCE_MISSING");
  if(t){
   if(t.owner!==wallet||t.mint!==mint)issue("TOKEN_SCOPE_MISMATCH");
   else {if(t.before!==token)issue("TOKEN_CONTINUITY_MISMATCH");token+=t.after-t.before;}
  }
  if(r.feePayer===wallet){fees+=r.fee;if(r.outcome==="FAILED")failedFees+=r.fee;}
 }
 if(native!==b.native)issues.push({code:"CLOSING_NATIVE_MISMATCH"});
 if(token!==b.token)issues.push({code:"CLOSING_TOKEN_MISMATCH"});
 if(native<0n||token<0n||native>U64_MAX||token>U64_MAX)issues.push({code:"BALANCE_OUT_OF_RANGE"});
 const consistent=issues.length===0;
 return {schema_version:"cook-archived-account-audit.1",status:consistent?"INTERNALLY_CONSISTENT":"REVIEW_REQUIRED",source_attestation:"UNKNOWN",history_complete_attested:false,receipt_count:normalized.length,
  native:{opening_lamports:a.native.toString(),replayed_closing_lamports:native.toString(),observed_closing_lamports:b.native.toString(),difference_lamports:(b.native-native).toString()},
  token:{opening_base_units:a.token.toString(),replayed_closing_base_units:token.toString(),observed_closing_base_units:b.token.toString(),difference_base_units:(b.token-token).toString()},
  observed_network_fees_lamports:fees.toString(),observed_failed_tx_fees_lamports:failedFees.toString(),issues,settlement_allowed:false,execution_enabled:false};
}
