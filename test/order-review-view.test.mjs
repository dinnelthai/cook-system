import test from "node:test";
import assert from "node:assert/strict";
import {summarizeOrderReviews,filterOrderReviews} from "../web/order-review-view.mjs";
const orders=[{status:"RECORDED"},{status:"OUTCOME_UNKNOWN"},{status:"REPORTED_SUCCESS",stale:true},{status:"REPORTED_FAILURE"},{status:"REVIEW_REQUIRED"},{status:"UNEXPECTED"}];
test("order review counters separate unknown, reported and stale records",()=>{
 assert.deepEqual(summarizeOrderReviews(orders),{total:6,review:2,unknown:2,reported_success:1,reported_failure:1,stale:1});
 assert.equal(filterOrderReviews(orders,"EXCEPTIONS").length,4);
 assert.equal(filterOrderReviews(orders,"UNKNOWN").length,2);
 assert.equal(filterOrderReviews(orders,"ALL").length,6);
});
