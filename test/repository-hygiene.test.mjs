import test from "node:test";
import assert from "node:assert/strict";
import {scanSecretMarkers} from "../scripts/audit-repository-hygiene.mjs";
test("repository hygiene scanner detects high-confidence secret formats without returning values",()=>{
 const github="ghp_"+"A".repeat(36),aws="AKIA"+"A".repeat(16),openai="sk-"+"B".repeat(40);
 const findings=scanSecretMarkers("token="+github+"\naws="+aws+"\napi="+openai);
 assert.deepEqual(findings.map(x=>x.kind),["GITHUB_TOKEN","AWS_ACCESS_KEY","OPENAI_API_KEY"]);
 assert.ok(findings.every(x=>!Object.hasOwn(x,"value")));
});
test("repository hygiene scanner does not flag placeholders or ordinary public identifiers",()=>{
 assert.deepEqual(scanSecretMarkers("COOK_LOCAL_GENESIS_HASH=REPLACE_WITH_LOCAL_GENESIS_HASH\nwallet=11111111111111111111111111111111"),[]);
});
