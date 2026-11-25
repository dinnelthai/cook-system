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

test("matching amount and reference cannot conceal conflicting receipt signatures or slots",()=>{
 const i=fixture(),e=i.creator.entries.find(e=>e.kind==="CREATOR_RECEIPT"),p=i.cash.entries.find(e=>e.kind==="CREATOR_FEE_RECEIVED");
 e.signature="receipt-a";p.signature="receipt-b";e.slot=10;p.slot=11;
 const r=buildCreatorFeeLedgerReport({scope:i.scope,creator:i.creator,cash:i.cash});
 assert.equal(r.status,"REVIEW_REQUIRED");assert.equal(r.summary.verified_cash_income_base_units,null);
 assert.equal(r.summary.verified_closing_receivable_base_units,null);
 assert.ok(r.issues.some(x=>x.code==="RECEIPT_SIGNATURE_MISMATCH"));
 assert.ok(r.issues.some(x=>x.code==="RECEIPT_SLOT_MISMATCH"));
 assert.equal(r.fee_events.find(x=>x.kind==="CREATOR_RECEIPT").cash_link_status,"RECEIPT_IDENTITY_CONFLICT");
});
test("legacy missing receipt identity is incomplete rather than independently verified",()=>{
 const i=fixture(),r=buildCreatorFeeLedgerReport({scope:i.scope,creator:i.creator,cash:i.cash});
 assert.equal(r.status,"RECONCILED");
 assert.equal(r.fee_events.find(x=>x.kind==="CREATOR_RECEIPT").receipt_identity.status,"INCOMPLETE");
 const e=i.creator.entries.find(x=>x.kind==="CREATOR_RECEIPT"),p=i.cash.entries.find(x=>x.kind==="CREATOR_FEE_RECEIVED");
 e.signature=p.signature="receipt-a";e.slot=p.slot=10;
 const v=buildCreatorFeeLedgerReport({scope:i.scope,creator:i.creator,cash:i.cash});
 const identity=v.fee_events.find(x=>x.kind==="CREATOR_RECEIPT").receipt_identity;
 assert.equal(identity.status,"DECLARED_MATCH");assert.equal(identity.source_attestation,"UNKNOWN");
 p.slot=-1;
 assert.equal(buildCreatorFeeLedgerReport({scope:i.scope,creator:i.creator,cash:i.cash}).status,"REVIEW_REQUIRED");
});

test("distinct business IDs cannot certify repeated transaction identity as two creator receipts",()=>{
 const i=fixture(),e=i.creator.entries.find(x=>x.kind==="CREATOR_RECEIPT"),p=i.cash.entries.find(x=>x.kind==="CREATOR_FEE_RECEIVED");
 e.signature=p.signature="same-transaction";e.slot=p.slot=10;
 i.creator.entries[0].amountBaseUnits="17";
 i.creator.entries.push({...e,id:"second-receipt"});
 i.cash.entries.push({...p,id:"second-posting",feeEventId:"second-receipt"});
 const r=buildCreatorFeeLedgerReport({scope:i.scope,creator:i.creator,cash:i.cash});
 assert.equal(r.status,"REVIEW_REQUIRED");assert.equal(r.summary.verified_cash_income_base_units,null);
 assert.ok(r.issues.some(x=>x.code==="AMBIGUOUS_CREATOR_RECEIPT_TRANSACTION"));
});
