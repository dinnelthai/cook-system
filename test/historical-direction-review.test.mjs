import {test} from "node:test";
import assert from "node:assert/strict";
import {historicalDirectionSummary} from "../web/historical-direction-review.mjs";
const trade=(side,amount,status="FINALIZED",reconciliation="PASS")=>({id:side,sequence:1,side,quoteNotionalBaseUnits:amount,status,reconciliation});
const report={scope:{quoteAsset:"SOL_LAMPORTS"},market:{trades:[trade("BUY","9007199254740993"),trade("BUY","2"),trade("BUY","4","FAILED"),trade("SELL","8"),trade("SELL","99","FINALIZED","FAIL")]}};
test("directional history excludes unsettled and opposite direction rows",()=>{
 assert.equal(historicalDirectionSummary(report,"BUY").total_base_units,"9007199254740995");
 assert.equal(historicalDirectionSummary(report,"SELL").total_base_units,"8");
 assert.equal(historicalDirectionSummary(report,"BUY").count,2);
 assert.equal(historicalDirectionSummary(report,"BUY").bundle_membership,"UNKNOWN");
 assert.equal(historicalDirectionSummary(report,"BUY").execution_enabled,false);
});
test("missing or invalid evidence stays unknown",()=>{
 assert.equal(historicalDirectionSummary(null,"BUY"),null);
 assert.equal(historicalDirectionSummary({scope:report.scope,market:{trades:[trade("BUY","1e9")]}},"BUY"),null);
 assert.throws(()=>historicalDirectionSummary(report,"OTHER"));
});
