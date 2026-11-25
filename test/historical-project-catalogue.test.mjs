import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHistoricalProjectCatalogue} from "../src/inner-market/historical-project-catalogue.mjs";
const fixture=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
test("catalogue separates closed interval identity and returns detached inputs",()=>{
 const c=createHistoricalProjectCatalogue(),a=fixture(),b=JSON.parse(JSON.stringify(a).replaceAll("synthetic-demo","second-demo"));
 const first=c.add(a),second=c.add(b);
 assert.notEqual(first.key,second.key);assert.equal(c.list().length,2);
 const loaded=c.get(first.key);loaded.input.scope.projectId="changed";
 assert.equal(c.get(first.key).input.scope.projectId,"synthetic-demo");
 assert.equal(c.get(second.key).input.scope.projectId,"second-demo");
 assert.equal(c.get(first.key).report.execution_enabled,false);
});
test("duplicates are idempotent but same-interval conflicting records are not overwritten",()=>{
 const c=createHistoricalProjectCatalogue(),a=fixture(),r=c.add(a);
 assert.equal(c.add(a).status,"ALREADY_PRESENT");
 const different=structuredClone(a);different.cash.historyComplete=false;
 assert.throws(()=>c.add(different),/CONFLICTING_CLOSED_INTERVAL/);
 assert.equal(c.get(r.key).input.cash.historyComplete,true);
});
test("reject mismatched scope and derived reports without mutating catalogue",()=>{
 const c=createHistoricalProjectCatalogue(),a=fixture(),r=c.add(a),bad=fixture();bad.cash.scope.projectId="other";
 assert.throws(()=>c.add({...bad,scope:{...bad.scope,projectId:"different"}}));
 assert.throws(()=>c.add(c.get(r.key).report));
 assert.equal(c.list().length,1);assert.equal(c.remove(r.key),true);assert.equal(c.list().length,0);
});

test("identical interval labels on distinct declared networks or genesis hashes remain separate",()=>{
 const c=createHistoricalProjectCatalogue();
 const make=(network,genesisHash)=>{const i=fixture();i.sourceMode="ARCHIVED_HISTORICAL";i.scope.network=network;i.scope.genesisHash=genesisHash;return i};
 const a=c.add(make("localnet","genesis-a")),b=c.add(make("localnet","genesis-b")),d=c.add(make("mainnet","genesis-c"));
 assert.equal(new Set([a.key,b.key,d.key]).size,3);
 assert.equal(c.list().length,3);assert.equal(c.get(b.key).input.scope.genesisHash,"genesis-b");
});

test("catalogue duplicate comparison ignores object key order",()=>{
 const c=createHistoricalProjectCatalogue(),a=fixture(),b=Object.fromEntries(Object.entries(a).reverse());
 c.add(a);assert.equal(c.add(b).status,"ALREADY_PRESENT");
});
test("catalogue indexes consistent nested declared identity without rewriting input",()=>{
 const c=createHistoricalProjectCatalogue(),a=fixture();
 a.sourceMode="ARCHIVED_HISTORICAL";a.cash.scope.network="localnet";a.cash.scope.genesisHash="example-genesis";
 const first=c.add(a);
 assert.equal(c.list()[0].network,"localnet");assert.equal(c.list()[0].declared_identity_complete,true);
 assert.equal(c.get(first.key).input.scope.network,undefined);
 const b=structuredClone(a);b.scope.network="localnet";b.scope.genesisHash="example-genesis";
 assert.throws(()=>c.add(b),/CONFLICTING_CLOSED_INTERVAL/);assert.equal(c.list().length,1);
});
