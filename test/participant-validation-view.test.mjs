import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runParticipantValidationSuite} from "../src/simulation/participant-validation-suite.mjs";
import {summarizeImportedParticipantValidation,compareImportedParticipantValidation} from "../web/participant-validation-view.mjs";
const fixture=()=>runParticipantValidationSuite({base:JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8")),seeds:[701],steps:120});
test("imported counts are checked and never treated as an authenticated run",()=>{
 const x=fixture();
 assert.equal(summarizeImportedParticipantValidation(x).status,"DECLARED_COUNTS_MATCH");
 assert.equal(summarizeImportedParticipantValidation(x).source_attestation,"UNKNOWN");
 x.groups[0].passed_count=0;assert.throws(()=>summarizeImportedParticipantValidation(x),/COUNT_MISMATCH/);
});
test("missing and duplicated cases cannot pass after counts are adjusted",()=>{
 const x=fixture();x.observation_cases.pop();x.groups[1].case_count--;x.groups[1].passed_count--;
 assert.throws(()=>summarizeImportedParticipantValidation(x),/INVALID_PARTICIPANT_VALIDATION_GROUP/);
 const y=fixture();y.observation_cases[1]=structuredClone(y.observation_cases[0]);
 assert.throws(()=>summarizeImportedParticipantValidation(y),/INVALID_VALIDATION_CASE_ID/);
});
test("nested result contradictions and incorrect detector labels are rejected",()=>{
 const x=fixture();x.paths[0].checks.find(c=>c.id==="per_account_ledger").passed=false;
 assert.throws(()=>summarizeImportedParticipantValidation(x),/SUBCHECK_RESULT_MISMATCH/);
 const y=fixture();y.detector_cases[0].result="TRUE_POSITIVE";
 assert.throws(()=>summarizeImportedParticipantValidation(y),/INVALID_DETECTOR_RESULT/);
});
test("a new failing subcheck is visible even when the parent case was already failing",()=>{
 const a=fixture(),b=structuredClone(a);
 for(const r of [a,b]){r.paths[0].checks.find(c=>c.id==="per_account_ledger").passed=false;r.paths[0].passed=false;r.groups[0].passed_count=0;r.status="REVIEW_REQUIRED";}
 b.paths[0].checks.find(c=>c.id==="record_numeric_consistency").passed=false;
 const v=compareImportedParticipantValidation(a,b);
 assert.equal(v.status,"DECLARED_REGRESSION");assert.equal(v.changed_cases.length,0);assert.equal(v.changed_subchecks.length,1);
 b.paths[0].checks.pop();assert.throws(()=>compareImportedParticipantValidation(a,b),/VALIDATION_SUBCHECK_MANIFEST_MISMATCH/);
});

test("required path, environment and asset subchecks cannot be omitted",()=>{
 const x=fixture();x.paths[0].checks.pop();assert.throws(()=>summarizeImportedParticipantValidation(x),/MANIFEST_MISMATCH/);
 const y=fixture();delete y.paths[0].asset_coverage;assert.throws(()=>summarizeImportedParticipantValidation(y),/INVALID_ASSET_COVERAGE_RESULT/);
 const z=fixture();z.environment_cases[0].checks.pop();assert.throws(()=>summarizeImportedParticipantValidation(z),/MANIFEST_MISMATCH/);
 const w=fixture();w.paths[0].asset_coverage.cases[0].checks.pop();assert.throws(()=>summarizeImportedParticipantValidation(w),/MANIFEST_MISMATCH/);
});
