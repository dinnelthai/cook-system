import { auditProjectLedgers } from "./ledger-audit.mjs";
import { reconcileCreatorReceivables } from "./creator-fee-accounting.mjs";
import { auditInventoryAdjustments } from "./historical-inventory-audit.mjs";
import { summarizeHistoricalNav } from "./historical-nav.mjs";
import { auditHistoricalNavEndpoints } from "./historical-nav-evidence.mjs";
import { auditHistoricalTradeEvidence } from "./historical-trade-evidence.mjs";
import { auditHistoricalCostBasis } from "./historical-cost-basis-audit.mjs";
import { parseBaseUnits,U128_MAX } from "../core/integer.mjs";
const amount=(v,n)=>parseBaseUnits(v,{name:n,max:U128_MAX});
const keys=["projectId","quoteAsset","tokenMint","openingCutoff","closingCutoff"];
const equalScope=(a,b)=>a&&b&&keys.every(k=>typeof a[k]==="string"&&a[k].trim()&&a[k]===b[k]);

/** Offline reporting MVP for a closed, synthetic or archived historical interval.
 * All source attestations must be independently verified outside this report.
 * No orders, future quotes, trade selection or execution.
 */
export function buildHistoricalMvpReport(input){
  const {scope,sourceMode,cash,inventory,creator,nav,market}=input;
  if(!["SYNTHETIC","ARCHIVED_HISTORICAL"].includes(sourceMode))throw new Error("unsupported source mode");
  if(!equalScope(scope,scope))throw new Error("report scope required");
  for(const item of [cash,inventory,creator,nav,market])if(!equalScope(scope,item?.scope))throw new Error("report scope mismatch");
  const dual=auditProjectLedgers({reportScope:scope,inventoryScope:inventory.scope,cashScope:cash.scope,cashEntries:cash.entries,inventoryLedger:inventory.ledger,openingCashBaseUnits:cash.openingCashBaseUnits,observedClosingCashBaseUnits:cash.observedClosingCashBaseUnits,cashHistoryComplete:cash.historyComplete,inventoryHistoryComplete:inventory.historyComplete});
  const fees=reconcileCreatorReceivables({...scope,openingReceivableBaseUnits:creator.openingReceivableBaseUnits,observedClosingReceivableBaseUnits:creator.observedClosingReceivableBaseUnits,feeEntries:creator.entries,cashEntries:cash.entries,historyComplete:creator.historyComplete});
  const inv=auditInventoryAdjustments({scope,opening:inventory.opening,closing:inventory.closing,tradeSummary:inventory.tradeSummary,adjustments:inventory.adjustments,historyComplete:inventory.historyComplete});
  const perf=summarizeHistoricalNav({projectId:scope.projectId,quoteAsset:scope.quoteAsset,snapshots:nav.snapshots,historyComplete:nav.historyComplete});
  const navEvidence=auditHistoricalNavEndpoints({scope,nav,cash,inventory,creator});
  const issues=[];
  if(navEvidence.status==="REVIEW_REQUIRED")issues.push(...navEvidence.issues);
  if(dual.status!=="RECONCILED")issues.push("CASH_TRADE_AUDIT_FAILED");
  if(fees.status!=="RECONCILED")issues.push("CREATOR_FEE_AUDIT_FAILED");
  if(inv.status!=="RECONCILED")issues.push("INVENTORY_ADJUSTMENT_AUDIT_FAILED");
  if(perf.status!=="COMPLETE")issues.push("HISTORICAL_NAV_INCOMPLETE");
  // Compare gross capital flows, not only the net: offsetting discrepancies
  // can otherwise cancel out while distorting historical performance.
  const navCapitalIn=nav.snapshots.reduce((sum,s)=>sum+amount(s.capitalInBaseUnits,"NAV capital in"),0n);
  const navCapitalOut=nav.snapshots.reduce((sum,s)=>sum+amount(s.capitalOutBaseUnits,"NAV capital out"),0n);
  const cashTotals=dual.cash_report.confirmed_postings_by_kind;
  if(navCapitalIn!==amount(cashTotals.CAPITAL_IN,"cash capital in")||
     navCapitalOut!==amount(cashTotals.CAPITAL_OUT,"cash capital out"))issues.push("NAV_CASH_CAPITAL_FLOW_MISMATCH");
  if(inv.expected_token_balance!==inventory.ledger.ending_token_balance_base_units||inv.expected_cost_basis!==inventory.ledger.remaining_cost_basis_quote_base_units)issues.push("INVENTORY_LEDGER_CLOSING_MISMATCH");
  if(inventory.tradeSummary.acquisitionCost!==inventory.ledger.total_buy_cost_quote_base_units)issues.push("ACQUISITION_COST_MISMATCH");
  const journal=inventory.ledger.position_journal;
  let bought=0n,sold=0n,disposed=0n,basisKnown=true;
  for(const j of journal){
    if(j.side==="BUY")bought+=amount(j.token_amount_base_units,"bought amount");
    else {sold+=amount(j.token_amount_base_units,"sold amount");if(j.allocated_cost_basis_quote_base_units==null)basisKnown=false;else disposed+=amount(j.allocated_cost_basis_quote_base_units,"disposed basis");}
  }
  if(basisKnown&&(BigInt(inventory.ledger.total_net_sell_proceeds_quote_base_units)-disposed).toString()!==inventory.ledger.realized_pnl_quote_base_units)issues.push("REALIZED_PNL_MISMATCH");
  if(bought.toString()!==inventory.tradeSummary.boughtTokens||sold.toString()!==inventory.tradeSummary.soldTokens||!basisKnown||disposed.toString()!==inventory.tradeSummary.disposedBasis)issues.push("INVENTORY_TRADE_SUMMARY_MISMATCH");
  if(!Array.isArray(market.trades))throw new TypeError("historical market trades required");
  const seen=new Set();let last=-1,buyCount=0,sellCount=0,buyVolume=0n,sellVolume=0n;
  for(const t of market.trades){
    if(!t||typeof t.id!=="string"||!t.id.trim()||seen.has(t.id))throw new Error("duplicate or missing market trade ID");
    seen.add(t.id);
    if(!Number.isSafeInteger(t.sequence)||t.sequence<=last)throw new Error("market sequence must increase");
    last=t.sequence;
    if(t.side!=="BUY"&&t.side!=="SELL")throw new Error("invalid trade side");
    if(t.status!=="FINALIZED"||t.reconciliation!=="PASS"){issues.push("UNVERIFIED_MARKET_TRADE:"+t.id);continue;}
    const q=amount(t.quoteNotionalBaseUnits,"historical quote notional");
    if(t.side==="BUY"){buyCount++;buyVolume+=q;}else{sellCount++;sellVolume+=q;}
  }
  if(market.historyComplete!==true||market.snapshot?.reconciliation!=="PASS")issues.push("MARKET_HISTORY_OR_SNAPSHOT_INCOMPLETE");
  if(!["bonding_curve","complete_pending_migration"].includes(market.snapshot?.lifecycle))issues.push("OUTSIDE_INNER_MARKET");
  const reserve=market.snapshot?.realQuoteReservesBaseUnits;
  if(reserve==null)issues.push("REAL_RESERVE_UNKNOWN");else amount(reserve,"real reserve");
  for(const k of ["virtualQuoteReservesBaseUnits","virtualTokenReservesBaseUnits","realTokenReservesBaseUnits"]){if(market.snapshot?.[k]==null)issues.push("MISSING_CURVE_FIELD:"+k);else amount(market.snapshot[k],k);}
  const tradeEvidence=auditHistoricalTradeEvidence({market,journal,cashEntries:cash.entries});
  issues.push(...tradeEvidence.issues);
  const costBasisEvidence=auditHistoricalCostBasis({inventory,market});
  if(costBasisEvidence.status==="REVIEW_REQUIRED")issues.push(...costBasisEvidence.issues);
  const complete=issues.length===0;
  return {schema_version:"mvp.1",scope,source_mode:sourceMode,status:complete?"REPORT_READY":"REVIEW_REQUIRED",issues,
    market_history:{confirmed_buy_count:buyCount,confirmed_sell_count:sellCount,gross_buy_notional_base_units:buyVolume.toString(),gross_sell_notional_base_units:sellVolume.toString(),real_quote_reserves_base_units:reserve??null,virtual_quote_reserves_base_units:market.snapshot?.virtualQuoteReservesBaseUnits??null,virtual_token_reserves_base_units:market.snapshot?.virtualTokenReservesBaseUnits??null,real_token_reserves_base_units:market.snapshot?.realTokenReservesBaseUnits??null},
    accounting:{closing_cash_base_units:complete?dual.cash_report.observed_closing_cash_base_units:null,closing_token_balance_base_units:complete?inv.expected_token_balance:null,remaining_cost_basis_base_units:complete?inv.verified_cost_basis:null,realized_project_pnl_base_units:complete?dual.project_pnl.project_realized_net_pnl_base_units:null,creator_cash_income_base_units:complete?fees.verified_cash_income_base_units:null,max_observed_drawdown_bps:complete&&sourceMode==="SYNTHETIC"?perf.max_observed_drawdown_bps:null},
    cost_basis_evidence:costBasisEvidence,trade_evidence:tradeEvidence,nav_evidence:navEvidence,audits:{dual:dual.issues,creator:fees.issues,inventory:inv.issues,nav:perf.issues,nav_endpoints:navEvidence.issues,trade_evidence:[...tradeEvidence.issues,...tradeEvidence.missing],cost_basis:costBasisEvidence.issues},execution_enabled:false,
    note:"Retrospective report only. Synthetic records are not chain evidence. Source completeness and NAV valuations require external verification; trade notionals are not reserve deltas."};
}
