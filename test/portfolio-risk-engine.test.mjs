import test from "node:test";
import assert from "node:assert/strict";
import {assessPortfolioRisk} from "../src/risk/portfolio-risk-engine.mjs";
const base=()=>({positions:[{market_id:"m1",exposure_quote_base_units:"100",evidence_status:"VERIFIED"}],
 account:{drawdown_bps:100,daily_loss_quote_base_units:"10"},
 marketSnapshots:[{market_id:"m1",observed_at_ms:900,data_completeness:"complete",source_status:"IDENTITY_MATCHED_NOT_AUTHENTICATED",liquidation_depth_quote_base_units:"1000"}],
 limits:{max_total_exposure_quote_base_units:"1000",max_daily_loss_quote_base_units:"100",max_market_exposure_bps:5000,max_drawdown_bps:500,max_data_age_ms:500,max_liquidation_depth_ratio_bps:5000},nowMs:1000});
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
