import test from "node:test";
import assert from "node:assert/strict";
import { auditInventoryAdjustments, auditHistoricalReserveCoverage } from "../src/inner-market/historical-inventory-audit.mjs";

const scope={projectId:"test",tokenMint:"fixture",quoteAsset:"SOL",openingCutoff:"1",closingCutoff:"20"};
const common={scope,reconciliation:"PASS"};
const base={scope,opening:{...common,tokens:"100",costBasis:"200"},closing:{...common,tokens:"100",costBasis:"200"},tradeSummary:{...common,boughtTokens:"0",soldTokens:"0",acquisitionCost:"0",disposedBasis:"0"},adjustments:[],historyComplete:true};
const adjustment=(id,kind,tokens,extra={})=>({...common,id,kind,tokens,status:"FINALIZED",...extra});
test("aggregate internal transfer preserves verified quantity and basis",()=>{
 const r=auditInventoryAdjustments({...base,adjustments:[adjustment("t","INTERNAL_TRANSFER","20",{verifiedAggregateTokenDelta:"0",verifiedAggregateBasisDelta:"0"})]});
 assert.equal(r.status,"RECONCILED");
 assert.equal(r.verified_cost_basis,"200");
});
test("internal conservation must be independently established",()=>{
 const r=auditInventoryAdjustments({...base,adjustments:[adjustment("t","INTERNAL_TRANSFER","20",{verifiedAggregateTokenDelta:"0"})]});
 assert.ok(r.issues.includes("INTERNAL_CONSERVATION_NOT_VERIFIED:t"));
 assert.equal(r.verified_cost_basis,null);
});
test("unknown external acquisition basis is never assumed zero",()=>{
 const r=auditInventoryAdjustments({...base,closing:{...common,tokens:"110",costBasis:null},adjustments:[adjustment("t","EXTERNAL_IN","10",{costBasis:null})]});
 assert.ok(r.issues.includes("UNKNOWN_COST_BASIS"));
 assert.equal(r.verified_cost_basis,null);
});
test("verified historical adjustment reconciles aggregate inventory",()=>{
 const r=auditInventoryAdjustments({...base,closing:{...common,tokens:"90",costBasis:"180"},adjustments:[adjustment("t","BURN","10",{costBasis:"20"})]});
 assert.equal(r.status,"RECONCILED");
});
test("basis mismatch and missing history block verification",()=>{
 const r=auditInventoryAdjustments({...base,closing:{...common,tokens:"100",costBasis:"201"},historyComplete:false});
 assert.ok(r.issues.includes("COST_BASIS_MISMATCH"));
 assert.ok(r.issues.includes("HISTORY_INCOMPLETE"));
});
test("duplicate adjustment ids rejected",()=>{
 const t=adjustment("t","INTERNAL_TRANSFER","10",{verifiedAggregateTokenDelta:"0",verifiedAggregateBasisDelta:"0"});
 assert.throws(()=>auditInventoryAdjustments({...base,adjustments:[t,t]}),/duplicate/);
});
const snapshot={snapshotId:"a",reconciliation:"PASS",lifecycle:"bonding_curve",complete:false,realQuoteReserves:"50"};
const valuation={snapshotId:"a",reconciliation:"PASS",grossQuoteObligation:"40"};
test("verified historical reserve coverage is only a necessary check",()=>{
 assert.equal(auditHistoricalReserveCoverage({snapshot,valuation}).status,"CHECK_PASSED");
});
test("gross obligations above real reserve are flagged",()=>{
 const r=auditHistoricalReserveCoverage({snapshot,valuation:{...valuation,grossQuoteObligation:"51"}});
 assert.deepEqual(r.issues,["REAL_RESERVE_INSUFFICIENT"]);
});
test("missing reserve or completed curve prevents valuation verification",()=>{
 const r=auditHistoricalReserveCoverage({snapshot:{...snapshot,complete:true,realQuoteReserves:null},valuation});
 assert.deepEqual(r.issues,["OUTSIDE_INNER_CURVE","RESERVE_OR_GROSS_OBLIGATION_UNKNOWN"]);
});
test("different snapshot identities rejected",()=>{
 assert.throws(()=>auditHistoricalReserveCoverage({snapshot,valuation:{...valuation,snapshotId:"b"}}),/identity/);
});
