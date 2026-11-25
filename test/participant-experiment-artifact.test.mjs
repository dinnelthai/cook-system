import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {canonicalJson} from "../src/core/canonical-json.mjs";
import {runParticipantValidationSuite} from "../src/simulation/participant-validation-suite.mjs";
import {verifyParticipantExperiment,compareParticipantExperiments} from "../src/simulation/participant-experiment-artifact.mjs";
import {benchmarkParticipantValidation} from "../src/simulation/participant-experiment-benchmark.mjs";
const base=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
const fixture=()=>runParticipantValidationSuite({base:base(),seeds:[701],steps:120});
const rehash=r=>{const {digest,...body}=r;r.digest=createHash("sha256").update(canonicalJson(body),"utf8").digest("hex");return r;};
test("artifact digest detects changed payload, and matched experiments can be compared",()=>{
 const a=fixture(),b=structuredClone(a);
 assert.equal(verifyParticipantExperiment(a).status,"DIGEST_AND_DECLARED_COUNTS_MATCH");
 assert.equal(compareParticipantExperiments(a,b).status,"DECLARED_UNCHANGED");
 b.paths[0].event_count++;
 assert.throws(()=>verifyParticipantExperiment(b),/DIGEST_MISMATCH/);
 assert.equal(compareParticipantExperiments(a,rehash(b)).status,"DECLARED_UNCHANGED");
});
test("changed case outcomes and incomparable configurations are reported",()=>{
 const a=fixture(),b=structuredClone(a);
 b.paths[0].passed=false;b.groups[0].passed_count=0;b.status="REVIEW_REQUIRED";rehash(b);
 const v=compareParticipantExperiments(a,b);
 assert.equal(v.status,"DECLARED_REGRESSION");assert.equal(v.changed_cases.length,1);
 b.configuration.steps=121;rehash(b);
 assert.equal(compareParticipantExperiments(a,b).status,"NOT_COMPARABLE");
});
test("bounded benchmark measures runtime separately from reproducibility",()=>{
 const r=benchmarkParticipantValidation({base:base(),seeds:[701],steps:120,repeats:2});
 assert.equal(r.status,"SYNTHETIC_REGRESSION_PASS");assert.equal(r.runs.length,2);
 assert.equal(r.deterministic_digest_match,true);assert.equal(r.peak_memory_measured,false);
 assert.ok(r.runs.every(x=>x.elapsed_ms>=0&&x.artifact_bytes>0));
 assert.throws(()=>benchmarkParticipantValidation({base:base(),repeats:6}),/WORK_LIMIT/);
});
