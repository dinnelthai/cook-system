import test from "node:test";
import assert from "node:assert/strict";
import {auditHistoricalAccountSet} from "../src/inner-market/historical-account-set-audit.mjs";
const fixture=()=>{const scope={network:"local_sim",genesisHash:"g",projectId:"p",quoteAsset:"SOL",tokenMint:"t",cutoff:"closed"};
 const row={scope,reconciliation:"PASS",cashBaseUnits:"100",tokenAmountBaseUnits:"5",costBasisBaseUnits:"20",inventoryValueBaseUnits:"30",receivableBaseUnits:"2",liabilitiesBaseUnits:"3",otherAssetsBaseUnits:"1"};
 return {scope,expectedAccounts:["a","b"],accounts:[{...row,accountId:"a"},{...row,accountId:"b"}],reportedTotals:{cashBaseUnits:"200",tokenAmountBaseUnits:"10",costBasisBaseUnits:"40",inventoryValueBaseUnits:"60",receivableBaseUnits:"4",liabilitiesBaseUnits:"6",otherAssetsBaseUnits:"2",navBaseUnits:"260"}};};
test("closed account set agrees with reported consolidated amounts without independent attestation",()=>{
 const r=auditHistoricalAccountSet(fixture());assert.equal(r.status,"INTERNALLY_CONSISTENT");assert.equal(r.totals.navBaseUnits,"260");assert.equal(r.ownership_attestation,"UNKNOWN");assert.equal(r.account_set_completeness_attested,false);
});
test("missing account or valuation cannot be presented as a complete consolidated total",()=>{
 const i=fixture();i.accounts.pop();const r=auditHistoricalAccountSet(i);assert.equal(r.status,"PARTIAL");assert.equal(r.totals,null);
 const j=fixture();j.accounts[0].inventoryValueBaseUnits=null;assert.equal(auditHistoricalAccountSet(j).status,"PARTIAL");
});
test("duplicate account and scope disagreement suppress consolidated totals",()=>{
 const i=fixture();i.accounts.push({...i.accounts[0]});assert.equal(auditHistoricalAccountSet(i).status,"REVIEW_REQUIRED");
 const j=fixture();j.accounts[0].scope={...j.scope,genesisHash:"other"};assert.equal(auditHistoricalAccountSet(j).status,"REVIEW_REQUIRED");
});
test("reported NAV and cost discrepancies require review",()=>{
 const i=fixture();i.reportedTotals.navBaseUnits="261";i.reportedTotals.costBasisBaseUnits="39";
 const r=auditHistoricalAccountSet(i);assert.equal(r.status,"REVIEW_REQUIRED");assert.ok(r.issues.includes("ACCOUNT_SET_TOTAL_MISMATCH:navBaseUnits"));assert.ok(r.issues.includes("ACCOUNT_SET_TOTAL_MISMATCH:costBasisBaseUnits"));assert.equal(r.totals,null);
});

test("explicit failed reconciliation is a contradiction",()=>{
 const i=fixture();i.accounts[0].reconciliation="FAIL";assert.equal(auditHistoricalAccountSet(i).status,"REVIEW_REQUIRED");
});
test("unknown valuation does not mask a known cash discrepancy",()=>{
 const i=fixture();i.accounts[0].inventoryValueBaseUnits=null;i.reportedTotals.cashBaseUnits="201";
 const r=auditHistoricalAccountSet(i);assert.equal(r.status,"REVIEW_REQUIRED");assert.ok(r.issues.includes("ACCOUNT_SET_TOTAL_MISMATCH:cashBaseUnits"));
});
