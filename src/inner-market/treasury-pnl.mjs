import { parseBaseUnits, U128_MAX } from "../core/integer.mjs";
import { sortForReplay } from "../core/event-order.mjs";

const BUY_KINDS = new Set(["CURVE_BUY_EXECUTED"]);
const SELL_KINDS = new Set(["CURVE_SELL_EXECUTED"]);
const DISPLAY_SCALE_DIGITS = 12;
const DISPLAY_SCALE = 10n ** BigInt(DISPLAY_SCALE_DIGITS);

function formatScaled(value) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / DISPLAY_SCALE;
  const fraction = (absolute % DISPLAY_SCALE).toString().padStart(DISPLAY_SCALE_DIGITS, "0").replace(/0+$/, "");
  return (negative ? "-" : "") + whole.toString() + (fraction ? "." + fraction : "");
}

function averageCostPriceScaled(costBasis, tokenBalance, tokenDecimals, quoteDecimals) {
  if (tokenBalance === 0n) return null;
  const tokenScale = 10n ** BigInt(tokenDecimals);
  const quoteScale = 10n ** BigInt(quoteDecimals);
  return (costBasis * tokenScale * DISPLAY_SCALE) / (tokenBalance * quoteScale);
}

/**
 * Replays confirmed bonding-curve trades for one treasury account using weighted-average cost.
 * Every confirmed buy is an additional acquisition tranche; every sell removes proportional cost basis.
 * quote_amount_base_units is gross trade consideration before fee_quote_base_units.
 * Transfers and non-trade events are not PnL events; reconcile them using account snapshots and explicit basis adjustments.
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
  let costBasis = parseBaseUnits(openingCostBasisQuoteBaseUnits, { name: "openingCostBasisQuoteBaseUnits", max: U128_MAX });
  if (tokenBalance === 0n && costBasis !== 0n) throw new RangeError("opening cost basis cannot exist without opening token inventory");
  let realizedPnl = 0n;
  let buyCost = 0n;
  let grossBuyQuote = 0n;
  let grossSellQuote = 0n;
  let sellProceeds = 0n;
  let boughtTokens = 0n;
  let soldTokens = 0n;
  let totalFees = 0n;
  let confirmedBuyCount = 0;
  let confirmedSellCount = 0;
  let ignoredUnconfirmedCount = 0;
  let ignoredNonTradeCount = 0;
  const positionJournal = [];

  for (const event of sortForReplay(events)) {
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
    totalFees += fee;

    if (BUY_KINDS.has(event.event_kind)) {
      const totalCost = quoteAmount + fee;
      tokenBalance += tokenAmount;
      costBasis += totalCost;
      buyCost += totalCost;
      grossBuyQuote += quoteAmount;
      boughtTokens += tokenAmount;
      confirmedBuyCount += 1;
      positionJournal.push({
        event_id: event.event_id,
        event_time_ms: event.event_time_ms ?? null,
        side: "BUY",
        token_amount_base_units: tokenAmount.toString(),
        gross_quote_amount_base_units: quoteAmount.toString(),
        fee_quote_base_units: fee.toString(),
        cash_cost_quote_base_units: totalCost.toString(),
        allocated_cost_basis_quote_base_units: null,
        net_quote_proceeds_base_units: null,
        realized_pnl_quote_base_units: null,
        position_token_balance_after_base_units: tokenBalance.toString(),
        remaining_cost_basis_after_quote_base_units: costBasis.toString(),
        average_cost_quote_per_token_after: formatScaled(averageCostPriceScaled(costBasis, tokenBalance, tokenDecimals, quoteDecimals)),
      });
    } else {
      if (tokenAmount > tokenBalance) throw new RangeError("confirmed sell exceeds treasury token inventory");
      if (fee > quoteAmount) throw new RangeError("sell fee exceeds gross quote proceeds");
      const allocatedCost = tokenAmount === tokenBalance ? costBasis : (costBasis * tokenAmount) / tokenBalance;
      const netProceeds = quoteAmount - fee;
      const eventRealizedPnl = netProceeds - allocatedCost;
      realizedPnl += eventRealizedPnl;
      tokenBalance -= tokenAmount;
      costBasis -= allocatedCost;
      sellProceeds += netProceeds;
      grossSellQuote += quoteAmount;
      soldTokens += tokenAmount;
      confirmedSellCount += 1;
      positionJournal.push({
        event_id: event.event_id,
        event_time_ms: event.event_time_ms ?? null,
        side: "SELL",
        token_amount_base_units: tokenAmount.toString(),
        gross_quote_amount_base_units: quoteAmount.toString(),
        fee_quote_base_units: fee.toString(),
        cash_cost_quote_base_units: null,
        allocated_cost_basis_quote_base_units: allocatedCost.toString(),
        net_quote_proceeds_base_units: netProceeds.toString(),
        realized_pnl_quote_base_units: eventRealizedPnl.toString(),
        position_token_balance_after_base_units: tokenBalance.toString(),
        remaining_cost_basis_after_quote_base_units: costBasis.toString(),
        average_cost_quote_per_token_after: tokenBalance === 0n ? null : formatScaled(averageCostPriceScaled(costBasis, tokenBalance, tokenDecimals, quoteDecimals)),
      });
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
    const markPriceScaled = parseBaseUnits(currentMarkPriceQuoteScaled, { name: "currentMarkPriceQuoteScaled", max: U128_MAX });
    const tokenScale = 10n ** BigInt(tokenDecimals);
    const quoteScale = 10n ** BigInt(quoteDecimals);
    markToMarketQuoteBaseUnits = (tokenBalance * markPriceScaled * quoteScale) / (tokenScale * DISPLAY_SCALE);
    unrealizedPnlQuoteBaseUnits = markToMarketQuoteBaseUnits - costBasis;
  }

  const averageCostScaled = averageCostPriceScaled(costBasis, tokenBalance, tokenDecimals, quoteDecimals);
  const netCashDeployed = buyCost - sellProceeds;
  return {
    accounting_method: "WEIGHTED_AVERAGE_COST",
    confirmed_buy_count: confirmedBuyCount,
    confirmed_sell_count: confirmedSellCount,
    ignored_unconfirmed_count: ignoredUnconfirmedCount,
    ignored_non_trade_event_count: ignoredNonTradeCount,
    position: {
      ending_token_balance_base_units: tokenBalance.toString(),
      remaining_cost_basis_quote_base_units: costBasis.toString(),
      average_cost_quote_per_token: averageCostScaled === null ? null : formatScaled(averageCostScaled),
      total_bought_token_amount_base_units: boughtTokens.toString(),
      total_sold_token_amount_base_units: soldTokens.toString(),
    },
    cash_flow: {
      total_gross_buy_quote_base_units: grossBuyQuote.toString(),
      total_buy_cost_including_fees_quote_base_units: buyCost.toString(),
      total_gross_sell_quote_base_units: grossSellQuote.toString(),
      total_net_sell_proceeds_quote_base_units: sellProceeds.toString(),
      total_trade_fees_quote_base_units: totalFees.toString(),
      net_cash_deployed_quote_base_units: netCashDeployed.toString(),
    },
    realized_pnl_quote_base_units: realizedPnl.toString(),
    mark_to_market_quote_base_units: markToMarketQuoteBaseUnits === null ? null : markToMarketQuoteBaseUnits.toString(),
    unrealized_pnl_quote_base_units: unrealizedPnlQuoteBaseUnits === null ? null : unrealizedPnlQuoteBaseUnits.toString(),
    total_pnl_quote_base_units: markToMarketQuoteBaseUnits === null ? null : (realizedPnl + unrealizedPnlQuoteBaseUnits).toString(),
    inventory_reconciliation: inventoryReconciliation,
    position_journal: positionJournal,
    warning: "Transfers, allocations, burns, and fee sweeps are not trades. Reconcile ending inventory against an authoritative account snapshot; mark-to-market is not realizable sale proceeds.",
  };
}