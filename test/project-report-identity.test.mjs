import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchProjectReport } from "../src/inner-market/project-report-identity.mjs";
const sample=JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
const project={project_id:sample.scope.projectId,token:{mint:sample.scope.tokenMint},network:{cluster:"localnet",genesis_hash:"private-genesis"}};
function historical(){
 const input=structuredClone(sample);input.sourceMode="ARCHIVED_HISTORICAL";input.scope.network="local_sim";input.scope.genesisHash="private-genesis";return input;
}
test("synthetic never binds and incomplete identity remains unknown",()=>{
 assert.equal(matchProjectReport(project,sample).status,"BLOCKED");
 const input=historical();delete input.scope.genesisHash;assert.equal(matchProjectReport(project,input).status,"UNKNOWN");
});
test("only exact declared scope may associate, never authenticates or enables execution",()=>{
 const input=historical();const result=matchProjectReport(project,input);
 assert.equal(result.status,"DECLARED_MATCH");assert.equal(result.source_attestation,"UNKNOWN");assert.equal(result.live_state,false);assert.equal(result.execution_enabled,false);
 for(const p of [{...project,project_id:"other"},{...project,token:{mint:"other"}},{...project,network:{cluster:"mainnet",genesis_hash:"private-genesis"}},{...project,network:{cluster:"localnet",genesis_hash:"other"}}])assert.equal(matchProjectReport(p,input).status,"BLOCKED");
});
