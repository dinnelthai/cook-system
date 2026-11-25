import test from "node:test";
import assert from "node:assert/strict";
import {projectOverviewModel,projectIntervalMetrics} from "../web/project-overview-view.mjs";
const fixture=()=>({project_id:"p",project_revision:1,status:"EVIDENCE_INCOMPLETE",recorded_stage:"DRAFT",risk:{critical:0,warning:1,unknown:3},
 runtime:{project_id:"p",project_revision:1,execution_enabled:false,live_assets:null,work:[{id:"configuration",status:"MISSING"}],
 asset_intervals:[{report_link_archive_id:"i",opening_cutoff:"a",closing_cutoff:"b",assets:{cash:"123"}}],
 market:{status:"EVIDENCE_INCOMPLETE",curve_intervals:[],historical_pools:[]}}});
test("overview never selects or exposes a historical amount by default",()=>{
 const m=projectOverviewModel(fixture());
 assert.deepEqual(m.intervals,[{id:"i",label:"a → b"}]);assert.equal(m.market.active_venue,"未知");assert.equal(m.execution,"已禁用");
 assert.ok(projectIntervalMetrics(null).every(x=>x.value==="—"));assert.ok(!JSON.stringify(m).includes('"123"'));
});
test("selected historical metrics preserve exact values and suppress conflicted rows",()=>{
 const row={status:"INCOMPLETE",assets:{cash:"9007199254740993",nav:"-10",realized_pnl:"0",token_quantity:"2",inventory_cost:null}};
 const m=projectIntervalMetrics(row);assert.equal(m.find(x=>x.id==="cash").value,"9007199254740993");assert.equal(m.find(x=>x.id==="nav").value,"-10");assert.equal(m.find(x=>x.id==="realized_pnl").value,"0");
 assert.ok(projectIntervalMetrics({...row,status:"REVIEW_REQUIRED"}).every(x=>x.value==="—"));
});
test("overview rejects mismatched revision or enabled execution",()=>{
 const r=fixture();r.runtime.project_revision=2;assert.throws(()=>projectOverviewModel(r),/INVALID_PROJECT_OVERVIEW/);
 const s=fixture();s.runtime.execution_enabled=true;assert.throws(()=>projectOverviewModel(s),/INVALID_PROJECT_OVERVIEW/);
});

test("display distinguishes missing, conflicting and declared unverified amounts",()=>{
 const m=projectIntervalMetrics({status:"INCOMPLETE",assets:{cash:"0"}});
 assert.equal(m.find(x=>x.id==="cash").evidence_label,"历史声明值 · 未独立认证");
 assert.equal(m.find(x=>x.id==="nav").evidence_label,"未取得声明值");
 assert.ok(projectIntervalMetrics({status:"REVIEW_REQUIRED",assets:{cash:"123"}}).every(x=>x.value==="—"&&x.evidence_label==="证据冲突 · 金额隐藏"));
});

test("display values convert SOL exactly but retain original audit values and unknowns",()=>{
 const m=projectIntervalMetrics({status:"INCOMPLETE",assets:{cash:"9007199254740993",nav:"-10",realized_pnl:"0",token_quantity:"42"}});
 assert.equal(m.find(x=>x.id==="cash").display_value,"9007199.254740993");
 assert.equal(m.find(x=>x.id==="nav").display_value,"-0.00000001");
 assert.equal(m.find(x=>x.id==="realized_pnl").display_value,"0.00");
 assert.equal(m.find(x=>x.id==="token_quantity").display_value,"42");
 assert.equal(m.find(x=>x.id==="cash").display_unit,"SOL");
 assert.ok(projectIntervalMetrics(null).every(x=>x.display_value==="—"));
});
