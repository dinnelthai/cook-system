import {buildHistoricalMvpReport} from "./historical-mvp-report.mjs";
import {reconcileProjectCash} from "./project-accounting.mjs";

/** Closed-interval descriptive dashboard. No live trading or forward quotes. */
export function buildHistoricalDashboard(input){
 const report=buildHistoricalMvpReport(input);
 const cash=reconcileProjectCash({projectId:input.scope.projectId,quoteAsset:input.scope.quoteAsset,openingCashBaseUnits:input.cash.openingCashBaseUnits,observedClosingCashBaseUnits:input.cash.observedClosingCashBaseUnits,entries:input.cash.entries,historyComplete:input.cash.historyComplete});
 const ready=report.status==="REPORT_READY";
 const totals=cash.confirmed_postings_by_kind;
 const confirmed=input.market.trades.filter(t=>t.status==="FINALIZED"&&t.reconciliation==="PASS");
 const addressesKnown=input.market.historyComplete===true&&confirmed.length===input.market.trades.length&&confirmed.every(t=>typeof t.actorAddress==="string"&&t.actorAddress.trim()===t.actorAddress&&t.actorAddress.length>0);
 const addresses=side=>addressesKnown?new Set(confirmed.filter(t=>t.side===side).map(t=>t.actorAddress)).size:null;
 const marketVerified=input.market.historyComplete===true&&confirmed.length===input.market.trades.length&&input.market.snapshot.reconciliation==="PASS";
 return {schema_version:"historical-dashboard.1",scope:report.scope,source_mode:report.source_mode,status:report.status,issues:report.issues,
 market:{buy_trade_count:report.market_history.confirmed_buy_count,sell_trade_count:report.market_history.confirmed_sell_count,buy_address_count:addresses("BUY"),sell_address_count:addresses("SELL"),history_complete:marketVerified,buy_notional_base_units:report.market_history.gross_buy_notional_base_units,sell_notional_base_units:report.market_history.gross_sell_notional_base_units,verified_real_reserve_base_units:marketVerified?report.market_history.real_quote_reserves_base_units:null},
 treasury:{actual_trade_spend_base_units:ready?totals.TRADE_CASH_COST:null,actual_trade_receipts_base_units:ready?totals.TRADE_NET_RECEIPT:null,net_trade_cash_spend_base_units:ready?(BigInt(totals.TRADE_CASH_COST)-BigInt(totals.TRADE_NET_RECEIPT)).toString():null,recorded_capital_in_base_units:ready?totals.CAPITAL_IN:null,recorded_capital_out_base_units:ready?totals.CAPITAL_OUT:null,recorded_expenses_base_units:ready?cash.confirmed_expenses_base_units:null,...report.accounting},
 note:"Only completed historical intervals. Address counts are not independent people. Opening balances are not lifetime funding. Trade spending and receipts exclude external capital flows and separately recorded expenses. No buy safety score, counterparty profit targeting or future disposal quote.",execution_enabled:false};
}
