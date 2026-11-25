import test from "node:test";
import assert from "node:assert/strict";
import {collectHistoricalSignaturePages,summarizeHistoricalReadEvidence} from "../src/core/historical-signature-pages.mjs";
const row=(signature,slot)=>({signature,slot,err:null});
const scan=(pages,extra={})=>{let calls=0;return collectHistoricalSignaturePages({rpc:{async getSignaturesForAddress(){return pages[calls++];}},address:"fixture",pageSize:2,maxSignatures:10,...extra});};
test("signature pagination preserves actual cursors and distinguishes provider termination from attestation",async()=>{
 const r=await scan([[row("a",4),row("b",3)],[row("c",2)]]);
 assert.equal(r.count,3);assert.equal(r.exhausted,true);assert.equal(r.pagination_evidence.pages[1].cursor_in,"b");
 assert.equal(r.pagination_evidence.termination,"SHORT_PAGE");assert.equal(r.pagination_evidence.history_complete_attested,false);
});
test("malformed response is not an exhausted page",async()=>{
 await assert.rejects(()=>scan([null]),/INVALID_SIGNATURE_PAGE/);
 await assert.rejects(()=>scan([[row("a",1),row("b",0),row("c",0)]]),/INVALID_SIGNATURE_PAGE/);
 await assert.rejects(()=>scan([[{signature:"a",slot:-1}]]),/INVALID_SIGNATURE_RECORD/);
});
test("duplicate pages and backwards slot progression reject without spinning",async()=>{
 await assert.rejects(()=>scan([[row("a",4),row("b",3)],[row("a",4),row("b",3)]]),/SIGNATURE_PAGE_DUPLICATE_OR_CYCLE/);
 await assert.rejects(()=>scan([[row("a",4),row("b",3)],[row("c",5)]]),/SIGNATURE_PAGE_SLOT_ORDER/);
});
test("bounded scan remains partial and an until boundary cannot be overrun",async()=>{
 const r=await scan([[row("a",4),row("b",3)]],{maxSignatures:2});
 assert.equal(r.pagination_evidence.status,"PARTIAL");assert.equal(r.truncated_at_limit,true);
 await assert.rejects(()=>scan([[row("a",4),row("b",3)]],{until:"a"}),/SIGNATURE_BOUNDARY_OVERRUN/);
});
test("unverified source and missing receipts stay partial; contradictory evidence requires review",async()=>{
 const s=await scan([[]]),base={scans:[s],source:{status:"UNVERIFIED"},missingTransactionCount:1,candleAudit:{status:"CONSISTENT"}};
 const r=summarizeHistoricalReadEvidence(base);assert.equal(r.status,"PARTIAL");assert.equal(r.history_complete_attested,false);
 assert.equal(summarizeHistoricalReadEvidence({...base,candleAudit:{status:"REVIEW_REQUIRED"}}).status,"REVIEW_REQUIRED");
});
