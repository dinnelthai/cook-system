import test from "node:test";
import assert from "node:assert/strict";
import {auditSyntheticRecordNumbers} from "../src/core/synthetic-record-numeric-audit.mjs";
test("retrospective diagnostic distinguishes balanced recorded amounts from decreasing reserve product",()=>{
 const report={summary:{fee_bps:0},detector_input:{market:{quote_mint:"fixture-quote"},initial_state:{quote_reserves_base_units:"10",token_reserves_base_units:"10"},final_state:{quote_reserves_base_units:"11",token_reserves_base_units:"9"},events:[{event_id:"fixture",event_kind:"CURVE_BUY_EXECUTED",synthetic_metadata:{generator_version:"participant-simulator.3"},payload:{signature:"fixture",quote_amount_base_units:"1",token_amount_base_units:"1",execution_price_decimal:"1",fee_components:[]}}]}};
 const before=structuredClone(report),v=auditSyntheticRecordNumbers(report);
 assert.equal(v.status,"PASS");assert.equal(v.reserve_product_diagnostic.status,"REVIEW_REQUIRED");
 assert.equal(v.reserve_product_diagnostic.decrease_count,1);
 assert.equal(v.invariant_model_verified,false);assert.deepEqual(report,before);
 report.detector_input.events[0].synthetic_metadata.generator_version="unknown";
 assert.equal(auditSyntheticRecordNumbers(report).reserve_product_diagnostic.status,"UNKNOWN");
});

test("unknown synthetic event kinds cannot be silently interpreted as a sell",()=>{
 const report={summary:{fee_bps:0},detector_input:{market:{quote_mint:"fixture-quote"},initial_state:{quote_reserves_base_units:"10",token_reserves_base_units:"10"},final_state:{quote_reserves_base_units:"9",token_reserves_base_units:"11"},events:[{event_id:"unexpected",event_kind:"UNKNOWN",synthetic_metadata:{generator_version:"participant-simulator.3"},payload:{signature:"fixture",quote_amount_base_units:"1",token_amount_base_units:"1",execution_price_decimal:"1",fee_components:[]}}]}};
 const v=auditSyntheticRecordNumbers(report);
 assert.equal(v.status,"REVIEW_REQUIRED");
 assert.ok(v.issues.includes("UNSUPPORTED_NUMERIC_EVENT:unexpected"));
 assert.equal(v.reserve_product_diagnostic.status,"UNKNOWN");
 assert.equal(v.execution_enabled,false);
});
