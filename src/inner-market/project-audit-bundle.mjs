import {createHash} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";
import {buildProjectBusinessReview} from "./project-business-review.mjs";
import {evidenceApplicable} from "./project-evidence-scope.mjs";
import {describeProjectLifecycleEvidence} from "./project-lifecycle-evidence.mjs";
import {describeRecordedProjectTimeline,describeLifecycleExceptions} from "./project-lifecycle-timeline.mjs";
const digest=x=>createHash("sha256").update(canonicalJson(x),"utf8").digest("hex");
export const PROJECT_AUDIT_BUNDLE_MAX_BYTES=32*1024*1024;
// Same identity for runtime, lifecycle, review and export. Includes all archives.
export function projectRuntimeContextId({project,archives,orders}){
 return digest({project,archives:archives.map(a=>a.record_hash).sort(),
  orders:orders.map(o=>[o.order_id,o.revision,o.head_hash]).sort((a,b)=>a[0].localeCompare(b[0],"en"))});
}
/** Export of internally checked local records, not a source attestation,
 * backup of original report bytes, or lifecycle archive transition. */
export function buildProjectAuditBundle({project,integrity,events,archives,orders}){
 const lifecycle=describeProjectLifecycleEvidence(project,archives,orders.map(o=>o.order));
 const runtime_context_id=projectRuntimeContextId({project,archives,orders:orders.map(o=>o.order)});
 const business_review={...buildProjectBusinessReview(project,archives,orders.map(o=>o.order)),runtime_context_id};
 const risk=business_review.global_risk;
 const exceptions=[
  ...lifecycle.blockers.map(code=>({category:"LIFECYCLE",code})),
  ...orders.flatMap(({order:o})=>[
   ...(!evidenceApplicable(project,o)?[{category:"ORDER",code:"STALE_ORDER_REVISION",order_id:o.order_id}]:[]),
   ...(["RECORDED","OUTCOME_UNKNOWN","REVIEW_REQUIRED"].includes(o.status)?[{category:"ORDER",code:o.status,order_id:o.order_id}]:[])
  ]),
  ...archives.flatMap(a=>[
   ...(!evidenceApplicable(project,a)?[{category:"ARCHIVE",code:"STALE_ARCHIVE_REVISION",archive_id:a.archive_id}]:[]),
   ...(["STALE","UNKNOWN_LEGACY"].includes(a.evidence_snapshot_status)?[{category:"ARCHIVE",code:"CLOSE_EVIDENCE_SNAPSHOT_OUTDATED_OR_UNKNOWN",archive_id:a.archive_id}]:[]),
   ...(a.payload.status==="REVIEW_REQUIRED"||a.payload.rpc_observation?.status==="REVIEW_REQUIRED"?[{category:"ARCHIVE",code:"EVIDENCE_CONFLICT",archive_id:a.archive_id}]:[])
  ]),
  ...risk.findings.filter(f=>f.categories?.includes("CROSS_MODULE")||f.category==="CROSS_MODULE").map(f=>({category:f.category,code:f.code,severity:f.severity,references:f.references}))
 ];
 const recorded_timeline=describeRecordedProjectTimeline(project,events);
 const exception_review=describeLifecycleExceptions(project,lifecycle,risk);
 const content={schema_version:"cook-project-audit-bundle.1",project_id:project.project_id,project_revision:project.revision,
  project,business_review,runtime_context_id,integrity:{...integrity,status:"INTERNAL_HASH_CHAIN_CHECKED"},events,archives,orders,lifecycle,risk,exceptions,recorded_timeline,exception_review,
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
 // Legacy exports without a context id retain digest-only verification.
 if(Object.hasOwn(content,"runtime_context_id")){
  if(!Array.isArray(content.archives)||!Array.isArray(content.orders)||content.runtime_context_id!==projectRuntimeContextId({project:content.project,archives:content.archives,orders:content.orders.map(o=>o.order)})||
    content.business_review?.runtime_context_id!==content.runtime_context_id||content.business_review?.project_id!==content.project_id||content.business_review?.project_revision!==content.project_revision)
   throw Error("PROJECT_AUDIT_BUNDLE_CONTEXT_MISMATCH");
 }
 return {status:"DIGEST_MATCH_NOT_AUTHENTICATED",project_id:content.project_id,project_revision:content.project_revision,source_attestation:"UNKNOWN",execution_enabled:false,settlement_allowed:false};
}
