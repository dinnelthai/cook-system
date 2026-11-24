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

function payloadOf(event) {
  return event.payload && typeof event.payload === "object" ? event.payload : event;
}

function isConfirmedTrade(event) {
  if (event.provenance === "observed_chain") {
    return event.status === "CONFIRMED" &&
      event.quality?.transaction_reconciliation?.status === "PASS";
  }
  return event.status === "CONFIRMED";
}

function reportedProgramFees(payload) {
  let total = 0n;
  for (const item of payload.fee_components ?? []) {
    // protocol_retained and buyback_paid_immediately are breakdowns of protocol_charged;
    // do not add them a second time.
    if (item.fee_type === "protocol_charged" || item.fee_type === "creator") {
      total += parseBaseUnits(item.amount_base_units, { name: "fee_components.amount_base_units" });
    }
  }
  return total;
}

function networkFeeForEvent(event, payload, treasuryWallets, processedSignatures) {
  const costs = payload.transaction_costs ?? event.transaction_costs ?? null;
  if (!costs) return { amount: 0n, signature: null, feePayer: null };
  const signature = costs.signature ?? event.source?.signature ?? payload.signature ?? null;
  if (signature && processedSignatures.has(signature)) {
    return { amount: 0n, signature, feePayer: costs.fee_payer_address ?? null };
  }
  if (signature) processedSignatures.add(signature);
  const actor = payload.actor_address ?? event.actor_address ?? null;
  const feePayer = costs.fee_payer_address ?? null;
  const isTreasuryFeePayer = feePayer && (
    treasuryWallets.size > 0 ? treasuryWallets.has(feePayer) : feePayer === actor
  );
  return {
    amount: isTreasuryFeePayer
      ? parseBaseUnits(costs.fee_lamports ?? "0", { name: "transaction_costs.fee_lamports" })
      : 0n,
    signature,
    feePayer,
  };
}

/**
 * Replays confirmed Pump bonding-curve trades for Treasury wallets using weighted-average cost.
 *
 * Observed-chain events are counted only after transaction balance reconciliation passes.
 * Their quote_amount_base_units is the actor's reconciled quote cash movement (program fees are
 * already reflected in that amount), so fee_components are reported for transparency but are
 * not added to or subtracted from cash flow a second time. Network transaction fees are separate
 * and are charged once per signature when a Treasury wallet paid them.
 *
 * Synthetic fixtures may continue to express quote as gross consideration plus a separate
 * fee_quote_base_units. Transfers and non-trade events are not PnL events.
 */
export function replayTreasuryTradePnl({
  openingTokenBalanceBaseUnits = "0",
  openingCostBasisQuoteBaseUnits = null,
  events,
  treasuryWalletAddresses = [],
  endingTokenBalanceSnapshotBaseUnits = null,
  currentMarkPriceQuoteScaled = null,
  currentLiquidationQuoteBaseUnits = null,
  tokenDecimals = 0,
  quoteDecimals = 0,
}) {
  if (!Array.isArray(events)) throw new TypeError("events must be an array");
  if (!Array.isArray(treasuryWalletAddresses) && !(treasuryWalletAddresses instanceof Set)) {
    throw new TypeError("treasuryWalletAddresses must be an array or Set");
  }
  if (!Number.isSafeInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 18) throw new RangeError("tokenDecimals must be from 0 to 18");
  if (!Number.isSafeInteger(quoteDecimals) || quoteDecimals < 0 || quoteDecimals > 18) throw new RangeError("quoteDecimals must be from 0 to 18");

  let tokenBalance = parseBaseUnits(openingTokenBalanceBaseUnits, { name: "openingTokenBalanceBaseUnits" });
  const openingBasisKnown = openingCostBasisQuoteBaseUnits !== null;
  let costBasis = openingBasisKnown
    ? parseBaseUnits(openingCostBasisQuoteBaseUnits, { name: "openingCostBasisQuoteBaseUnits", max: U128_MAX })
    : 0n;
  if (tokenBalance === 0n && costBasis !== 0n) throw new RangeError("opening cost basis cannot exist without opening token inventory");
  let costBasisComplete = tokenBalance === 0n || openingBasisKnown;
  let realizedPnlComplete = true;

  const treasuryWallets = new Set(treasuryWalletAddresses);
  const candidateEvents = [];
  let ignoredUnconfirmedCount = 0;
  let ignoredNonTradeCount = 0;
  let ignoredNonTreasuryCount = 0;

  for (const event of events) {
    if (!BUY_KINDS.has(event.event_kind) && !SELL_KINDS.has(event.event_kind)) {
      ignoredNonTradeCount += 1;
      continue;
    }
    if (!isConfirmedTrade(event)) {
      ignoredUnconfirmedCount += 1;
      continue;
    }
    const payload = payloadOf(event);
    const actor = payload.actor_address ?? event.actor_address ?? null;
    if (treasuryWallets.size > 0 && (!actor || !treasuryWallets.has(actor))) {
      ignoredNonTreasuryCount += 1;
      continue;
    }
    candidateEvents.push(event);
  }

  let realizedPnl = 0n;
  let buyCost = 0n;
  let grossBuyQuote = 0n;
  let grossSellQuote = 0n;
  let sellProceeds = 0n;
  let boughtTokens = 0n;
  let soldTokens = 0n;
  let syntheticTradeFees = 0n;
  let reportedProgramFeeTotal = 0n;
  let networkFees = 0n;
  let confirmedBuyCount = 0;
  let confirmedSellCount = 0;
  const processedFeeSignatures = new Set();
  const positionJournal = [];

  for (const event of sortForReplay(candidateEvents)) {
    const payload = payloadOf(event);
    const tokenAmount = parseBaseUnits(payload.token_amount_base_units, { name: "token_amount_base_units" });
    const quoteAmount = parseBaseUnits(payload.quote_amount_base_units, { name: "quote_amount_base_units" });
    if (tokenAmount === 0n || quoteAmount === 0n) throw new RangeError("confirmed trade amounts must be positive");

    // Normalized observed-chain quote amounts are reconciled against wallet cash deltas and
    // already include Pump protocol/creator fees. Synthetic events use an explicit fee field.
    const tradeFee = event.provenance === "observed_chain"
      ? 0n
      : parseBaseUnits(payload.fee_quote_base_units || "0", { name: "fee_quote_base_units" });
    const reportedFees = event.provenance === "observed_chain" ? reportedProgramFees(payload) : 0n;
    const networkFee = networkFeeForEvent(event, payload, treasuryWallets, processedFeeSignatures);
    syntheticTradeFees += tradeFee;
    reportedProgramFeeTotal += reportedFees;
    networkFees += networkFee.amount;

    if (BUY_KINDS.has(event.event_kind)) {
      const totalCost = quoteAmount + tradeFee + networkFee.amount;
      tokenBalance += tokenAmount;
      costBasis += totalCost;
      buyCost += totalCost;
      grossBuyQuote += quoteAmount;
      boughtTokens += tokenAmount;
      confirmedBuyCount += 1;
      positionJournal.push({
        event_id: event.event_id,
        signature: event.source?.signature ?? payload.signature ?? null,
        actor_address: payload.actor_address ?? event.actor_address ?? null,
        event_time_ms: event.event_time_ms ?? null,
        side: "BUY",
        token_amount_base_units: tokenAmount.toString(),
        quote_cash_movement_base_units: quoteAmount.toString(),
        trade_fee_cash_add_on_base_units: tradeFee.toString(),
        reported_program_fee_components: payload.fee_components ?? [],
        network_fee_base_units: networkFee.amount.toString(),
        cash_cost_quote_base_units: totalCost.toString(),
        allocated_cost_basis_quote_base_units: null,
        net_quote_proceeds_base_units: null,
        realized_pnl_quote_base_units: null,
        position_token_balance_after_base_units: tokenBalance.toString(),
        remaining_cost_basis_after_quote_base_units: costBasis.toString(),
        average_cost_quote_per_token_after: costBasisComplete ? formatScaled(averageCostPriceScaled(costBasis, tokenBalance, tokenDecimals, quoteDecimals)) : null,
        cost_basis_complete_after: costBasisComplete,
      });
    } else {
      if (tokenAmount > tokenBalance) throw new RangeError("confirmed sell exceeds treasury token inventory");
      const totalSellFees = tradeFee + networkFee.amount;
      if (totalSellFees > quoteAmount) throw new RangeError("sell fees exceed quote proceeds");
      const allocatedKnownCost = tokenAmount === tokenBalance ? costBasis : (costBasis * tokenAmount) / tokenBalance;
      const netProceeds = quoteAmount - totalSellFees;
      const eventRealizedPnl = costBasisComplete ? netProceeds - allocatedKnownCost : null;
      if (eventRealizedPnl === null) realizedPnlComplete = false;
      else realizedPnl += eventRealizedPnl;
      tokenBalance -= tokenAmount;
      costBasis -= allocatedKnownCost;
      if (tokenBalance === 0n) costBasisComplete = true;
      sellProceeds += netProceeds;
      grossSellQuote += quoteAmount;
      soldTokens += tokenAmount;
      confirmedSellCount += 1;
      positionJournal.push({
        event_id: event.event_id,
        signature: event.source?.signature ?? payload.signature ?? null,
        actor_address: payload.actor_address ?? event.actor_address ?? null,
        event_time_ms: event.event_time_ms ?? null,
        side: "SELL",
        token_amount_base_units: tokenAmount.toString(),
        quote_cash_movement_base_units: quoteAmount.toString(),
        trade_fee_cash_add_on_base_units: tradeFee.toString(),
        reported_program_fee_components: payload.fee_components ?? [],
        network_fee_base_units: networkFee.amount.toString(),
        cash_cost_quote_base_units: null,
        allocated_cost_basis_quote_base_units: costBasisComplete || tokenBalance === 0n ? allocatedKnownCost.toString() : null,
        known_allocated_cost_basis_quote_base_units: allocatedKnownCost.toString(),
        net_quote_proceeds_base_units: netProceeds.toString(),
        realized_pnl_quote_base_units: eventRealizedPnl === null ? null : eventRealizedPnl.toString(),
        position_token_balance_after_base_units: tokenBalance.toString(),
        remaining_cost_basis_after_quote_base_units: costBasis.toString(),
        average_cost_quote_per_token_after: tokenBalance === 0n || !costBasisComplete ? null : formatScaled(averageCostPriceScaled(costBasis, tokenBalance, tokenDecimals, quoteDecimals)),
        cost_basis_complete_after: costBasisComplete,
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
    unrealizedPnlQuoteBaseUnits = costBasisComplete ? markToMarketQuoteBaseUnits - costBasis : null;
  }

  const liquidationValue = currentLiquidationQuoteBaseUnits === null
    ? null
    : parseBaseUnits(currentLiquidationQuoteBaseUnits, { name: "currentLiquidationQuoteBaseUnits" });
  const unrealizedPnlOnLiquidation = liquidationValue === null || !costBasisComplete ? null : liquidationValue - costBasis;
  const averageCostScaled = costBasisComplete ? averageCostPriceScaled(costBasis, tokenBalance, tokenDecimals, quoteDecimals) : null;
  const netCashDeployed = buyCost - sellProceeds;

  return {
    accounting_method: "WEIGHTED_AVERAGE_COST",
    quote_cash_basis: "OBSERVED_CHAIN_QUOTE_AMOUNT_IS_RECONCILED_ACTOR_CASH_MOVEMENT",
    confirmed_buy_count: confirmedBuyCount,
    confirmed_sell_count: confirmedSellCount,
    ignored_unconfirmed_count: ignoredUnconfirmedCount,
    ignored_non_trade_event_count: ignoredNonTradeCount,
    ignored_non_treasury_event_count: ignoredNonTreasuryCount,
    ending_token_balance_base_units: tokenBalance.toString(),
    remaining_cost_basis_quote_base_units: costBasis.toString(),
    cost_basis_complete: costBasisComplete,
    realized_pnl_complete: realizedPnlComplete,
    total_buy_cost_quote_base_units: buyCost.toString(),
    total_net_sell_proceeds_quote_base_units: sellProceeds.toString(),
    position: {
      ending_token_balance_base_units: tokenBalance.toString(),
      remaining_cost_basis_quote_base_units: costBasis.toString(),
      cost_basis_complete: costBasisComplete,
      average_cost_quote_per_token: averageCostScaled === null ? null : formatScaled(averageCostScaled),
      total_bought_token_amount_base_units: boughtTokens.toString(),
      total_sold_token_amount_base_units: soldTokens.toString(),
    },
    cash_flow: {
      total_gross_buy_quote_base_units: grossBuyQuote.toString(),
      total_buy_cost_including_fees_quote_base_units: buyCost.toString(),
      total_gross_sell_quote_base_units: grossSellQuote.toString(),
      total_net_sell_proceeds_quote_base_units: sellProceeds.toString(),
      total_synthetic_trade_fee_cash_add_on_quote_base_units: syntheticTradeFees.toString(),
      total_reported_program_fees_already_in_quote_cash_movement_base_units: reportedProgramFeeTotal.toString(),
      total_network_transaction_fees_quote_base_units: networkFees.toString(),
      net_cash_deployed_quote_base_units: netCashDeployed.toString(),
    },
    realized_pnl_quote_base_units: realizedPnlComplete ? realizedPnl.toString() : null,
    realized_pnl_known_partial_base_units: realizedPnl.toString(),
    realized_pnl_complete: realizedPnlComplete,
    mark_to_market_quote_base_units: markToMarketQuoteBaseUnits === null ? null : markToMarketQuoteBaseUnits.toString(),
    unrealized_pnl_quote_base_units: unrealizedPnlQuoteBaseUnits === null ? null : unrealizedPnlQuoteBaseUnits.toString(),
    estimated_liquidation_proceeds_quote_base_units: liquidationValue === null ? null : liquidationValue.toString(),
    unrealized_pnl_on_liquidation_quote_base_units: unrealizedPnlOnLiquidation === null ? null : unrealizedPnlOnLiquidation.toString(),
    total_pnl_on_liquidation_quote_base_units: unrealizedPnlOnLiquidation === null || !realizedPnlComplete ? null : (realizedPnl + unrealizedPnlOnLiquidation).toString(),
    inventory_reconciliation: inventoryReconciliation,
    position_journal: positionJournal,
    warning: "Transfers, allocations, burns, and fee sweeps are not trades. Reconcile ending inventory against an authoritative account snapshot. If opening inventory has no supplied cost basis, average cost and affected PnL remain incomplete rather than being reported as zero-cost profit. Marginal mark-to-market is not realizable proceeds; liquidation quote is an estimate and not an execution guarantee.",
  };
}
