// Closed-interval report identity and descriptive market state only.
const core=["projectId","quoteAsset","tokenMint","openingCutoff","closingCutoff"];
const extended=["network","genesisHash","wallet","tokenAccount"];
const valid=v=>typeof v==="string"&&v.length>0&&v.length<=256&&v.trim()===v;

/** Detect contradictory declared labels even when raw receipts are unavailable.
 * Missing optional labels are not inferred or independently authenticated. */
export function assertHistoricalReportScope(input){
 const s=input.scope;
 const rows=[s,...[input.cash,input.inventory,input.creator,input.nav,input.market].map(x=>x.scope),
  input.inventory.opening.scope,input.inventory.closing.scope,input.inventory.tradeSummary.scope,
  ...input.inventory.adjustments.map(a=>a.scope),
  ...input.cash.entries,...input.creator.entries,...input.nav.snapshots,...input.market.trades,
  input.market.snapshot,...(input.market.candleEvidence?[input.market.candleEvidence.scope]:[])];
 const declared=new Map();
 for(const row of rows){
  if(!row)continue;
  for(const k of [...core,...extended]){
   if(!Object.hasOwn(row,k))continue;
   const v=row[k];
   if(!valid(v)||declared.has(k)&&declared.get(k)!==v)throw Error("HISTORICAL_REPORT_SCOPE_MISMATCH:"+k);
   declared.set(k,v);
  }
 }
 if(input.sourceMode==="SYNTHETIC"&&declared.has("network")&&declared.get("network")!=="synthetic")throw Error("HISTORICAL_REPORT_SCOPE_MISMATCH:network");
 return {source_attestation:"UNKNOWN",identity_complete:core.concat(["network","genesisHash"]).every(k=>valid(s[k]))};
}

/** A single presentation contract, not a live state, quote engine, or execution gate. */
export function describeHistoricalMarket({input,market,candles}){
 const scope=input.scope;
 const identity=assertHistoricalReportScope(input);
 const sample=input.sourceMode==="SYNTHETIC";
 const review=!market.history_complete||candles.status==="REVIEW";
 const status=review?"REVIEW_REQUIRED":sample?"SYNTHETIC_ONLY":"PROVISIONAL";
 const snap=input.market.snapshot;
 const reserveFields={real_quote_reserves_base_units:"realQuoteReservesBaseUnits",virtual_quote_reserves_base_units:"virtualQuoteReservesBaseUnits",real_token_reserves_base_units:"realTokenReservesBaseUnits",virtual_token_reserves_base_units:"virtualTokenReservesBaseUnits"};
 return {schema_version:"cook-historical-market-state.1",scope:{project_id:scope.projectId,token_mint:scope.tokenMint,quote_asset:scope.quoteAsset,network:scope.network??(sample?"synthetic":null),genesis_hash:scope.genesisHash??null,opening_cutoff:scope.openingCutoff,closing_cutoff:scope.closingCutoff},
  source_mode:input.sourceMode,status,identity_complete:identity.identity_complete,
  source_attestation:"UNKNOWN",history_complete_attested:false,declared_history_complete:market.history_complete,
  snapshot:{status:review?"REVIEW_REQUIRED":status,lifecycle:review?null:snap.lifecycle,...Object.fromEntries(Object.entries(reserveFields).map(([k,v])=>[k,review?null:snap[v]??null]))},
  observations:{status:review?"REVIEW_REQUIRED":status,observed_buy_count:market.buy_trade_count,observed_sell_count:market.sell_trade_count,observed_buy_notional_base_units:market.buy_notional_base_units,observed_sell_notional_base_units:market.sell_notional_base_units},
  candle_evidence_status:candles.status,live_state:false,execution_enabled:false};
}
