import test from "node:test";
import assert from "node:assert/strict";
import {formatHistoricalLamports,treasuryReviewSections} from "../web/treasury-review-view.mjs";
test("exact display preserves negative and large lamport values without rounding",()=>{
 assert.equal(formatHistoricalLamports("900719925474099312345"),"900719925474.099312345 SOL");
 assert.equal(formatHistoricalLamports("-1"),"-0.000000001 SOL");
 assert.equal(formatHistoricalLamports(null),"—");
 assert.equal(formatHistoricalLamports("0"),"0.000000000 SOL");
});
test("treasury sections do not fabricate missing amounts",()=>{
 const sections=treasuryReviewSections({});assert.equal(sections[0].rows[0][1],"—");
 assert.equal(sections[3].rows.find(r=>r[0]==="剩余预算")[1],"未知");
 assert.equal(sections[3].rows.find(r=>r[0]==="实时余额")[1],"未知");
});
