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
