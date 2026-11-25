import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHistoricalProjectCatalogue} from "../src/inner-market/historical-project-catalogue.mjs";
import {exportHistoricalWorkspace} from "../src/inner-market/historical-project-workspace.mjs";
import {reviewHistoricalWorkspaceEvidence} from "../src/inner-market/historical-workspace-evidence.mjs";
const read=name=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/"+name,import.meta.url),"utf8"));
function bundle(...inputs){const c=createHistoricalProjectCatalogue();for(const i of inputs)c.add(i);return exportHistoricalWorkspace(c);}
test("workspace evidence links supplied candle events to existing journal and cash references",()=>{
 const input=bundle(read("terminal-candle-report.json")),before=structuredClone(input),r=reviewHistoricalWorkspaceEvidence(input);
 assert.equal(r.status,"INTERNALLY_CONSISTENT");assert.equal(r.counts.linked,1);assert.equal(r.records[0].event_count,2);
 const buy=r.records[0].events.find(e=>e.event_id==="b");
 assert.equal(buy.inventory_journal_reference,"b");
 assert.equal(buy.cash_posting_references[0].posting_id,"buy-cash");
 assert.equal(r.records[0].receipt_attestation,"UNKNOWN");assert.equal(r.settlement_allowed,false);
 assert.deepEqual(input,before);
 const reversed={...input,records:[Object.fromEntries(Object.entries(input.records[0]).reverse())]};
 assert.equal(reviewHistoricalWorkspaceEvidence(reversed).records[0].report_content_sha256,r.records[0].report_content_sha256);
});
test("missing evidence and invalid reports stay separate and do not generate events",()=>{
 const missing=read("inner-market-mvp.json"),bad=JSON.parse(JSON.stringify(read("terminal-candle-report.json")).replaceAll("synthetic-demo","bad-demo"));
 bad.cash.historyComplete=false;
 const r=reviewHistoricalWorkspaceEvidence(bundle(missing,bad));
 assert.equal(r.status,"REVIEW_REQUIRED");assert.equal(r.counts.unavailable,1);assert.equal(r.counts.review_required,1);
 assert.ok(r.records.every(x=>x.event_count===null&&x.events.length===0));
 assert.equal(r.archive_audit.status,"EMPTY");
});
test("cross-report event contradictions cannot be hidden by internally consistent reports",()=>{
 const a=read("terminal-candle-report.json"),b=JSON.parse(JSON.stringify(a).replaceAll("synthetic-demo","second-demo"));
 b.market.candleEvidence.events[0].source.source_id="changed-source";
 const r=reviewHistoricalWorkspaceEvidence(bundle(a,b));
 assert.equal(r.counts.linked,2);assert.equal(r.status,"REVIEW_REQUIRED");
 assert.ok(r.archive_audit.issues.some(x=>x.code==="CROSS_BATCH_EVENT_CONFLICT"));
 assert.equal(r.archive_audit.unique_event_count,null);
});
test("derived evidence index is not a workspace and cannot be reimported",()=>{
 const r=reviewHistoricalWorkspaceEvidence(bundle(read("terminal-candle-report.json")));
 assert.throws(()=>reviewHistoricalWorkspaceEvidence(r),/INVALID_WORKSPACE/);
});
