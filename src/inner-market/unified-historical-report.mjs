import {computeTerminalState} from "./terminal-state.mjs";

/** Single presentation model for historical review. Internal consistency is not
 * source authentication. Never substitute a caller-supplied derived report. */
export function buildUnifiedHistoricalReport(input){
 const {report:raw,state}=computeTerminalState(input);
 const accounting=Object.fromEntries(Object.keys(raw.accounting).map(k=>[k,state.treasury[k]??null]));
 const market_history={...raw.market_history,buy_address_count:state.market.buy_address_count,sell_address_count:state.market.sell_address_count};
 for(const k of ["real_quote_reserves_base_units","virtual_quote_reserves_base_units","real_token_reserves_base_units","virtual_token_reserves_base_units"])market_history[k]=state.market_state.snapshot[k];
 return {...raw,schema_version:"unified-historical-report.1",status:state.status,issues:state.issues,accounting,market_history,terminal_state:state,trust:state.trust,market_state:state.market_state,closing_account_set:state.closing_account_set,source_attestation:"UNKNOWN",settlement_allowed:state.settlement_allowed,execution_enabled:false};
}
