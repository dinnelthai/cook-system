import {createHash} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";
import {summarizeImportedParticipantValidation,compareImportedParticipantValidation} from "../../web/participant-validation-view.mjs";
const hash=v=>createHash("sha256").update(canonicalJson(v),"utf8").digest("hex");
/** Local QA artifact integrity only. A recomputable digest is not source authentication. */
export function verifyParticipantExperiment(report){
 const summary=summarizeImportedParticipantValidation(report);
 const {digest,...body}=report;
 if(hash(body)!==digest)throw Error("PARTICIPANT_EXPERIMENT_DIGEST_MISMATCH");
 const expected=summary.status==="DECLARED_COUNTS_MATCH"?"SYNTHETIC_REGRESSION_PASS":"REVIEW_REQUIRED";
 if(report.status!==expected)throw Error("PARTICIPANT_EXPERIMENT_STATUS_MISMATCH");
 return {status:"DIGEST_AND_DECLARED_COUNTS_MATCH",digest,source_attestation:"UNKNOWN",execution_enabled:false};
}
export function compareParticipantExperiments(before,after){
 const a=verifyParticipantExperiment(before),b=verifyParticipantExperiment(after);
 return {...compareImportedParticipantValidation(before,after),baseline_digest:a.digest,candidate_digest:b.digest,integrity:"DIGEST_CHECKED_NOT_AUTHENTICATED",execution_enabled:false};
}
