import test from "node:test";
import assert from "node:assert/strict";
import {summarizeOrderReviews,filterOrderReviews,orderReviewPage} from "../web/order-review-view.mjs";
const orders=[{status:"RECORDED"},{status:"OUTCOME_UNKNOWN"},{status:"REPORTED_SUCCESS",stale:true},{status:"REPORTED_FAILURE"},{status:"REVIEW_REQUIRED"},{status:"UNEXPECTED"}];
test("order review counters separate unknown, reported and stale records",()=>{
 assert.deepEqual(summarizeOrderReviews(orders),{total:6,review:2,unknown:2,reported_success:1,reported_failure:1,stale:1});
 assert.equal(filterOrderReviews(orders,"EXCEPTIONS").length,4);
 assert.equal(filterOrderReviews(orders,"UNKNOWN").length,2);
 assert.equal(filterOrderReviews(orders,"ALL").length,6);
});

test("order view supports pagination, reported outcomes and signature search",()=>{const rows=[{order_id:"a",signature:"sig-a",status:"REPORTED_SUCCESS"},{order_id:"b",signature:"sig-b",status:"REPORTED_FAILURE"},{order_id:"c",signature:"sig-c",status:"RECORDED"}];assert.equal(orderReviewPage(rows,{page:2,pageSize:2}).rows[0].order_id,"c");assert.equal(orderReviewPage(rows,{query:"SIG-B"}).rows[0].order_id,"b");assert.equal(orderReviewPage(rows,{filter:"REPORTED_SUCCESS"}).total,1);assert.equal(orderReviewPage(rows,{query:"absent"}).total,0);});
