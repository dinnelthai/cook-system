import test from "node:test";
import assert from "node:assert/strict";
import {summarizeImportedParticipantValidation} from "../web/participant-validation-view.mjs";
test("imported counts are checked and never treated as an authenticated run",()=>{
 const ids=["seed_path_integrity","observation_faults","environment_contracts","fixed_detector_templates"];
 const x={schema_version:"cook-participant-validation-suite.1",source_mode:"SYNTHETIC",real_market_validated:false,execution_enabled:false,digest:"a".repeat(64),
 groups:ids.map(id=>({id,case_count:1,passed_count:1})),paths:[{passed:true}],observation_cases:[{passed:true}],environment_cases:[{passed:true}],detector_cases:[{result:"TRUE_POSITIVE"}]};
 assert.equal(summarizeImportedParticipantValidation(x).status,"DECLARED_COUNTS_MATCH");
 assert.equal(summarizeImportedParticipantValidation(x).source_attestation,"UNKNOWN");
 x.groups[0].passed_count=0;assert.throws(()=>summarizeImportedParticipantValidation(x),/COUNT_MISMATCH/);
});
