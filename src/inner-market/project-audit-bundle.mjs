import {createHash} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";
import {describeProjectRiskReview} from "./project-risk-review.mjs";
import {describeProjectLifecycleEvidence} from "./project-lifecycle-evidence.mjs";
const digest=x=>createHash("sha256").update(canonicalJson(x),"utf8").digest("hex");
export const PROJECT_AUDIT_BUNDLE_MAX_BYTES=32*1024*1024;
/** Export of internally checked local records, not a source attestation,
 * backup of original report bytes, or lifecycle archive transition. */
export function buildProjectAuditBundle({project,integrity,events,archives,orders}){
 const lifecycle=describeProjectLifecycleEvidence(project,archives,orders.map(o=>o.order));
 const risk=describeProjectRiskReview(project,archives,orders.map(o=>o.order));
 const exceptions=[
  ...lifecycle.blockers.map(code=>({category:"LIFECYCLE",code})),
  ...orders.filter(o=>o.order.stale||["RECORDED","OUTCOME_UNKNOWN","REVIEW_REQUIRED"].includes(o.order.status)).map(o=>({category:"ORDER",code:o.order.stale?"STALE_ORDER_REVISION":o.order.status,order_id:o.order.order_id})),
  ...archives.filter(a=>a.stale||a.payload.status==="REVIEW_REQUIRED"||a.payload.rpc_observation?.status==="REVIEW_REQUIRED").map(a=>({category:"ARCHIVE",code:a.stale?"STALE_ARCHIVE_REVISION":"EVIDENCE_CONFLICT",archive_id:a.archive_id}))
 ];
 const content={schema_version:"cook-project-audit-bundle.1",project_id:project.project_id,project_revision:project.revision,
  project,integrity:{...integrity,status:"INTERNAL_HASH_CHAIN_CHECKED"},events,archives,orders,lifecycle,risk,exceptions,
  source_attestation:"UNKNOWN",ownership_attestation:"UNKNOWN",valuation_attestation:"UNKNOWN",
  original_report_bytes_included:false,settlement_allowed:false,lifecycle_mutated:false,execution_enabled:false};
 if(Buffer.byteLength(canonicalJson(content))>PROJECT_AUDIT_BUNDLE_MAX_BYTES)throw Error("PROJECT_AUDIT_BUNDLE_SIZE_LIMIT");
 return {...content,content_sha256:digest(content)};
}
/** Digest verification alone does not authenticate a bundle. Local integrity
 * was checked at export; a replaced file and digest can still agree. */
export function checkProjectAuditBundleDigest(bundle){
 if(!bundle||bundle.schema_version!=="cook-project-audit-bundle.1")throw Error("INVALID_PROJECT_AUDIT_BUNDLE");
 const {content_sha256,...content}=bundle;
 if(content_sha256!==digest(content))throw Error("PROJECT_AUDIT_BUNDLE_DIGEST_MISMATCH");
 if(content.project_id!==content.project?.project_id||content.project_revision!==content.project?.revision||
    content.source_attestation!=="UNKNOWN"||content.settlement_allowed!==false||content.lifecycle_mutated!==false||content.execution_enabled!==false)throw Error("PROJECT_AUDIT_BUNDLE_SCOPE_MISMATCH");
 return {status:"DIGEST_MATCH_NOT_AUTHENTICATED",project_id:content.project_id,project_revision:content.project_revision,source_attestation:"UNKNOWN",execution_enabled:false,settlement_allowed:false};
}
