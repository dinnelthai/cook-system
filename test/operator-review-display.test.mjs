import test from "node:test";
import assert from "node:assert/strict";
import {operatingComponentRows} from "../web/project-review-dashboard.mjs";
import {experimentDisplayRows} from "../web/experiment-display.mjs";
test("scoped financial components require exact report identity and never aggregate archives",()=>{
 const row={report_link_archive_id:"a",report_digest:"digest",status:"INCOMPLETE"};
 const a={...row,archive_id:"r1",components:{trade_realized_pnl_base_units:"-1"}};
 const b={...a,archive_id:"r2"};
 const v={operating_components:{rows:[a,b,{...a,report_digest:"other"}]}};
 const r=operatingComponentRows(v,row);
 assert.equal(r.length,2);assert.equal(r[0].values[0][1],"-0.000000001");
 assert.deepEqual(operatingComponentRows(v,{...row,status:"REVIEW_REQUIRED"}),[]);
});
test("QA visualization rejects invalid counts and preserves unknown drawdown",()=>{
 const s={role:"QA",runs:4,stress_trials:1,review_required:1,expected_outcome_matches:4,drawdown_samples:0,mean_observed_drawdown_bps:0};
 const e={source_mode:"SYNTHETIC",execution_enabled:false,summaries:[s]};
 assert.equal(experimentDisplayRows(e)[0].mean_drawdown,null);
 assert.throws(()=>experimentDisplayRows({...e,source_mode:"ARCHIVED_HISTORICAL"}));
 assert.throws(()=>experimentDisplayRows({...e,summaries:[{...s,expected_outcome_matches:5}]}));
});
