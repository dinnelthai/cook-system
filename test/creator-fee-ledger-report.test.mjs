import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildCreatorFeeLedgerReport} from "../src/inner-market/creator-fee-ledger-report.mjs";
const fixture=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
test("Creator Fee ledger links accrual, receipt and cash posting without treating accrual as income",()=>{
 const i=fixture(),r=buildCreatorFeeLedgerReport({scope:i.scope,creator:i.creator,cash:i.cash});
 assert.equal(r.status,"RECONCILED");assert.equal(r.summary.verified_recorded_accrual_base_units,"10");assert.equal(r.summary.recorded_receipt_event_base_units,"7");
 assert.equal(r.summary.verified_cash_income_base_units,"7");assert.equal(r.summary.verified_closing_receivable_base_units,"3");
 assert.equal(r.fee_events.find(e=>e.kind==="CREATOR_RECEIPT").cash_link_status,"MATCHED");assert.equal(r.unmatched_cash_postings.length,0);
 assert.equal(r.pool_fee_bucket_cash_equivalence,"NOT_ESTABLISHED");assert.equal(r.execution_enabled,false);
});
test("mismatched or duplicate cash receipt references require review and withhold verified totals",()=>{
 const i=fixture();i.cash.entries.find(e=>e.kind==="CREATOR_FEE_RECEIVED").amountBaseUnits="8";
 const r=buildCreatorFeeLedgerReport({scope:i.scope,creator:i.creator,cash:i.cash});
 assert.equal(r.status,"REVIEW_REQUIRED");assert.equal(r.summary.verified_cash_income_base_units,null);
 assert.equal(r.fee_events.find(e=>e.kind==="CREATOR_RECEIPT").cash_link_status,"AMOUNT_MISMATCH");
 const d=fixture();d.cash.entries.push({...d.cash.entries.find(e=>e.kind==="CREATOR_FEE_RECEIVED"),id:"duplicate"});
 const x=buildCreatorFeeLedgerReport({scope:d.scope,creator:d.creator,cash:d.cash});
 assert.equal(x.status,"REVIEW_REQUIRED");assert.equal(x.fee_events.find(e=>e.kind==="CREATOR_RECEIPT").cash_link_status,"DUPLICATE_CASH_POSTING");
});
test("unverified events and incomplete history are never promoted to verified income",()=>{
 const i=fixture();i.creator.entries.push({...i.creator.entries[0],id:"pending-accrual",amountBaseUnits:"99",status:"PENDING"});i.creator.historyComplete=false;
 const r=buildCreatorFeeLedgerReport({scope:i.scope,creator:i.creator,cash:i.cash});
 assert.equal(r.status,"REVIEW_REQUIRED");assert.equal(r.summary.verified_cash_income_base_units,null);
 assert.equal(r.fee_events.find(e=>e.id==="pending-accrual"),undefined);
 assert.equal(r.fee_events.find(e=>e.event_id==="pending-accrual").event_status,"UNVERIFIED_NOT_COUNTED");
});
test("scope mismatch is rejected",()=>{
 const i=fixture();i.creator.scope.tokenMint="other";
 assert.throws(()=>buildCreatorFeeLedgerReport({scope:i.scope,creator:i.creator,cash:i.cash}),/CREATOR_FEE_REPORT_SCOPE_MISMATCH/);
});
