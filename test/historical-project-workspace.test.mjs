import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHistoricalProjectCatalogue} from "../src/inner-market/historical-project-catalogue.mjs";
import {listHistoricalProjects,exportHistoricalWorkspace,restoreHistoricalWorkspace} from "../src/inner-market/historical-project-workspace.mjs";
const read=name=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/"+name,import.meta.url),"utf8"));
const fixture=()=>read("inner-market-mvp.json");
test("portable workspace round trip restores original records and recomputes audits",()=>{
 const c=createHistoricalProjectCatalogue();c.add(fixture());c.add(read("m07/catalogue-second.json"));
 const b=JSON.parse(JSON.stringify(exportHistoricalWorkspace(c))),d=restoreHistoricalWorkspace(b);
 assert.deepEqual(d.list(),c.list());assert.deepEqual(d.exportInputs(),c.exportInputs());
 b.records[0].scope.projectId="changed";assert.deepEqual(d.exportInputs(),c.exportInputs());
});
test("workspace merge is idempotent and rejects conflict atomically",()=>{
 const c=createHistoricalProjectCatalogue();c.add(fixture());const before=c.exportInputs();
 const b=exportHistoricalWorkspace(c);assert.equal(restoreHistoricalWorkspace(b,{mergeInto:c}).list().length,1);
 b.records.push(read("m07/catalogue-second.json"),read("m07/catalogue-conflict.json"));
 assert.throws(()=>restoreHistoricalWorkspace(b,{mergeInto:c}),/CONFLICTING_CLOSED_INTERVAL/);
 assert.deepEqual(c.exportInputs(),before);
});
test("derived or malformed workspace cannot replace original catalogue",()=>{
 const c=createHistoricalProjectCatalogue(),a=c.add(fixture());
 const b=exportHistoricalWorkspace(c);
 for(const bad of [{...b,execution_enabled:true},{...b,records:[c.get(a.key).report]},{...b,records:Array(9).fill(fixture())}]){
  assert.throws(()=>restoreHistoricalWorkspace(bad,{mergeInto:c}));assert.equal(c.list().length,1);
 }
});
test("project groups preserve provisional and distinct declared identities without aggregation",()=>{
 const c=createHistoricalProjectCatalogue(),a=fixture();c.add(a);
 for(const genesis of ["genesis-a","genesis-b"]){const i=fixture();i.sourceMode="ARCHIVED_HISTORICAL";i.scope.network="localnet";i.scope.genesisHash=genesis;c.add(i);}
 const groups=listHistoricalProjects(c);assert.equal(groups.length,3);
 assert.equal(groups.filter(p=>p.identity_status==="PROVISIONAL").length,1);
 assert.equal(groups.filter(p=>p.identity_status==="DECLARED_ONLY").length,2);
 assert.ok(groups.every(p=>p.record_count===1&&p.source_attestation==="UNKNOWN"));
});
