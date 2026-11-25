import { SolanaRpcClient } from "../adapters/pump/solana-rpc.mjs";
import { decodePumpTransaction } from "../adapters/pump/pump-transaction-parser.mjs";
import { decodeMintAccount, decodeBondingCurveAccount, decodePumpSwapPoolAccount } from "../adapters/pump/pump-account-codec.mjs";
import { PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID } from "../adapters/pump/pump-decoder.mjs";
import { derivePumpBondingCurveAddress } from "../adapters/pump/pump-history-collector.mjs";
import { assertProjectAggregate } from "./project-aggregate.mjs";

const PUBLIC_GENESIS = /^(5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp|EtWTRABZaYq6iMfeYKouRu166VU2xqa1|4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z)/;
function localEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(u.hostname) || u.username || u.password || u.pathname !== "/" || u.search || u.hash) return null;
    return u.href;
  } catch { return null; }
}
const slot = n => Number.isSafeInteger(n) && n >= 0;

/** Read-only observation. The pinned endpoint is not an independent trust anchor.
 * No Project mutation, signer, submission, or automatic lifecycle promotion. */
export function createProjectEvidenceReader({ endpoint, expectedGenesis, fetchImpl = globalThis.fetch, decodeTransaction = decodePumpTransaction } = {}) {
  const url = localEndpoint(endpoint);
  const configured = Boolean(url && typeof expectedGenesis === "string" &&
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(expectedGenesis) && !PUBLIC_GENESIS.test(expectedGenesis));
  const rpc = configured ? new SolanaRpcClient({ endpoint: url, commitment: "finalized", timeoutMs: 3000, maxRetries: 0, strictEnvelope: true,
    fetchImpl: (u, init) => fetchImpl(u, { ...init, redirect: "error" }) }) : null;
  let busy = false;
  return async function inspect(projectInput) {
    const p = assertProjectAggregate(projectInput);
    const result = { schema_version: "cook-project-evidence-observation.1", project_id: p.project_id, project_revision: p.revision,
      mint: p.token.mint, signature: p.token.issuance_signature, status: "UNKNOWN", checks: [],
      source_attestation: "UNKNOWN", execution_enabled: false, lifecycle_mutated: false };
    const finish = (status, code) => { result.status = status; result.checks.push(code); return result; };
    if (!configured) return finish("UNKNOWN", "PRIVATE_RPC_NOT_CONFIGURED");
    if (p.network.cluster !== "localnet" || p.network.genesis_hash !== expectedGenesis) return finish("REVIEW_REQUIRED", "PROJECT_NETWORK_PIN_MISMATCH");
    if (!p.token.mint || !p.token.issuance_signature || !p.token.creator_wallet_address || p.token.supply_base_units === null || p.token.decimals === null) return finish("UNKNOWN", "ISSUANCE_EVIDENCE_INCOMPLETE");
    if (busy) return finish("UNKNOWN", "READER_BUSY");
    busy = true;
    try {
      if (await rpc.getGenesisHash() !== expectedGenesis) return finish("REVIEW_REQUIRED", "RPC_GENESIS_MISMATCH");
      result.checks.push("GENESIS_PIN_MATCHED");
      const tx = await rpc.getTransaction(p.token.issuance_signature);
      if (!tx) return finish("UNKNOWN", "RECEIPT_UNAVAILABLE");
      if (!slot(tx.slot) || tx.transaction?.signatures?.[0] !== p.token.issuance_signature || !tx.meta || !Object.hasOwn(tx.meta, "err")) return finish("REVIEW_REQUIRED", "RECEIPT_IDENTITY_INVALID");
      if (tx.meta.err !== null) return finish("REVIEW_REQUIRED", "ISSUANCE_TRANSACTION_FAILED");
      result.receipt_slot = tx.slot;
      const decoded = decodeTransaction({ transaction: tx, signature: p.token.issuance_signature, network: "local_sim" });
      const creates = decoded.events?.filter(x => x.event_kind === "MARKET_CREATED" && x.market?.token_mint === p.token.mint) ?? [];
      if (creates.length !== 1) return finish("REVIEW_REQUIRED", "PUMP_CREATE_EVIDENCE_MISSING_OR_AMBIGUOUS");
      const created = creates[0];
      if (created.payload?.creator_address !== p.token.creator_wallet_address || created.payload?.token_total_supply_base_units !== p.token.supply_base_units || created.market?.quote_mint !== p.network.quote_mint) return finish("REVIEW_REQUIRED", "CREATE_EVENT_PROJECT_MISMATCH");
      result.checks.push("FINALIZED_CREATE_RECEIPT_MATCHED");
      const account = await rpc.getAccountInfo(p.token.mint, { minContextSlot: tx.slot });
      if (!account?.value) return finish("UNKNOWN", "MINT_ACCOUNT_UNAVAILABLE");
      if (!slot(account.context?.slot) || account.context.slot < tx.slot || account.value.executable !== false) return finish("REVIEW_REQUIRED", "MINT_ACCOUNT_CONTEXT_INVALID");
      let mint;
      try { mint = decodeMintAccount(account); } catch { return finish("REVIEW_REQUIRED", "MINT_ACCOUNT_INVALID"); }
      if (mint.decimals !== p.token.decimals || mint.owner_program_id !== created.payload.token_program_id) return finish("REVIEW_REQUIRED", "MINT_ACCOUNT_PROJECT_MISMATCH");
      if (await rpc.getGenesisHash() !== expectedGenesis) return finish("REVIEW_REQUIRED", "RPC_GENESIS_CHANGED");
      result.mint_context_slot = account.context.slot;
      result.current_supply_base_units = mint.supply_base_units;
      result.issued_supply_base_units = p.token.supply_base_units;
      return finish("OBSERVATIONS_MATCH", "MINT_ACCOUNT_MATCHED");
    } catch { return finish("UNKNOWN", "RPC_OR_DECODER_UNAVAILABLE"); }
    finally { busy = false; }
  };
}

/** Inspect registered market identity, not prices, trade instructions or execution readiness. */
export function createProjectMarketReader({endpoint,expectedGenesis,fetchImpl=globalThis.fetch}={}){
 const url=localEndpoint(endpoint);
 const configured=Boolean(url&&typeof expectedGenesis==="string"&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(expectedGenesis)&&!PUBLIC_GENESIS.test(expectedGenesis));
 const rpc=configured?new SolanaRpcClient({endpoint:url,commitment:"finalized",timeoutMs:3000,maxRetries:0,strictEnvelope:true,fetchImpl:(u,init)=>fetchImpl(u,{...init,redirect:"error"})}):null;
 let busy=false;
 return async function inspect(projectInput,marketId){
  const p=assertProjectAggregate(projectInput);
  const m=p.markets.find(x=>x.market_id===marketId);
  if(!m)throw Error("MARKET_NOT_FOUND");
  const result={schema_version:"cook-project-market-observation.1",project_id:p.project_id,project_revision:p.revision,market_id:m.market_id,market_account:m.market_account,identity_digest:m.identity_digest,venue:m.venue,status:"UNKNOWN",checks:[],source_attestation:"UNKNOWN",execution_enabled:false,lifecycle_mutated:false};
  const finish=(status,code)=>{result.status=status;result.checks.push(code);return result;};
  if(!configured)return finish("UNKNOWN","PRIVATE_RPC_NOT_CONFIGURED");
  if(p.network.cluster!=="localnet"||p.network.genesis_hash!==expectedGenesis)return finish("REVIEW_REQUIRED","PROJECT_NETWORK_PIN_MISMATCH");
  if(!["PUMP_BONDING_CURVE","PUMP_SWAP"].includes(m.venue))return finish("UNKNOWN","VENUE_NOT_SUPPORTED");
  const expectedProgram=m.venue==="PUMP_BONDING_CURVE"?PUMP_PROGRAM_ID:PUMP_AMM_PROGRAM_ID;
  if(m.identity.curve_program_id!==expectedProgram)return finish("REVIEW_REQUIRED","DECLARED_PROGRAM_MISMATCH");
  if(m.venue==="PUMP_BONDING_CURVE"&&derivePumpBondingCurveAddress(p.token.mint)!==m.market_account)return finish("REVIEW_REQUIRED","CURVE_ADDRESS_MISMATCH");
  if(busy)return finish("UNKNOWN","READER_BUSY");
  busy=true;
  try{
   if(await rpc.getGenesisHash()!==expectedGenesis)return finish("REVIEW_REQUIRED","RPC_GENESIS_MISMATCH");
   const account=await rpc.getAccountInfo(m.market_account);
   if(!account?.value)return finish("UNKNOWN","MARKET_ACCOUNT_UNAVAILABLE");
   if(!slot(account.context?.slot)||account.value.executable!==false||account.value.owner!==expectedProgram)return finish("REVIEW_REQUIRED","MARKET_ACCOUNT_OWNER_OR_CONTEXT_MISMATCH");
   let decoded;
   try{decoded=m.venue==="PUMP_BONDING_CURVE"?decodeBondingCurveAccount(account):decodePumpSwapPoolAccount(account);}catch{return finish("REVIEW_REQUIRED","MARKET_ACCOUNT_DECODE_FAILED");}
   if(m.venue==="PUMP_SWAP"&&(decoded.data.base_mint!==p.token.mint||decoded.data.quote_mint!==p.network.quote_mint))return finish("REVIEW_REQUIRED","POOL_MINT_MISMATCH");
   if(m.venue==="PUMP_BONDING_CURVE"){
    const quote=decoded.data.quote_mint;
    if(!quote)return finish("UNKNOWN","CURVE_QUOTE_MINT_UNAVAILABLE");
    if(quote!==p.network.quote_mint&&quote!=="11111111111111111111111111111111")return finish("REVIEW_REQUIRED","CURVE_QUOTE_MINT_MISMATCH");
   }
   if(await rpc.getGenesisHash()!==expectedGenesis)return finish("REVIEW_REQUIRED","RPC_GENESIS_CHANGED");
   result.account_context_slot=account.context.slot;
   return finish("OBSERVATIONS_MATCH","MARKET_IDENTITY_OBSERVED");
  }catch{return finish("UNKNOWN","RPC_OR_DECODER_UNAVAILABLE");}
  finally{busy=false;}
 };
}
