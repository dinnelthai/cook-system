import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reviewSyntheticLedgerInput} from "../web/synthetic-ledger-view.mjs";
const fixture=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/closed-ledger-review.json",import.meta.url),"utf8"));
test("view recomputes supplied synthetic ledger rather than trusting derived fields",()=>{
 const i=fixture();i.status="FAKE_PASS";i.closing[0].quote_base_units="91";i.closing[1].quote_base_units="109";
 const v=reviewSyntheticLedgerInput(i);assert.equal(v.audit.status,"REVIEW_REQUIRED");
 assert.deepEqual(v.rows,[["sample-a","1","0"],["sample-b","-1","0"]]);
 assert.equal(v.issues.length,2);
});
test("fixed ledger fixture produces consistent visible differences",()=>{
 const v=reviewSyntheticLedgerInput(fixture());assert.equal(v.audit.status,"INTERNALLY_CONSISTENT");
 assert.deepEqual(v.rows,[["sample-a","0","0"],["sample-b","0","0"]]);
 assert.equal(v.audit.execution_enabled,false);
});
test("historical and derived result files cannot be used as synthetic input",()=>{
 assert.throws(()=>reviewSyntheticLedgerInput({...fixture(),sourceMode:"ARCHIVED_HISTORICAL"}));
 assert.throws(()=>reviewSyntheticLedgerInput(reviewSyntheticLedgerInput(fixture()).audit));
});
