import test from "node:test";
import assert from "node:assert/strict";
import {readProjectSelection,writeProjectSelection,projectStageStrip,projectReviewTasks,riskEvidenceRows} from "../web/operator-workspace.mjs";
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
test("project selection only stores an opaque ID and supports explicit clearing",()=>{
 const s=storage();assert.equal(readProjectSelection(s),null);assert.equal(writeProjectSelection(s,"project-a"),true);
 assert.equal(readProjectSelection(s),"project-a");assert.equal(writeProjectSelection(s,""),false);assert.equal(readProjectSelection(s),"project-a");
 assert.equal(writeProjectSelection(s,null),true);assert.equal(readProjectSelection(s),null);assert.equal(readProjectSelection(null),null);assert.equal(writeProjectSelection(null,"a"),false);
});
test("lifecycle strip indicates recorded stage without asserting completed evidence",()=>{
 const rows=projectStageStrip("PUMPSWAP_ACTIVE");assert.equal(rows.filter(r=>r.state==="CURRENT").length,1);assert.equal(rows[3].state,"CURRENT");
 assert.equal(rows[0].state,"EARLIER");assert.ok(projectStageStrip("invalid").every(r=>r.state==="UNKNOWN"));
});
test("operator tasks preserve server status, unknown and duplicates fail closed",()=>{
 const r=projectReviewTasks({work:[{id:"configuration",status:"DECLARATIONS_PRESENT"},{id:"order_exceptions",status:"REVIEW_REQUIRED"},{id:"order_exceptions",status:"DECLARED_MATCH"}]});
 assert.equal(r.length,7);assert.equal(r[0].status,"DECLARATIONS_PRESENT");assert.equal(r.find(x=>x.id==="order_exceptions").status,"UNKNOWN");assert.equal(r.find(x=>x.id==="independent_source").status,"UNKNOWN");
});
test("risk evidence rows preserve severity, multiple categories and exact references",()=>{
 const r=[{severity:"CRITICAL",code:"E",categories:["MARKET","TREASURY"],references:["a","b"]},{severity:"UNKNOWN",code:"U",category:"COVERAGE",references:[]}];
 assert.deepEqual(riskEvidenceRows(r,"CRITICAL"),[["CRITICAL","MARKET / TREASURY","E","a / b"]]);assert.equal(riskEvidenceRows(r,"UNKNOWN")[0][3],"未提供引用");
});
