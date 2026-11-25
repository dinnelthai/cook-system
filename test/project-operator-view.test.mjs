import test from "node:test";
import assert from "node:assert/strict";
import {parseDeclaredSol,parseBudgetDeclaration,budgetInputValue,lifecycleLabel,operationalLabel,projectWalletRegistrationRows} from "../web/project-operator-view.mjs";
test("static budget inputs distinguish unknown and zero with exact decimal conversion",()=>{
 assert.equal(parseDeclaredSol(""),null);assert.equal(parseDeclaredSol("0"),"0");assert.equal(parseDeclaredSol("0.000000001"),"1");
 assert.equal(parseDeclaredSol("9007199.254740993"),"9007199254740993");
 assert.equal(budgetInputValue(null),"");assert.equal(budgetInputValue("0"),"0.00");
 for(const s of ["-1","1e3","0.0000000001","18446744074"])assert.throws(()=>parseDeclaredSol(s));
});
test("declared limits preserve unset fields and reject conflicting caps",()=>{
 assert.deepEqual(parseBudgetDeclaration({}),{max_project_budget_base_units:null,max_order_size_base_units:null,max_wallet_exposure_base_units:null,max_drawdown_bps:null});
 assert.equal(parseBudgetDeclaration({max_drawdown_bps:"0"}).max_drawdown_bps,0);
 assert.throws(()=>parseBudgetDeclaration({max_drawdown_bps:"10001"}));
 assert.throws(()=>parseBudgetDeclaration({max_project_budget_base_units:"1",max_order_size_base_units:"2"}),/LIMIT_HIERARCHY_CONFLICT/);
});
test("stage and registered operation status remain distinct; wallet labels do not attest ownership",()=>{
 assert.equal(lifecycleLabel("PUMPSWAP_ACTIVE"),"外盘阶段");assert.equal(operationalLabel("HALTED"),"已暂停");
 const rows=projectWalletRegistrationRows({wallet_groups:[{name:"Reserve",purpose:"TREASURY",members:[{wallet_address:"a",role:"TREASURY",enabled:true,allocation_limit_base_units:"0"}]}]});
 assert.equal(rows[0][5],"0.00 SOL");assert.equal(rows[0][6],"归属未独立核验");
});
