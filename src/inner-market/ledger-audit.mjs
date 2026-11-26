import { parseBaseUnits, U128_MAX } from "../core/integer.mjs";
import { reconcileProjectCash, summarizeProjectRealizedPnl } from "./project-accounting.mjs";

const amount = (v,n) => parseBaseUnits(v,{name:n,max:U128_MAX});
const tradeKinds = new Set(["TRADE_CASH_COST","TRADE_NET_RECEIPT"]);
const scopeKeys=["projectId","quoteAsset","tokenMint","openingCutoff","closingCutoff"];
// Older row formats omit scope labels. Explicit conflicting labels are not
// permitted even when the surrounding report and aggregate totals match.
const scopeConflict=(row,s)=>scopeKeys.some(k=>Object.hasOwn(row,k)&&row[k]!==s[k]);
function scope(s) {
  if (!s || !["projectId","quoteAsset","tokenMint","openingCutoff","closingCutoff"].every(k=>typeof s[k]==="string"&&s[k].trim())) throw new TypeError("explicit project, asset, mint and cutoffs required");
  return JSON.stringify([s.projectId,s.quoteAsset,s.tokenMint,s.openingCutoff,s.closingCutoff]);
}

/** Closed-interval realized accounting: recompute from declared reconciled
 * sale proceeds and explicitly allocated historical acquisition costs.
 * No cost allocation method, live valuation, wallet ranking or future quote.
 * A match verifies arithmetic only, not the source or correctness of allocation. */
export function auditDeclaredRealizedPnl(ledger){
 const issues=[],result=(status,computed=null)=>({status,issues,realized_pnl_quote_base_units:status==="DECLARED_ARITHMETIC_MATCH"?computed:null,allocation_attestation:"UNKNOWN",source_attestation:"UNKNOWN"});
 if(!Array.isArray(ledger?.position_journal)||ledger.cost_basis_complete!==true||ledger.realized_pnl_complete!==true||ledger.inventory_reconciliation!=="MATCH"||ledger.ignored_unconfirmed_count!==0){issues.push("PNL_BASIS_INCOMPLETE");return result("PARTIAL");}
 let buys=0n,sells=0n,disposed=0n,missing=false;
 const ids=new Set();
 try{
  for(const j of ledger.position_journal){
   if(!j||typeof j.event_id!=="string"||!j.event_id.trim()||ids.has(j.event_id)||!["BUY","SELL"].includes(j.side))throw Error("INVALID_JOURNAL");
   ids.add(j.event_id);
   if(j.side==="BUY")buys+=amount(j.cash_cost_quote_base_units,"acquisition cost");
   else{
    sells+=amount(j.net_quote_proceeds_base_units,"net proceeds");
    if(j.allocated_cost_basis_quote_base_units==null)missing=true;
    else disposed+=amount(j.allocated_cost_basis_quote_base_units,"disposed cost");
   }
   if(buys>U128_MAX||sells>U128_MAX||disposed>U128_MAX)throw Error("PNL_RANGE_EXCEEDED");
  }
  if(buys!==amount(ledger.total_buy_cost_quote_base_units,"buy total")||sells!==amount(ledger.total_net_sell_proceeds_quote_base_units,"sell total"))issues.push("PNL_JOURNAL_TOTAL_MISMATCH");
  if(issues.length)return result("REVIEW_REQUIRED");
  if(missing||ledger.realized_pnl_quote_base_units==null){issues.push("PNL_DISPOSED_BASIS_UNKNOWN");return result("PARTIAL");}
  const computed=(sells-disposed).toString();
  if(ledger.realized_pnl_quote_base_units!==computed){issues.push("PNL_REALIZED_ARITHMETIC_MISMATCH");return result("REVIEW_REQUIRED");}
  return result("DECLARED_ARITHMETIC_MATCH",computed);
 }catch{issues.push("PNL_JOURNAL_INVALID");return result("REVIEW_REQUIRED");}
}

/**
 * Historical cross-ledger audit. Scope metadata and completeness attestations
 * are supplied by the caller; this does not independently authenticate chain data.
 * Each verified cash trade posting must reference exactly one inventory journal event.
 */
export function auditProjectLedgers({reportScope, inventoryScope, cashScope, cashEntries, inventoryLedger, openingCashBaseUnits="0", observedClosingCashBaseUnits=null, cashHistoryComplete=false, inventoryHistoryComplete=false}) {
  if(scope(reportScope)!==scope(inventoryScope)||scope(reportScope)!==scope(cashScope)) throw new Error("ledger scope or cutoff mismatch");
  if(!Array.isArray(cashEntries)||!Array.isArray(inventoryLedger?.position_journal)) throw new TypeError("cash entries and inventory journal required");
  if(cashEntries.some(p=>p&&scopeConflict(p,reportScope))||inventoryLedger.position_journal.some(j=>j&&scopeConflict(j,reportScope)))throw Error("ledger row scope or cutoff mismatch");
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
  const realized=auditDeclaredRealizedPnl(inventoryLedger);
  if(realized.status!=="DECLARED_ARITHMETIC_MATCH")for(const code of realized.issues)if(!issues.some(i=>i.code===code))issues.push({code});
  const ready=issues.length===0;
  return {
    scope:{...reportScope},status:ready?"RECONCILED":"REVIEW_REQUIRED",issues,cash_report:cash,
    project_pnl:summarizeProjectRealizedPnl({cashReport:cash,tradeRealizedPnlBaseUnits:realized.realized_pnl_quote_base_units,tradeHistoryComplete:ready}),
    note:"Historical accounting audit; scope metadata, balance snapshots and completeness require independently verified sources."
  };
}
