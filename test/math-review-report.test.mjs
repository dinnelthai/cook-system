import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runParticipantValidationSuite} from "../src/simulation/participant-validation-suite.mjs";
import {buildMathReviewReport} from "../src/inner-market/math-review-report.mjs";
import {auditCalibrationIntervals} from "../src/simulation/calibration-interval-audit.mjs";
const base=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
test("joint math report reuses an existing validated experiment and does not claim real accuracy",()=>{
 const financialInput=base(),validationReport=runParticipantValidationSuite({base:financialInput,seeds:[701],steps:120});
 const v=buildMathReviewReport({financialInput,validationReport});
 assert.equal(v.status,"INTERNAL_CHECKS_COMPLETE_EXTERNAL_VALIDATION_PENDING");
 assert.equal(v.financial.mathematical_audit.status,"PARTIAL");
 assert.equal(v.validation.fixed_templates.length,4);
 assert.equal(v.validation.real_world_error_rates,null);
 assert.equal(v.calibration.interval_audit.status,"UNKNOWN");
 assert.equal(v.coverage.financial_arithmetic,"PARTIAL");
 assert.equal(v.coverage.overall_model_validation,"NOT_ESTABLISHED");
 assert.equal(v.execution_enabled,false);
 const bad=structuredClone(validationReport);bad.digest="0".repeat(64);
 assert.throws(()=>buildMathReviewReport({financialInput,validationReport:bad}),/PARTICIPANT_EXPERIMENT_DIGEST_MISMATCH/);
});
test("calibration interval audit detects nested overlap, not just duplicate boundaries",()=>{
 const s={network:"localnet",genesisHash:"fixture",tokenMint:"mint",quoteAsset:"SOL_LAMPORTS"};
 const row=(a,b)=>({...s,openingCutoff:"slot:"+a,closingCutoff:"slot:"+b});
 const v=auditCalibrationIntervals([row(10,100),row(20,30),row(40,50),row(100,110)]);
 assert.equal(v.status,"REVIEW_REQUIRED");assert.equal(v.overlap_count,2);
 assert.ok(v.pairs.some(x=>x.status==="SHARED_BOUNDARY"));
 assert.equal(auditCalibrationIntervals([row(10,20),row(20,30)]).status,"DECLARED_NONOVERLAP_CHECKED");
 assert.equal(auditCalibrationIntervals([{...row(10,20),openingCutoff:"unknown"}]).status,"UNKNOWN");
 assert.equal(auditCalibrationIntervals([row(20,10)]).status,"REVIEW_REQUIRED");
 assert.equal(v.coverage_attestation,"UNKNOWN");
});

test("read-only calibration scope compares local aliases without merging different genesis identities",()=>{
 const scope={network:"localnet",genesisHash:"fixture",tokenMint:"mint",quoteAsset:"SOL_LAMPORTS",openingCutoff:"slot:10",closingCutoff:"slot:20"};
 const alias={...scope,network:"local_sim",openingCutoff:"slot:15",closingCutoff:"slot:25"};
 const before=structuredClone([scope,alias]);
 const r=auditCalibrationIntervals([scope,alias]);
 assert.equal(r.status,"REVIEW_REQUIRED");assert.equal(r.overlap_count,1);
 assert.deepEqual([scope,alias],before);
 assert.equal(auditCalibrationIntervals([scope,{...alias,genesisHash:"different"}]).status,"DECLARED_NONOVERLAP_CHECKED");
 assert.equal(auditCalibrationIntervals([{...scope,closingCutoff:"slot:18446744073709551616"}]).status,"UNKNOWN");
});
