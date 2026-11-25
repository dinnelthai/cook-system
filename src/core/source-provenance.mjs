import {createHash} from "node:crypto";
const plain=v=>v!==null&&typeof v==="object"&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const stable=v=>v===null||typeof v!=="object"?JSON.stringify(v):Array.isArray(v)?"["+v.map(stable).join(",")+"]":"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stable(v[k])).join(",")+"}";
const nonempty=v=>typeof v==="string"&&v.length>0&&v.trim()===v;
const hash=v=>createHash("sha256").update(typeof v==="string"?v:stable(v)).digest("hex");
/** Records identity and capture metadata; never promotes unsigned metadata to authentication. */
export function assessSourceProvenance({scope,source,capture,rawPayload}={}){
 if(!plain(scope)||!plain(source)||!plain(capture))throw Error("INVALID_SOURCE_EVIDENCE");
 const rawHash=hash(rawPayload??null),issues=[];
 if(scope.provenance==="synthetic"&&scope.network==="synthetic")return {
  schema_version:"cook-source-evidence.1",status:"SYNTHETIC_ONLY",scope,
  source:{source_type:source.source_type??"simulator",source_id:source.source_id??null},
  capture:{captured_at_ms:capture.captured_at_ms??null,adapter_version:capture.adapter_version??null,raw_payload_sha256:rawHash},
  issues:["SYNTHETIC_DATA_NOT_CHAIN_EVIDENCE"],source_attestation:"NOT_APPLICABLE",signature_verified:false};
 if(scope.provenance!=="observed_chain"||!["mainnet","devnet","local_sim"].includes(scope.network))issues.push("PROVENANCE_SCOPE_MISMATCH");
 if(!nonempty(scope.genesis_hash))issues.push("EXPECTED_GENESIS_UNPINNED");
 if(rawPayload==null)issues.push("RAW_EVIDENCE_UNAVAILABLE");
 if(!["rpc","indexer"].includes(source.source_type))issues.push("SOURCE_TYPE_NOT_INDEPENDENTLY_CHECKABLE");
 if(!nonempty(source.source_id)||!nonempty(source.endpoint_id))issues.push("SOURCE_IDENTITY_MISSING");
 if(!nonempty(source.observed_genesis_hash))issues.push("GENESIS_IDENTITY_UNAVAILABLE");
 else if(nonempty(scope.genesis_hash)&&source.observed_genesis_hash!==scope.genesis_hash)issues.push("GENESIS_IDENTITY_MISMATCH");
 if(!["confirmed","finalized"].includes(capture.commitment))issues.push("COMMITMENT_UNAVAILABLE");
 if(!Number.isSafeInteger(capture.captured_at_ms)||capture.captured_at_ms<0)issues.push("CAPTURE_TIME_MISSING");
 if(!nonempty(capture.adapter_version)||!nonempty(capture.query_fingerprint))issues.push("CAPTURE_METADATA_INCOMPLETE");
 const mismatch=issues.includes("GENESIS_IDENTITY_MISMATCH")||issues.includes("PROVENANCE_SCOPE_MISMATCH"),complete=issues.length===0;
 return {schema_version:"cook-source-evidence.1",status:mismatch?"REVIEW_REQUIRED":complete?"IDENTITY_MATCHED_NOT_AUTHENTICATED":"UNVERIFIED",
  scope,source:{source_type:source.source_type??null,source_id:source.source_id??null,endpoint_id:source.endpoint_id??null,observed_genesis_hash:source.observed_genesis_hash??null},
  capture:{commitment:capture.commitment??null,captured_at_ms:capture.captured_at_ms??null,adapter_version:capture.adapter_version??null,query_fingerprint:capture.query_fingerprint??null,raw_payload_sha256:rawHash},
  issues,source_attestation:"UNKNOWN",signature_verified:false,
  note:"Genesis and capture metadata are caller-supplied observations. Hashing detects later byte changes but does not authenticate the source or prove completeness."};
}

/** Reject a contradictory explicitly pinned identity before a historical read.
 * Unpinned readers remain compatible, but their identity stays unverified. */
export async function observeHistoricalGenesis(rpc,expectedGenesisHash=null){
 if(expectedGenesisHash!==null&&!nonempty(expectedGenesisHash))throw Error("INVALID_EXPECTED_GENESIS");
 let observed=null;
 if(typeof rpc?.getGenesisHash==="function"){
  try{const value=await rpc.getGenesisHash();if(nonempty(value))observed=value;}catch{}
 }
 if(expectedGenesisHash!==null){
  if(observed===null)throw Error("PINNED_GENESIS_UNAVAILABLE");
  if(observed!==expectedGenesisHash)throw Error("PINNED_GENESIS_MISMATCH");
 }
 return observed;
}

/** Compare already captured receipt sets for the same declared closed scope.
 * Different labels do not prove that the underlying providers are independent.
 * Strict JSON equivalence is conservative: encoding differences need review. */
export function compareArchivedSourceReceipts({scope,left,right}={}){
 if(!plain(scope)||scope.provenance!=="observed_chain"||!nonempty(scope.genesis_hash)||
    !["mainnet","devnet","local_sim"].includes(scope.network)||!nonempty(scope.interval_id)||
    !nonempty(scope.token_mint)||!nonempty(scope.quote_mint))throw Error("INVALID_COMPARISON_SCOPE");
 const issues=[],maps=[];
 for(const capture of [left,right]){
  if(!plain(capture)||!plain(capture.scope)||!nonempty(capture.source_id)||!nonempty(capture.endpoint_id)||
     !Array.isArray(capture.receipts)||capture.receipts.length>10000)throw Error("INVALID_RECEIPT_CAPTURE");
  if(stable(capture.scope)!==stable(scope))issues.push("RECEIPT_SCOPE_MISMATCH");
  if(capture.observed_genesis_hash!==scope.genesis_hash)issues.push("RECEIPT_GENESIS_MISMATCH");
  const map=new Map();
  for(const row of capture.receipts){
   if(!plain(row)||!nonempty(row.signature)||!plain(row.transaction)||!Number.isSafeInteger(row.transaction.slot)||row.transaction.slot<0||
      row.transaction.transaction?.signatures?.[0]!==row.signature||!plain(row.transaction.meta))throw Error("INVALID_ARCHIVED_RECEIPT");
   if(map.has(row.signature))issues.push("DUPLICATE_RECEIPT");
   map.set(row.signature,hash(row.transaction));
  }
  maps.push(map);
 }
 const [a,b]=maps,missingLeft=[],missingRight=[],conflicts=[];
 for(const [id,h] of a){if(!b.has(id))missingRight.push(id);else if(b.get(id)!==h)conflicts.push(id);}
 for(const id of b.keys())if(!a.has(id))missingLeft.push(id);
 if(conflicts.length)issues.push("RECEIPT_CONTENT_CONFLICT");
 const distinct=left.source_id!==right.source_id&&left.endpoint_id!==right.endpoint_id;
 const status=issues.length?"REVIEW_REQUIRED":!distinct||!a.size||missingLeft.length||missingRight.length?"PARTIAL":"MATCHED_NOT_AUTHENTICATED";
 return {schema_version:"cook-source-receipt-comparison.1",status,issues:[...new Set(issues)],
  left_count:a.size,right_count:b.size,missing_left:missingLeft.sort(),missing_right:missingRight.sort(),conflicting_signatures:conflicts.sort(),
  distinct_declared_sources:distinct,source_attestation:"UNKNOWN",history_complete_attested:false};
}

// Local labels are aliases only at an explicit read-only input boundary.
// Never rewrite persisted event scopes or infer network identity from labels.
export function isLocalHistoricalNetwork(network){
 return network==="localnet"||network==="local_sim";
}
/** Reject a known contradictory public cluster label; this is not authentication.
 * Prefixes are the existing public-genesis identifiers used by local read preflight.
 * Unknown or unavailable observations remain unverified by this check. */
export function assertNoKnownClusterConflict(network,observedGenesis){
 const known=typeof observedGenesis==="string"?
  observedGenesis.startsWith("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")?"mainnet":
  observedGenesis.startsWith("EtWTRABZaYq6iMfeYKouRu166VU2xqa1")?"devnet":
  observedGenesis.startsWith("4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z")?"testnet":null:null;
 if(known&&known!==network)throw Error("HISTORICAL_NETWORK_GENESIS_CONFLICT");
}
