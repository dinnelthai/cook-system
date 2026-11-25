import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runParticipantValidationSuite} from "../src/simulation/participant-validation-suite.mjs";
import {assessHistoricalCalibrationReadiness} from "../src/simulation/participant-calibration-readiness.mjs";
const fixture=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
test("unified validation groups distinct paths and fixed templates without claiming calibration",()=>{
 const args={base:fixture(),seeds:[701,702],steps:120};
 const r=runParticipantValidationSuite(args);
 assert.equal(r.status,"SYNTHETIC_REGRESSION_PASS");
 assert.deepEqual(r.groups.map(g=>g.case_count),[2,12,13,8]);
 assert.ok(r.groups.every(g=>g.case_count===g.passed_count));
 assert.equal(r.calibration.status,"NOT_RUN_NO_HISTORICAL_DATA");
 assert.equal(r.real_market_validated,false);assert.deepEqual(r,runParticipantValidationSuite(args));
});
test("calibration gate rejects synthetic inputs and incomplete historical scope",()=>{
 assert.throws(()=>assessHistoricalCalibrationReadiness([fixture()]),/ARCHIVED_CALIBRATION_REPORT_REQUIRED/);
 assert.throws(()=>assessHistoricalCalibrationReadiness([{...fixture(),sourceMode:"ARCHIVED_HISTORICAL"}]),/CALIBRATION_SCOPE_INCOMPLETE/);
 assert.equal(assessHistoricalCalibrationReadiness().empirical_calibration_performed,false);
});
