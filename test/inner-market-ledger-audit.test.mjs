import test from "node:test";
import assert from "node:assert/strict";
import { auditProjectLedgers } from "../src/inner-market/ledger-audit.mjs";
const scope={projectId:"fixture",quoteAsset:"SOL",tokenMint:"fixture-mint",openingCutoff:"slot:1",closingCutoff:"slot:20"};
const post=(id,kind,amountBaseUnits,tradeEventId)=>({id,kind,amountBaseUnits,tradeEventId,projectId:scope.projectId,quoteAsset:scope.quoteAsset,status:"FINALIZED",reconciliation:"PASS"});
const ledger={
 position_journal:[{event_id:"b",side:"BUY",cash_cost_quote_base_units:"200"},{event_id:"s",side:"SELL",net_quote_proceeds_base_units:"90",allocated_cost_basis_quote_base_units:"100"}],
 total_buy_cost_quote_base_units:"200",total_net_sell_proceeds_quote_base_units:"90",
 inventory_reconciliation:"MATCH",ignored_unconfirmed_count:0,cost_basis_complete:true,realized_pnl_complete:true,realized_pnl_quote_base_units:"-10",
};
const args={reportScope:scope,cashScope:scope,inventoryScope:scope,cashEntries:[post("capital","CAPITAL_IN","500"),post("buy","TRADE_CASH_COST","200","b"),post("sell","TRADE_NET_RECEIPT","90","s")],inventoryLedger:ledger,observedClosingCashBaseUnits:"390",cashHistoryComplete:true,inventoryHistoryComplete:true};
test("matched historical postings reconcile and preserve negative realized PnL",()=>{
 const r=auditProjectLedgers(args);
 assert.equal(r.status,"RECONCILED");
 assert.equal(r.project_pnl.project_realized_net_pnl_base_units,"-10");
});
test("equal cash totals cannot conceal incorrect event attribution",()=>{
 const r=auditProjectLedgers({...args,cashEntries:[args.cashEntries[0],post("buy","TRADE_CASH_COST","200","s"),post("sell","TRADE_NET_RECEIPT","90","b")]});
 assert.equal(r.status,"REVIEW_REQUIRED");
 assert.equal(r.project_pnl.project_realized_net_pnl_base_units,null);
 assert.equal(r.issues.filter(x=>x.code==="TRADE_POSTING_MISMATCH").length,2);
});
test("missing and duplicate trade references are detected",()=>{
 const r=auditProjectLedgers({...args,cashEntries:[args.cashEntries[0],args.cashEntries[1],post("duplicate","TRADE_CASH_COST","200","b")],observedClosingCashBaseUnits:"100"});
 assert.ok(r.issues.some(x=>x.code==="DUPLICATE_TRADE_POSTING"));
 assert.ok(r.issues.some(x=>x.code==="INVENTORY_EVENT_WITHOUT_CASH_POSTING"));
});
test("cutoff and mint mismatch are rejected",()=>{
 assert.throws(()=>auditProjectLedgers({...args,cashScope:{...scope,closingCutoff:"slot:21"}}),/scope or cutoff mismatch/);
 assert.throws(()=>auditProjectLedgers({...args,inventoryScope:{...scope,tokenMint:"different"}}),/scope or cutoff mismatch/);
});
test("matching totals alone cannot establish completeness",()=>{
 const r=auditProjectLedgers({...args,inventoryHistoryComplete:false});
 assert.equal(r.status,"REVIEW_REQUIRED");
 assert.equal(r.project_pnl.project_realized_net_pnl_base_units,null);
});
test("unreconciled inventory and unknown basis suppress final project PnL",()=>{
 const r=auditProjectLedgers({...args,inventoryLedger:{...ledger,inventory_reconciliation:"MISMATCH",cost_basis_complete:false,realized_pnl_complete:false,realized_pnl_quote_base_units:null}});
 assert.ok(r.issues.some(x=>x.code==="INVENTORY_NOT_RECONCILED"));
 assert.ok(r.issues.some(x=>x.code==="PNL_BASIS_INCOMPLETE"));
 assert.equal(r.project_pnl.project_realized_net_pnl_base_units,null);
});
test("tampered ledger aggregates are detected",()=>{
 const r=auditProjectLedgers({...args,inventoryLedger:{...ledger,total_buy_cost_quote_base_units:"201"}});
 assert.ok(r.issues.some(x=>x.code==="INVENTORY_JOURNAL_TOTAL_MISMATCH"));
});

test("explicit foreign mint or cutoff on an individual posting cannot hide behind matching ledger scopes",()=>{
 for(const patch of [{tokenMint:"foreign"},{closingCutoff:"slot:21"},{openingCutoff:null}]){
  const cashEntries=args.cashEntries.map((p,i)=>i===1?{...p,...patch}:p);
  assert.throws(()=>auditProjectLedgers({...args,cashEntries}),/ledger row scope or cutoff mismatch/);
 }
 const inventoryLedger={...ledger,position_journal:ledger.position_journal.map((j,i)=>i===0?{...j,tokenMint:"foreign"}:j)};
 assert.throws(()=>auditProjectLedgers({...args,inventoryLedger}),/ledger row scope or cutoff mismatch/);
 assert.equal(auditProjectLedgers(args).status,"RECONCILED");
});

import {auditDeclaredRealizedPnl} from "../src/inner-market/ledger-audit.mjs";
test("realized PnL is independently recomputed from declared disposed basis and net sale proceeds",()=>{assert.equal(auditDeclaredRealizedPnl(ledger).realized_pnl_quote_base_units,"-10");const r=auditProjectLedgers({...args,inventoryLedger:{...ledger,realized_pnl_quote_base_units:"999"}});assert.equal(r.status,"REVIEW_REQUIRED");assert.equal(r.project_pnl.project_realized_net_pnl_base_units,null);assert.ok(r.issues.some(i=>i.code==="PNL_REALIZED_ARITHMETIC_MISMATCH"));});
test("missing cost allocation is not treated as zero, even with complete flags",()=>{const incomplete={...ledger,position_journal:[ledger.position_journal[0],{...ledger.position_journal[1],allocated_cost_basis_quote_base_units:null}]};assert.equal(auditDeclaredRealizedPnl(incomplete).status,"PARTIAL");assert.equal(auditProjectLedgers({...args,inventoryLedger:incomplete}).project_pnl.project_realized_net_pnl_base_units,null);});
test("realized arithmetic preserves exact units and rejects duplicate records",()=>{const l={...ledger,position_journal:[{event_id:"s",side:"SELL",net_quote_proceeds_base_units:"9007199254740993",allocated_cost_basis_quote_base_units:"9007199254740994"}],total_buy_cost_quote_base_units:"0",total_net_sell_proceeds_quote_base_units:"9007199254740993",realized_pnl_quote_base_units:"-1"};assert.equal(auditDeclaredRealizedPnl(l).realized_pnl_quote_base_units,"-1");assert.equal(auditDeclaredRealizedPnl({...l,position_journal:[...l.position_journal,...l.position_journal]}).status,"REVIEW_REQUIRED");});
