import test from "node:test";
import assert from "node:assert/strict";
import {assessPortfolioRisk} from "../src/risk/portfolio-risk-engine.mjs";
const valuation_scope={network:"synthetic",genesis_hash:"fixture",quote_asset:"SOL_LAMPORTS",quote_decimals:9};
const base=()=>({valuationScope:valuation_scope,positions:[{valuation_scope,market_id:"m1",exposure_quote_base_units:"100",evidence_status:"VERIFIED"}],
 account:{valuation_scope,drawdown_bps:100,daily_loss_quote_base_units:"10"},
 marketSnapshots:[{valuation_scope,market_id:"m1",observed_at_ms:900,data_completeness:"complete",source_status:"IDENTITY_MATCHED_NOT_AUTHENTICATED",liquidation_depth_quote_base_units:"1000"}],
 limits:{valuation_scope,max_total_exposure_quote_base_units:"1000",max_daily_loss_quote_base_units:"100",max_market_exposure_bps:10000,max_drawdown_bps:500,max_data_age_ms:500,max_liquidation_depth_ratio_bps:5000},nowMs:1000});
test("portfolio risk reports bounded evidence state without granting execution",()=>{
 const r=assessPortfolioRisk(base());assert.equal(r.status,"WITHIN_CONFIGURED_LIMITS");assert.equal(r.execution_enabled,false);assert.equal(r.production_ready,false);
});
test("exposure, drawdown and stale evidence fail closed",()=>{
 const a=base();a.positions[0].exposure_quote_base_units="2000";assert.equal(assessPortfolioRisk(a).status,"BLOCKED");
 const b=base();b.account.drawdown_bps=900;assert.equal(assessPortfolioRisk(b).status,"BLOCKED");
 const c=base();c.marketSnapshots[0].observed_at_ms=0;assert.equal(assessPortfolioRisk(c).status,"BLOCKED");
});
test("missing ownership or source evidence remains unknown",()=>{
 const a=base();a.positions[0].evidence_status="UNKNOWN";a.marketSnapshots[0].source_status="UNKNOWN";
 const r=assessPortfolioRisk(a);assert.equal(r.status,"UNKNOWN");assert.ok(r.findings.some(x=>x.severity==="UNKNOWN"));
});

test("zero stated exposure does not erase missing position evidence",()=>{
 const i=base();i.positions[0].exposure_quote_base_units="0";i.positions[0].evidence_status="UNKNOWN";
 const r=assessPortfolioRisk(i);assert.equal(r.status,"UNKNOWN");assert.equal(r.metrics.unknown_position_count,1);
});
test("risk comparisons use exact units rather than rounded displayed ratios",()=>{
 const i=base();i.positions[0].exposure_quote_base_units="500001";i.marketSnapshots[0].liquidation_depth_quote_base_units="1000000";
 i.limits.max_total_exposure_quote_base_units="10000000";i.limits.max_liquidation_depth_ratio_bps=5000;
 assert.ok(assessPortfolioRisk(i).findings.some(f=>f.code==="LIQUIDATION_DEPTH_LIMIT"));
 const j=base();j.positions=[{valuation_scope,market_id:"m1",exposure_quote_base_units:"5000001",evidence_status:"VERIFIED"},{valuation_scope,market_id:"m2",exposure_quote_base_units:"4999999",evidence_status:"VERIFIED"}];
 j.marketSnapshots=[{...j.marketSnapshots[0],liquidation_depth_quote_base_units:"100000000"},{...j.marketSnapshots[0],market_id:"m2",liquidation_depth_quote_base_units:"100000000"}];
 j.limits.max_total_exposure_quote_base_units="100000000";j.limits.max_market_exposure_bps=5000;
 assert.ok(assessPortfolioRisk(j).findings.some(f=>f.code==="SINGLE_MARKET_CONCENTRATION"&&f.market_id==="m1"));
});
test("duplicate declared position IDs and out-of-domain percent limits are rejected",()=>{
 const i=base();i.positions[0].position_id="p";i.positions.push({...i.positions[0]});
 assert.throws(()=>assessPortfolioRisk(i),/DUPLICATE_OR_INVALID_POSITION_ID/);
 const j=base();j.limits.max_drawdown_bps=10001;assert.throws(()=>assessPortfolioRisk(j),/INVALID_PORTFOLIO_PERCENT_LIMIT/);
});

test("missing market snapshots do not suppress known concentration violations",()=>{
 const i=base();i.marketSnapshots=[];i.limits.max_market_exposure_bps=5000;
 const r=assessPortfolioRisk(i);
 assert.equal(r.status,"BLOCKED");
 assert.ok(r.findings.some(f=>f.code==="SINGLE_MARKET_CONCENTRATION"&&f.severity==="BLOCK"));
 assert.ok(r.findings.some(f=>f.code==="MARKET_SNAPSHOT_MISSING"&&f.severity==="UNKNOWN"));
 assert.equal(r.execution_enabled,false);
});

test("unknown daily loss remains unknown without suppressing a known risk breach",()=>{
 const i=base();i.account.daily_loss_quote_base_units=null;
 const r=assessPortfolioRisk(i);assert.equal(r.status,"UNKNOWN");assert.equal(r.metrics.daily_loss_quote_base_units,null);
 i.account.drawdown_bps=900;assert.equal(assessPortfolioRisk(i).status,"BLOCKED");
 i.positions[0].exposure_quote_base_units="9".repeat(1000);assert.throws(()=>assessPortfolioRisk(i),/invalid position exposure/);
});

test("mixed quote units or network identities cannot be aggregated as one risk scope",()=>{
 for(const change of [{quote_asset:"USDC"},{quote_decimals:6},{genesis_hash:"other"}]){
  const i=base();i.positions[0].valuation_scope={...valuation_scope,...change};
  assert.throws(()=>assessPortfolioRisk(i),/PORTFOLIO_VALUATION_SCOPE_MISMATCH/);
 }
 const i=base();delete i.positions[0].valuation_scope;
 assert.equal(assessPortfolioRisk(i).status,"UNKNOWN");
 assert.equal(assessPortfolioRisk(i).valuation_scope_status,"UNKNOWN");
});
