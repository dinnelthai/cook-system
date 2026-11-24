import { parseBaseUnits, U128_MAX } from "../core/integer.mjs";
import { reconcileProjectCash, summarizeProjectRealizedPnl } from "./project-accounting.mjs";

const amount = (v,n) => parseBaseUnits(v,{name:n,max:U128_MAX});
const tradeKinds = new Set(["TRADE_CASH_COST","TRADE_NET_RECEIPT"]);
function scope(s) {
  if (!s || !["projectId","quoteAsset","tokenMint","openingCutoff","closingCutoff"].every(k=>typeof s[k]==="string"&&s[k].trim())) throw new TypeError("explicit project, asset, mint and cutoffs required");
  return JSON.stringify([s.projectId,s.quoteAsset,s.tokenMint,s.openingCutoff,s.closingCutoff]);
}

/**
 * Historical cross-ledger audit. Scope metadata and completeness attestations
 * are supplied by the caller; this does not independently authenticate chain data.
 * Each verified cash trade posting must reference exactly one inventory journal event.
 */
export function auditProjectLedgers({reportScope, inventoryScope, cashScope, cashEntries, inventoryLedger, openingCashBaseUnits="0", observedClosingCashBaseUnits=null, cashHistoryComplete=false, inventoryHistoryComplete=false}) {
  if(scope(reportScope)!==scope(inventoryScope)||scope(reportScope)!==scope(cashScope)) throw new Error("ledger scope or cutoff mismatch");
  if(!Array.isArray(cashEntries)||!Array.isArray(inventoryLedger?.position_journal)) throw new TypeError("cash entries and inventory journal required");
  const cash = reconcileProjectCash({
    projectId:reportScope.projectId,quoteAsset:reportScope.quoteAsset,openingCashBaseUnits,entries:cashEntries,
    observedClosingCashBaseUnits,historyComplete:cashHistoryComplete
  });
  const issues=[];
  const byId=new Map();
  let buys=0n,sells=0n;
  for(const j of inventoryLedger.position_journal) {
    if(typeof j.event_id!=="string"||!j.event_id.trim()||byId.has(j.event_id)) throw new Error("missing or duplicate inventory event id");
    if(j.side!=="BUY"&&j.side!=="SELL") throw new TypeError("invalid journal side");
    const buy=j.side==="BUY";
    const value=amount(buy?j.cash_cost_quote_base_units:j.net_quote_proceeds_base_units,"journal cash amount");
    if(buy) buys+=value; else sells+=value;
    byId.set(j.event_id,{kind:buy?"TRADE_CASH_COST":"TRADE_NET_RECEIPT",value,matched:false});
  }
  for(const p of cashEntries) {
    if(!tradeKinds.has(p.kind)||p.status!=="FINALIZED"||p.reconciliation!=="PASS") continue;
    const j=byId.get(p.tradeEventId);
    if(!j) {issues.push({code:"CASH_TRADE_WITHOUT_INVENTORY_EVENT",posting_id:p.id});continue;}
    if(j.matched) {issues.push({code:"DUPLICATE_TRADE_POSTING",event_id:p.tradeEventId});continue;}
    j.matched=true;
    if(j.kind!==p.kind||j.value!==amount(p.amountBaseUnits,"cash posting amount")) issues.push({code:"TRADE_POSTING_MISMATCH",event_id:p.tradeEventId});
  }
  for(const [id,j] of byId) if(!j.matched&&j.value!==0n) issues.push({code:"INVENTORY_EVENT_WITHOUT_CASH_POSTING",event_id:id});
  if(buys!==amount(inventoryLedger.total_buy_cost_quote_base_units,"ledger buy total")||
     sells!==amount(inventoryLedger.total_net_sell_proceeds_quote_base_units,"ledger sell total")) issues.push({code:"INVENTORY_JOURNAL_TOTAL_MISMATCH"});
  if(buys!==amount(cash.confirmed_postings_by_kind.TRADE_CASH_COST,"cash buy total")||
     sells!==amount(cash.confirmed_postings_by_kind.TRADE_NET_RECEIPT,"cash sell total")) issues.push({code:"CROSS_LEDGER_TOTAL_MISMATCH"});
  if(cash.status!=="RECONCILED") issues.push({code:"CASH_NOT_RECONCILED"});
  if(inventoryLedger.inventory_reconciliation!=="MATCH") issues.push({code:"INVENTORY_NOT_RECONCILED"});
  if(!inventoryHistoryComplete||inventoryLedger.ignored_unconfirmed_count!==0) issues.push({code:"INVENTORY_HISTORY_INCOMPLETE"});
  if(inventoryLedger.cost_basis_complete!==true||inventoryLedger.realized_pnl_complete!==true||inventoryLedger.realized_pnl_quote_base_units==null) issues.push({code:"PNL_BASIS_INCOMPLETE"});
  const ready=issues.length===0;
  return {
    scope:{...reportScope},status:ready?"RECONCILED":"REVIEW_REQUIRED",issues,cash_report:cash,
    project_pnl:summarizeProjectRealizedPnl({cashReport:cash,tradeRealizedPnlBaseUnits:inventoryLedger.realized_pnl_quote_base_units??null,tradeHistoryComplete:ready}),
    note:"Historical accounting audit; scope metadata, balance snapshots and completeness require independently verified sources."
  };
}
