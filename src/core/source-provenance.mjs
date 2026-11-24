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
 if(scope.provenance!=="observed_chain")issues.push("PROVENANCE_SCOPE_MISMATCH");
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
