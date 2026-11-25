import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHistoricalProjectCatalogue} from "../src/inner-market/historical-project-catalogue.mjs";
import {exportHistoricalWorkspace} from "../src/inner-market/historical-project-workspace.mjs";
import {queryHistoricalWorkspace,validateHistoricalWorkspaceQuery} from "../src/inner-market/historical-workspace-query.mjs";
const read=name=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/"+name,import.meta.url),"utf8"));
function store(){
 const c=createHistoricalProjectCatalogue();c.add(read("terminal-candle-report.json"));c.add(read("m07/catalogue-second.json"));
 const workspace=exportHistoricalWorkspace(c);
 return {load:revision=>{if(revision!==1)throw Error("WORKSPACE_REVISION_NOT_FOUND");return {revision,digest:"fixture-digest",workspace:structuredClone(workspace)};}};
}
test("queries bind exact revision and project membership; no cross-project access or settlement",()=>{
 const s=store(),q=options=>queryHistoricalWorkspace(s,{revision:1,...options});
 const list=q({kind:"projects"});assert.equal(list.projects.length,2);
 const [a,b]=list.projects;
 const project=q({kind:"project",projectKey:a.key});assert.equal(project.records.length,1);
 const detail=q({kind:"record",projectKey:a.key,recordKey:a.record_keys[0]});
 assert.equal(detail.accounting.closing_cash_base_units,"887");assert.equal(detail.source_attestation,"UNKNOWN");assert.equal(detail.settlement_allowed,false);
 assert.throws(()=>q({kind:"record",projectKey:a.key,recordKey:b.record_keys[0]}),/WORKSPACE_RECORD_NOT_FOUND/);
 assert.throws(()=>q({kind:"project",projectKey:"absent"}),/WORKSPACE_PROJECT_NOT_FOUND/);
 assert.throws(()=>queryHistoricalWorkspace(s,{kind:"projects",revision:2}),/WORKSPACE_REVISION_NOT_FOUND/);
});
test("event query paginates existing evidence and preserves unavailable rather than zero",()=>{
 const s=store(),q=options=>queryHistoricalWorkspace(s,{revision:1,...options});
 const [a,b]=q({kind:"projects"}).projects;
 const params={kind:"events",projectKey:a.key,recordKey:a.record_keys[0],limit:1};
 const first=q(params);assert.equal(first.events.length,1);assert.equal(first.record.event_count,2);assert.equal(first.next_offset,1);
 const second=q({...params,offset:first.next_offset});assert.equal(second.events.length,1);assert.notEqual(first.events[0].event_id,second.events[0].event_id);assert.equal(second.next_offset,null);
 const missing=q({kind:"events",projectKey:b.key,recordKey:b.record_keys[0]});assert.equal(missing.record.event_count,null);assert.equal(missing.next_offset,null);
});
test("query contract rejects unknown fields, missing revisions and oversized pages",()=>{
 for(const q of [{kind:"projects"},{kind:"projects",revision:1,projectKey:"x"},{kind:"events",revision:1,projectKey:"a",recordKey:"b",limit:101},{kind:"events",revision:1,projectKey:"a",recordKey:"b",offset:-1}]){
  assert.throws(()=>validateHistoricalWorkspaceQuery(q),/INVALID_WORKSPACE_QUERY/);
 }
});
