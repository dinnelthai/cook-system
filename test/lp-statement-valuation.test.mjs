import test from "node:test";
import assert from "node:assert/strict";
import {valueSyntheticLpStatement} from "../src/inner-market/lp-statement-valuation.mjs";
const fixture=()=>({
 statement:{source_mode:"SYNTHETIC",position_id:"position",pool_id:"pool",opening_cutoff:"0",closing_cutoff:"1",
 opening_lp_units:"100",added_lp_units:"20",removed_lp_units:"10",closing_lp_units:"110",opening_fee_receivable:"0",
 accrued_fee:"7",received_fee_cash:"3",written_off_fee:"0",closing_fee_receivable:"4",reconciled_cash_posting:"3"},
 snapshot:{source_mode:"SYNTHETIC",pool_id:"pool",cutoff:"1",claim_model:"DECLARED_PRO_RATA_FUNGIBLE_FIXTURE",base_asset:"base",quote_asset:"quote",
 supply_lp_units:"1000",distributable_base_units:"10000",distributable_quote_units:"20000"},
 mark:{source_mode:"SYNTHETIC",pool_id:"pool",cutoff:"1",base_asset:"base",quote_asset:"quote",quote_numerator:"2",base_denominator:"1"}
});
test("declared fungible fixture mark separates received cash and fee receivable",()=>{
 const f=fixture(),before=structuredClone(f),r=valueSyntheticLpStatement(f);
 assert.equal(r.status,"DECLARED_FIXTURE_MARK");assert.equal(r.values.base_claim_units,"1100");assert.equal(r.values.quote_claim_units,"2200");
 assert.equal(r.values.position_mark_quote_units,"4400");assert.equal(r.values.received_fee_cash,"3");assert.equal(r.values.closing_fee_receivable,"4");
 assert.equal(r.values.fee_cash_included_in_position_mark,false);assert.equal(r.values.fee_receivable_included_in_position_mark,false);
 assert.equal(r.actual_position_value,null);assert.equal(r.executable_value,null);assert.equal(r.execution_enabled,false);assert.deepEqual(f,before);
});
test("LP accounting conflicts and missing marks withhold valuation",()=>{
 const f=fixture();f.statement.reconciled_cash_posting="2";
 assert.equal(valueSyntheticLpStatement(f).status,"REVIEW_REQUIRED");
 const x=fixture();delete x.mark.quote_numerator;
 assert.equal(valueSyntheticLpStatement(x).status,"INCOMPLETE");assert.equal(valueSyntheticLpStatement(x).values,null);
});
test("foreign pool, mismatched cutoff and historical sources cannot produce a synthetic mark",()=>{
 for(const patch of [f=>f.mark.pool_id="other",f=>f.snapshot.cutoff="2",f=>f.mark.source_mode="ARCHIVED_HISTORICAL",f=>f.snapshot.claim_model="PUMP_SWAP"]){
  const f=fixture();patch(f);const r=valueSyntheticLpStatement(f);assert.equal(r.status,"REVIEW_REQUIRED");assert.equal(r.values,null);
 }
});
test("zero supply, excessive share, denominator zero and malformed amounts are rejected",()=>{
 for(const patch of [f=>f.snapshot.supply_lp_units="0",f=>f.snapshot.supply_lp_units="109",f=>f.mark.base_denominator="0",f=>f.snapshot.distributable_base_units="-1"]){
  const f=fixture();patch(f);assert.equal(valueSyntheticLpStatement(f).status,"REVIEW_REQUIRED");
 }
});
test("large amounts preserve integer precision and floor rounding",()=>{
 const f=fixture();f.snapshot.supply_lp_units="110";f.snapshot.distributable_base_units="9007199254740993";
 f.snapshot.distributable_quote_units="0";f.mark.quote_numerator="1";f.mark.base_denominator="2";
 const r=valueSyntheticLpStatement(f);assert.equal(r.status,"DECLARED_FIXTURE_MARK");assert.equal(r.values.position_mark_quote_units,"4503599627370496");
});

test("explicit fee unit mismatch cannot be hidden by equal numeric amounts",()=>{
 const f=fixture();f.statement.fee_asset="quote";f.statement.cash_posting_asset="base";
 const bad=valueSyntheticLpStatement(f);assert.equal(bad.status,"REVIEW_REQUIRED");assert.equal(bad.values,null);
 assert.ok(bad.ledger.issues.includes("FEE_ASSET_MISMATCH"));
 f.statement.cash_posting_asset="quote";const good=valueSyntheticLpStatement(f);
 assert.equal(good.status,"DECLARED_FIXTURE_MARK");assert.equal(good.values.fee_asset_alignment,"DECLARED_MATCH");
 f.statement.fee_asset="foreign";f.statement.cash_posting_asset="foreign";
 assert.equal(valueSyntheticLpStatement(f).status,"REVIEW_REQUIRED");
});
test("explicit overlap between distributable assets and separate fees withholds fixture mark",()=>{
 for(const key of ["includes_separately_recorded_fee_receivable","includes_separately_recorded_fee_cash"]){
  for(const invalid of [true,"false",null]){
   const f=fixture();f.snapshot[key]=invalid;
   const r=valueSyntheticLpStatement(f);assert.equal(r.status,"REVIEW_REQUIRED");assert.equal(r.values,null);
   assert.ok(r.issues.includes("LP_DISTRIBUTABLE_ASSET_BOUNDARY_CONFLICT"));
  }
 }
 const f=fixture();assert.equal(valueSyntheticLpStatement(f).values.distributable_fee_separation,"UNKNOWN");
 f.snapshot.includes_separately_recorded_fee_receivable=false;f.snapshot.includes_separately_recorded_fee_cash=false;
 const r=valueSyntheticLpStatement(f);assert.equal(r.values.distributable_fee_separation,"DECLARED_SEPARATE");
 assert.equal(r.values.position_mark_quote_units,"4400");assert.equal(r.project_nav_inclusion,"NOT_ESTABLISHED");
});
