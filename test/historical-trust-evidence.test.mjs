import test from "node:test";
import assert from "node:assert/strict";
import {describeHistoricalTrust} from "../src/inner-market/historical-trust.mjs";
const input=()=>({sourceMode:"ARCHIVED_HISTORICAL",ready:true,checks:[],navEndpoints:{status:"INTERNALLY_CONSISTENT"},tradeEvidence:{status:"INTERNALLY_CONSISTENT"},costBasisEvidence:{status:"PARTIAL"},archivedEvidence:{status:"UNAVAILABLE"}});
test("report arithmetic readiness does not imply cost allocation or realized PnL evidence completeness",()=>{
 const r=describeHistoricalTrust(input());
 assert.equal(r.status,"INTERNALLY_CONSISTENT");
 assert.equal(r.metrics.cost_basis.coverage_status,"INCOMPLETE");
 assert.equal(r.metrics.realized_pnl.coverage_status,"INCOMPLETE");
 assert.equal(r.metrics.realized_pnl.independent_verification,"UNKNOWN");
 const i=input();i.costBasisEvidence.status="INTERNALLY_CONSISTENT";
 const v=describeHistoricalTrust(i);
 assert.equal(v.metrics.cost_basis.coverage_status,"SUPPLIED_REPLAY_MATCH");
 assert.equal(v.metrics.realized_pnl.coverage_status,"SUPPLIED_CHECKS_MATCH");
 assert.equal(v.metrics.realized_pnl.independent_verification,"UNKNOWN");
 assert.equal(v.historical_settlement_certified,false);
});
