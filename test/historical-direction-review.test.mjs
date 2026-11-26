import {test} from "node:test";
import assert from "node:assert/strict";
import {historicalDirectionSummary,historicalTradePosition,historicalLogPage,historicalScopeMatches} from "../web/historical-direction-review.mjs";
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

test("trade position requires matching complete historical inventory evidence",()=>{
 const scope={projectId:"p",tokenMint:"m",quoteAsset:"SOL_LAMPORTS",openingCutoff:"a",closingCutoff:"b"};
 const input={scope,inventory:{scope:{...scope},historyComplete:true,ledger:{
  inventory_reconciliation:"MATCH",cost_basis_complete:true,realized_pnl_complete:true,ignored_unconfirmed_count:0,position_journal:[{event_id:"b",side:"BUY",cash_cost_quote_base_units:"200"},{event_id:"s",side:"SELL",net_quote_proceeds_base_units:"90",allocated_cost_basis_quote_base_units:"100"}],
  total_buy_cost_quote_base_units:"200",total_net_sell_proceeds_quote_base_units:"90",
  ending_token_balance_base_units:"50",remaining_cost_basis_quote_base_units:"100",realized_pnl_quote_base_units:"-10"}}};
 assert.deepEqual(historicalTradePosition(input),{buy_cost:"200",net_sell_proceeds:"90",token_balance:"50",remaining_cost:"100",realized_pnl:"-10"});
 input.inventory.ledger.realized_pnl_quote_base_units="99";
 assert.equal(historicalTradePosition(input).realized_pnl,null);
 input.inventory.ledger.realized_pnl_quote_base_units="-10";
 input.inventory.ledger.realized_pnl_complete=false;
 assert.equal(historicalTradePosition(input).realized_pnl,null);
 input.inventory.ledger.total_buy_cost_quote_base_units="1e3";
 assert.equal(historicalTradePosition(input).buy_cost,null);
 input.inventory.scope.tokenMint="other";
 assert.equal(historicalTradePosition(input),null);
 input.inventory.scope.tokenMint="m";
 input.inventory.historyComplete=false;
 assert.equal(historicalTradePosition(input),null);
});

test("log pagination and direction filters exclude unconfirmed records",()=>{const r=historicalLogPage(report,{side:"ALL",page:2,pageSize:2});assert.equal(r.total,3);assert.equal(r.pages,2);assert.equal(r.rows.length,1);assert.equal(r.rows[0].quoteNotionalBaseUnits,"9007199254740993");assert.equal(historicalLogPage(report,{side:"SELL",query:"sell"}).total,1);assert.equal(historicalLogPage(report,{query:"missing"}).total,0);assert.equal(historicalLogPage(null),null);});
test("historical review scope must match selected project and mint",()=>{const p={project_id:"p",token:{mint:"m"}},r={scope:{projectId:"p",tokenMint:"m",quoteAsset:"SOL_LAMPORTS"}};assert.equal(historicalScopeMatches(p,r),true);assert.equal(historicalScopeMatches(p,{scope:{...r.scope,tokenMint:"other"}}),false);assert.equal(historicalScopeMatches(null,r),false);});
