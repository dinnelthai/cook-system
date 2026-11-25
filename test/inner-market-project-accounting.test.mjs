import test from "node:test";
import assert from "node:assert/strict";
import { reconcileProjectCash, summarizeProjectRealizedPnl } from "../src/inner-market/project-accounting.mjs";

const scope = { projectId: "fixture", quoteAsset: "SOL" };
const posting = (id, kind, amountBaseUnits, extra={}) => ({
  ...scope,id,kind,amountBaseUnits,status:"FINALIZED",reconciliation:"PASS",...extra,
});
const entries = [
  posting("capital", "CAPITAL_IN", "1000"),
  posting("cost", "TRADE_CASH_COST", "600"),
  posting("sale", "TRADE_NET_RECEIPT", "300"),
  posting("launch", "ISSUANCE_EXPENSE", "20"),
  posting("creator", "CREATOR_FEE_RECEIVED", "15"),
  posting("failed-fee", "FAILED_TX_EXPENSE", "5"),
  posting("withdrawal", "CAPITAL_OUT", "100"),
];
const report = (extra={}) => reconcileProjectCash({
  ...scope,entries,historyComplete:true,observedClosingCashBaseUnits:"590",...extra,
});
test("cash conservation separates capital, trade flows and expenses",()=>{
  const result=report();
  assert.equal(result.status,"RECONCILED");
  assert.equal(result.capital_net_flow_base_units,"900");
  assert.equal(result.operating_net_cash_flow_base_units,"-310");
  assert.equal(result.expected_closing_cash_base_units,"590");
  assert.equal(result.cash_difference_base_units,"0");
  assert.equal(result.confirmed_expenses_base_units,"25");
});
test("project realized profit excludes capital and deducts nontrade expenses once",()=>{
  const result=summarizeProjectRealizedPnl({cashReport:report(),tradeRealizedPnlBaseUnits:"80",tradeHistoryComplete:true});
  assert.equal(result.status,"COMPLETE");
  assert.equal(result.project_realized_net_pnl_base_units,"70");
});
test("negative realized PnL is preserved",()=>{
  const result=summarizeProjectRealizedPnl({cashReport:report(),tradeRealizedPnlBaseUnits:"-30",tradeHistoryComplete:true});
  assert.equal(result.project_realized_net_pnl_base_units,"-40");
});
test("cash mismatch and incomplete history cannot produce final profit",()=>{
  const cashReport=report({observedClosingCashBaseUnits:"589",historyComplete:false});
  assert.deepEqual(cashReport.flags,["HISTORY_INCOMPLETE","CASH_MISMATCH"]);
  assert.equal(cashReport.cash_difference_base_units,"-1");
  assert.equal(summarizeProjectRealizedPnl({cashReport,tradeRealizedPnlBaseUnits:"80",tradeHistoryComplete:true}).project_realized_net_pnl_base_units,null);
});
test("pending or unverified postings do not update confirmed cash",()=>{
  const result=report({entries:[...entries,posting("pending","TRADE_CASH_COST","10",{status:"PENDING"}),posting("unverified","OTHER_INCOME","20",{reconciliation:"UNKNOWN"})]});
  assert.equal(result.expected_closing_cash_base_units,"590");
  assert.deepEqual(result.flags,["UNVERIFIED_POSTINGS","PENDING_POSTINGS"]);
});
test("duplicates and mixed project or asset entries are rejected",()=>{
  assert.throws(()=>report({entries:[entries[0],entries[0]]}),/duplicate/);
  assert.throws(()=>report({entries:[posting("wrong","CAPITAL_IN","1",{quoteAsset:"USDC"})]}),/scope mismatch/);
});
test("opening cash and missing observed snapshot are explicit",()=>{
  const result=report({entries:[],openingCashBaseUnits:"25",observedClosingCashBaseUnits:null});
  assert.equal(result.expected_closing_cash_base_units,"25");
  assert.deepEqual(result.flags,["CASH_SNAPSHOT_MISSING"]);
});
test("unknown trade PnL remains unknown even when cash matches",()=>{
  assert.equal(summarizeProjectRealizedPnl({cashReport:report(),tradeHistoryComplete:false}).project_realized_net_pnl_base_units,null);
});

test("signed historical profit parsing preserves exact bounds and rejects oversized magnitudes",()=>{
 const max=(1n<<128n)-1n,cashReport=report({entries:[],openingCashBaseUnits:"0",observedClosingCashBaseUnits:"0"});
 for(const n of [max,-max,0n])assert.equal(summarizeProjectRealizedPnl({cashReport,tradeRealizedPnlBaseUnits:n.toString(),tradeHistoryComplete:true}).project_realized_net_pnl_base_units,n.toString());
 for(const v of [(max+1n).toString(),(-max-1n).toString(),"-"+"9".repeat(100000)])assert.throws(()=>summarizeProjectRealizedPnl({cashReport,tradeRealizedPnlBaseUnits:v,tradeHistoryComplete:true}),RangeError);
 for(const v of ["-0","-01","1e3"])assert.throws(()=>summarizeProjectRealizedPnl({cashReport,tradeRealizedPnlBaseUnits:v,tradeHistoryComplete:true}),TypeError);
});

test("declared ordered cash replay detects impossible intermediate negative balances despite matched endpoints",()=>{
 const x=[posting("spend","OPERATING_EXPENSE","10",{cashSequence:1}),posting("fund","CAPITAL_IN","10",{cashSequence:2})];
 const r=report({entries:x,observedClosingCashBaseUnits:"0"});
 assert.equal(r.status,"REVIEW_REQUIRED");assert.ok(r.flags.includes("NEGATIVE_INTERMEDIATE_CASH"));
 assert.equal(r.intermediate_balance_audit.first_negative_posting_id,"spend");
 const y=x.map((p,i)=>({...p,cashSequence:2-i}));
 assert.equal(report({entries:y,observedClosingCashBaseUnits:"0"}).intermediate_balance_audit.status,"DECLARED_ORDER_REPLAY_MATCH");
 assert.equal(report().intermediate_balance_audit.status,"ORDER_UNAVAILABLE");
});
