import test from "node:test";
import assert from "node:assert/strict";
import {auditArchivedCashPostings} from "../src/inner-market/archived-cash-crosscheck.mjs";
const genesisHash="local-fixture",wallet="wallet",tokenAccount="token-account",mint="mint",projectId="test";
const scope={mode:"READ_ONLY",network:"localnet",genesisHash,wallet,tokenAccount,mint,openingSlot:10,closingSlot:20};
const snapshot=(slot,lamports)=>({slot,genesisHash,wallet,tokenAccount,mint,lamports,tokenAmount:"0"});
const receipt=(signature,slot,pre,post,failed)=>({signature,genesisHash,finality:"FINALIZED",transactionIndex:0,transaction:{slot,transaction:{signatures:[signature],message:{accountKeys:[wallet,"other"]}},meta:{err:failed?{InstructionError:[0,"Custom"]}:null,fee:5,preBalances:pre,postBalances:post,preTokenBalances:[],postTokenBalances:[]}}});
const posting=(id,signature,kind,amountBaseUnits)=>({id,signature,kind,amountBaseUnits,projectId,quoteAsset:"SOL_LAMPORTS",genesisHash,wallet,openingSlot:10,closingSlot:20,status:"FINALIZED",reconciliation:"PASS"});
const fixture=()=>({projectId,cashHistoryComplete:true,accountInterval:{scope,opening:snapshot(10,"1000"),closing:snapshot(20,"890"),historyComplete:true,receipts:[receipt("a",11,[1000,100],[895,200],false),receipt("b",12,[895,200],[890,200],true)]},postings:[posting("1","a","OPERATING_EXPENSE","105"),posting("2","b","FAILED_TX_EXPENSE","5")]});
const codes=i=>auditArchivedCashPostings(i).issues.map(x=>x.code);
test("cash postings match individual archived receipts without attesting economic classification",()=>{
 const r=auditArchivedCashPostings(fixture());
 assert.equal(r.status,"AMOUNTS_INTERNALLY_CONSISTENT");assert.equal(r.matched_receipt_count,2);
 assert.equal(r.cash_audit.cash_difference_base_units,"0");assert.equal(r.account_audit.observed_failed_tx_fees_lamports,"5");
 assert.equal(r.economic_classification_attestation,"UNKNOWN");assert.equal(r.settlement_allowed,false);assert.equal(r.execution_enabled,false);
});
test("equal final balance does not hide swapped posting amounts",()=>{
 const i=fixture();i.postings[0].amountBaseUnits="104";i.postings[1].amountBaseUnits="6";
 const r=auditArchivedCashPostings(i);assert.equal(r.cash_audit.cash_difference_base_units,"0");assert.equal(r.status,"REVIEW_REQUIRED");
 assert.ok(r.issues.some(x=>x.code==="FAILED_FEE_POSTING_MISMATCH"));
});
test("detect missing fee, double counting and unrelated postings",()=>{
 const a=fixture();a.postings.pop();assert.ok(codes(a).includes("MISSING_CASH_POSTING"));
 const b=fixture();b.postings.push(posting("3","a","OPERATING_EXPENSE","5"));assert.ok(codes(b).includes("RECEIPT_CASH_DELTA_MISMATCH"));
 const c=fixture();c.postings.push(posting("3","missing","OTHER_INCOME","5"));assert.ok(codes(c).includes("POSTING_WITHOUT_RECEIPT"));
});
test("offsetting gross postings require separate evidence even when the net amount matches",()=>{
 const i=fixture();i.postings.push(posting("3","a","OTHER_INCOME","10"),posting("4","a","OPERATING_EXPENSE","10"));
 assert.ok(codes(i).includes("MULTIPLE_COMPONENTS_REQUIRE_INDEPENDENT_EVIDENCE"));
});
test("reject duplicate posting IDs and mismatched account scope; flag incomplete coverage",()=>{
 const a=fixture();a.postings.push(a.postings[0]);assert.throws(()=>auditArchivedCashPostings(a),/DUPLICATE_POSTING/);
 const b=fixture();b.postings[0].wallet="other";assert.throws(()=>auditArchivedCashPostings(b),/POSTING_SCOPE_MISMATCH/);
 const c=fixture();c.cashHistoryComplete=false;assert.ok(codes(c).includes("CASH_HISTORY_INCOMPLETE"));
 const d=fixture();d.postings[0].status="PENDING";assert.ok(codes(d).includes("POSTING_UNVERIFIED"));
});
test("failed fee misclassification is rejected even if amount matches",()=>{
 const i=fixture();i.postings[1].kind="OPERATING_EXPENSE";assert.ok(codes(i).includes("FAILED_FEE_POSTING_MISMATCH"));
});
