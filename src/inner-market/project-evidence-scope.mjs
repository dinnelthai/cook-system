/** Applicability derived from a verified event replay; original revisions
 * and hashes remain immutable. Only a contiguous suffix of same-symbol
 * profile edits is compatible. No new authority or chain attestation. */
export function evidenceApplicable(project,row){
 if(row?.project_id!==project.project_id||!Number.isSafeInteger(row.project_revision)||row.project_revision<1)return false;
 if(row.project_revision===project.revision)return row.stale===false;
 return row.project_revision<project.revision&&row.stale===true&&row.current_revision===project.revision&&row.evidence_applicability==="PROFILE_ONLY_COMPATIBLE"&&row.kind!=="PROJECT_CLOSE_REVIEW";
}
export function archiveApplicable(project,row){
 return evidenceApplicable(project,row)&&row.payload?.project_id===project.project_id&&row.payload?.project_revision===row.project_revision&&row.payload.source_attestation==="UNKNOWN"&&row.payload.execution_enabled===false;
}
export function evidenceApplicability(latest,revision,kind){
 return revision===latest.aggregate.revision?"CURRENT":
 revision>=latest.metadata_compatible_since_revision&&revision<latest.aggregate.revision&&kind!=="PROJECT_CLOSE_REVIEW"?"PROFILE_ONLY_COMPATIBLE":"STALE";
}
