import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildTerminalState,advanceReview,makeReviewArchive,restoreReviewArchive} from "../src/inner-market/terminal-state.mjs";
import {describeProjectReviewWorkflow} from "../src/inner-market/project-review-workflow.mjs";
const input=()=>JSON.parse(readFileSync(new URL("../fixtures/synthetic/inner-market-mvp.json",import.meta.url),"utf8"));
test("explicit synthetic report review supports test-only settlement and archive round trip",()=>{
 const i=input(),state=buildTerminalState(i);
 assert.equal(describeProjectReviewWorkflow({state,loaded:false}).test_settlement_allowed,false);
 const first=describeProjectReviewWorkflow({state,loaded:true});assert.equal(first.test_settlement_allowed,true);
 const settled=advanceReview("REVIEW","settle",state);assert.equal(describeProjectReviewWorkflow({state,loaded:true,reviewStage:settled}).test_archive_allowed,true);
 const stage=advanceReview(settled,"archive",state),archive=makeReviewArchive(i,null,stage);assert.equal(restoreReviewArchive(archive).stage,"ARCHIVED");
 assert.equal(describeProjectReviewWorkflow({state,loaded:true,reviewStage:stage}).execution_enabled,false);
});
test("historical evidence and incomplete samples never enable settlement or imply issuance",()=>{
 const i=input();i.sourceMode="ARCHIVED_HISTORICAL";
 const w=describeProjectReviewWorkflow({state:buildTerminalState(i),loaded:true,metadata:{name:"Test",symbol:"T"}});
 assert.equal(w.test_settlement_allowed,false);assert.equal(w.test_archive_allowed,false);assert.equal(w.steps[1].status,"未独立核验");
 i.sourceMode="SYNTHETIC";i.cash.historyComplete=false;
 assert.equal(describeProjectReviewWorkflow({state:buildTerminalState(i),loaded:true}).test_settlement_allowed,false);
});
