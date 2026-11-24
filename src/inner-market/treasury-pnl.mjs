import { parseBaseUnits } from "../core/integer.mjs";

const BUY_KINDS = new Set(["CURVE_BUY_EXECUTED"]);
const SELL_KINDS = new Set(["CURVE_SELL_EXECUTED"]);

function compareOptionalInteger(a, b) {
  if (a === undefined || a === null) return b === undefined || b === null ? 0 : -1;
  if (b === undefined || b === null) return 1;
  const left = BigInt(a);
  const right = BigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function orderEvents(events) {
  return events.slice().sort((a, b) =>
    compareOptionalInteger(a.slot, b.slot) ||
    compareOptionalInteger(a.transaction_index, b.transaction_index) ||
    compareOptionalInteger(a.instruction_index, b.instruction_index) ||
    String(a.event_id || "").localeCompare(String(b.event_id || ""))
  );
}

/**
 * Replays confirmed bonding-curve trades for one treasury account using weighted-average cost.
 * quote_amount_base_units is gross trade consideration before fee_quote_base_units.
 * Transfers and non-trade events are not PnL events; reconcile them using account snapshots.
 */
export function replayTreasuryTradePnl({
  openingTokenBalanceBaseUnits = "0",
  openingCostBasisQuoteBaseUnits = "0",
  events,
  endingTokenBalanceSnapshotBaseUnits = null,
  currentMarkPriceQuoteScaled = null,
  tokenDecimals = 0,
  quoteDecimals = 0,
}) {
  if (!Array.isArray(events)) throw new TypeError("events must be an array");
  if (!Number.isSafeInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 18) throw new RangeError("tokenDecimals must be from 0 to 18");
  if (!Number.isSafeInteger(quoteDecimals) || quoteDecimals < 0 || quoteDecimals > 18) throw new RangeError("quoteDecimals must be from 0 to 18");
  let tokenBalance = parseBaseUnits(openingTokenBalanceBaseUnits, { name: "openingTokenBalanceBaseUnits" });
  let costBasis = parseBaseUnits(openingCostBasisQuoteBaseUnits, { name: "openingCostBasisQuoteBaseUnits" });
  let realizedPnl = 0n;
  let buyCost = 0n;
  let sellProceeds = 0n;
  let confirmedBuyCount = 0;
  let confirmedSellCount = 0;
  let ignoredUnconfirmedCount = 0;
  let ignoredNonTradeCount = 0;
  const seenEventIds = new Set();

  for (const event of orderEvents(events)) {
    if (event.event_id) {
      if (seenEventIds.has(event.event_id)) throw new Error("duplicate event_id: " + event.event_id);
      seenEventIds.add(event.event_id);
    }
    if (event.status !== "CONFIRMED") {
      ignoredUnconfirmedCount += 1;
      continue;
    }
    if (!BUY_KINDS.has(event.event_kind) && !SELL_KINDS.has(event.event_kind)) {
      ignoredNonTradeCount += 1;
      continue;
    }
    const tokenAmount = parseBaseUnits(event.token_amount_base_units, { name: "token_amount_base_units" });
    const quoteAmount = parseBaseUnits(event.quote_amount_base_units, { name: "quote_amount_base_units" });
    const fee = parseBaseUnits(event.fee_quote_base_units || "0", { name: "fee_quote_base_units" });
    if (tokenAmount === 0n || quoteAmount === 0n) throw new RangeError("confirmed trade amounts must be positive");

    if (BUY_KINDS.has(event.event_kind)) {
      const totalCost = quoteAmount + fee;
      tokenBalance += tokenAmount;
      costBasis += totalCost;
      buyCost += totalCost;
      confirmedBuyCount += 1;
    } else {
      if (tokenAmount > tokenBalance) throw new RangeError("confirmed sell exceeds treasury token inventory");
      if (fee > quoteAmount) throw new RangeError("sell fee exceeds gross quote proceeds");
      const allocatedCost = tokenAmount === tokenBalance ? costBasis : (costBasis * tokenAmount) / tokenBalance;
      const netProceeds = quoteAmount - fee;
      realizedPnl += netProceeds - allocatedCost;
      tokenBalance -= tokenAmount;
      costBasis -= allocatedCost;
      sellProceeds += netProceeds;
      confirmedSellCount += 1;
    }
  }

  let inventoryReconciliation = "NOT_PROVIDED";
  if (endingTokenBalanceSnapshotBaseUnits !== null) {
    const snapshot = parseBaseUnits(endingTokenBalanceSnapshotBaseUnits, { name: "endingTokenBalanceSnapshotBaseUnits" });
    inventoryReconciliation = snapshot === tokenBalance ? "MATCH" : "MISMATCH";
  }

  let markToMarketQuoteBaseUnits = null;
  let unrealizedPnlQuoteBaseUnits = null;
  if (currentMarkPriceQuoteScaled !== null) {
    const markPriceScaled = parseBaseUnits(currentMarkPriceQuoteScaled, { name: "currentMarkPriceQuoteScaled" });
    const tokenScale = 10n ** BigInt(tokenDecimals);
    const quoteScale = 10n ** BigInt(quoteDecimals);
    const displayScale = 10n ** 12n;
    markToMarketQuoteBaseUnits = (tokenBalance * markPriceScaled * quoteScale) / (tokenScale * displayScale);
    unrealizedPnlQuoteBaseUnits = markToMarketQuoteBaseUnits - costBasis;
  }

  return {
    accounting_method: "WEIGHTED_AVERAGE_COST",
    confirmed_buy_count: confirmedBuyCount,
    confirmed_sell_count: confirmedSellCount,
    ignored_unconfirmed_count: ignoredUnconfirmedCount,
    ignored_non_trade_event_count: ignoredNonTradeCount,
    ending_token_balance_base_units: tokenBalance.toString(),
    remaining_cost_basis_quote_base_units: costBasis.toString(),
    total_buy_cost_quote_base_units: buyCost.toString(),
    total_net_sell_proceeds_quote_base_units: sellProceeds.toString(),
    realized_pnl_quote_base_units: realizedPnl.toString(),
    mark_to_market_quote_base_units: markToMarketQuoteBaseUnits === null ? null : markToMarketQuoteBaseUnits.toString(),
    unrealized_pnl_quote_base_units: unrealizedPnlQuoteBaseUnits === null ? null : unrealizedPnlQuoteBaseUnits.toString(),
    inventory_reconciliation: inventoryReconciliation,
    warning: "Transfers, allocations, burns, and fee sweeps are not trades. Reconcile ending inventory against an authoritative account snapshot.",
  };
}