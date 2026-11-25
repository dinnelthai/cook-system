import {auditSyntheticLedger} from "../src/core/synthetic-ledger-audit.mjs";
/** Recompute from supplied input; never trust a precomputed result. */
export function reviewSyntheticLedgerInput(input){
 const audit=auditSyntheticLedger(input);
 return {audit,metrics:[["账户数量",audit.account_count],["分录数量",audit.entry_count],["报价资产净变动",audit.net_quote_delta_base_units],["Token 净变动",audit.net_token_delta_base_units]],
  rows:audit.accounts.map(a=>[a.account_id,a.quote_difference_base_units,a.token_difference_base_units]),issues:audit.issues};
}
