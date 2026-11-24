import { parseBaseUnits, U128_MAX } from "../core/integer.mjs";
import { calculateCurveValuation } from "./curve-valuation.mjs";

const BPS = 10_000n;
const RATIO_SCALE = 1_000_000n;

function signedString(value) {
  return value < 0n ? `-${(-value).toString()}` : value.toString();
}

function formatRatio6(value) {
  const whole = value / RATIO_SCALE;
  const fraction = (value % RATIO_SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

function bps(part, total) {
  return total === 0n ? null : ((part * BPS) / total).toString();
}

/**
 * Produces a read-only economics snapshot from the repository's replayed Pump curve state.
 * Supply denominators and decimals are explicit; no execution plan or target-price sizing is generated.
 */
export function buildCurveEconomicsReport({
  curveState,
  tokenDecimals,
  quoteDecimals,
  circulatingSupplyBaseUnits,
  treasuryTokenBalanceBaseUnits = "0",
  initialRealTokenReservesBaseUnits = null,
  quoteUsdPrice = null,
}) {
  if (!curveState || typeof curveState !== "object") throw new TypeError("curveState is required");
  if (typeof curveState.complete !== "boolean") throw new TypeError("curveState.complete must be a boolean");
  const lifecycle = curveState.lifecycle;
  if (!["bonding_curve", "complete_pending_migration", "graduated"].includes(lifecycle)) {
    throw new TypeError("curveState.lifecycle is unsupported");
  }

  const totalSupply = parseBaseUnits(curveState.token_total_supply_base_units, { name: "token_total_supply_base_units" });
  const realToken = parseBaseUnits(curveState.real_token_reserves_base_units, { name: "real_token_reserves_base_units" });
  const realQuote = parseBaseUnits(curveState.real_quote_reserves_base_units, { name: "real_quote_reserves_base_units" });
  const protocolFees = parseBaseUnits(curveState.protocol_fees_base_units ?? "0", { name: "protocol_fees_base_units" });
  const creatorFees = parseBaseUnits(curveState.creator_fees_base_units ?? "0", { name: "creator_fees_base_units" });
  const buyQuote = parseBaseUnits(curveState.curve_buy_quote_volume_base_units ?? "0", { name: "curve_buy_quote_volume_base_units", max: U128_MAX });
  const sellQuote = parseBaseUnits(curveState.curve_sell_quote_volume_base_units ?? "0", { name: "curve_sell_quote_volume_base_units", max: U128_MAX });
  const tokenVolume = parseBaseUnits(curveState.curve_token_volume_base_units ?? "0", { name: "curve_token_volume_base_units", max: U128_MAX });
  if (realToken > totalSupply) throw new RangeError("real curve token inventory cannot exceed total token supply");

  const grossTurnover = buyQuote + sellQuote;
  if (grossTurnover > U128_MAX) throw new RangeError("gross quote turnover exceeds U128");
  const netQuoteFlow = buyQuote - sellQuote;
  const totalFees = protocolFees + creatorFees;
  const valuation = calculateCurveValuation({
    virtualTokenReservesBaseUnits: curveState.virtual_token_reserves_base_units,
    virtualQuoteReservesBaseUnits: curveState.virtual_quote_reserves_base_units,
    realTokenReservesBaseUnits: curveState.real_token_reserves_base_units,
    realQuoteReservesBaseUnits: curveState.real_quote_reserves_base_units,
    tokenDecimals,
    quoteDecimals,
    circulatingSupplyBaseUnits,
    totalSupplyBaseUnits: curveState.token_total_supply_base_units,
    treasuryTokenBalanceBaseUnits,
    quoteUsdPrice,
  });

  let inventoryDepletionBps = null;
  if (initialRealTokenReservesBaseUnits !== null) {
    const initialRealToken = parseBaseUnits(initialRealTokenReservesBaseUnits, { name: "initialRealTokenReservesBaseUnits" });
    if (initialRealToken === 0n) throw new RangeError("initialRealTokenReservesBaseUnits must be positive");
    const delta = initialRealToken - realToken;
    const magnitude = (delta < 0n ? -delta : delta) * BPS / initialRealToken;
    inventoryDepletionBps = signedString(delta < 0n ? -magnitude : magnitude);
  }

  const lifecycleConsistent = curveState.complete
    ? lifecycle !== "bonding_curve"
    : lifecycle === "bonding_curve";

  return {
    schema_version: "1.0.0",
    report_kind: "PUMP_INNER_CURVE_ECONOMICS",
    market: curveState.market ?? null,
    lifecycle,
    curve_complete: curveState.complete,
    lifecycle_consistent: lifecycleConsistent,
    as_of_event_id: curveState.as_of_event_id ?? null,
    valuation,
    reserves: {
      virtual_token_base_units: curveState.virtual_token_reserves_base_units,
      virtual_quote_base_units: curveState.virtual_quote_reserves_base_units,
      real_curve_token_inventory_base_units: realToken.toString(),
      program_reported_real_quote_reserve_base_units: realQuote.toString(),
      protocol_fee_balance_base_units: protocolFees.toString(),
      creator_fee_balance_base_units: creatorFees.toString(),
      total_fee_balance_base_units: totalFees.toString(),
    },
    supply: {
      total_supply_base_units: totalSupply.toString(),
      circulating_supply_base_units: valuation.supply.circulating_base_units,
      treasury_token_balance_base_units: valuation.supply.treasury_base_units,
      curve_inventory_share_of_total_supply_bps: bps(realToken, totalSupply),
      curve_inventory_depletion_from_initial_bps: inventoryDepletionBps,
    },
    activity: {
      confirmed_curve_buy_quote_volume_base_units: buyQuote.toString(),
      confirmed_curve_sell_quote_volume_base_units: sellQuote.toString(),
      gross_quote_turnover_base_units: grossTurnover.toString(),
      net_buy_minus_sell_quote_flow_base_units: signedString(netQuoteFlow),
      buy_quote_share_of_turnover_bps: bps(buyQuote, grossTurnover),
      sell_quote_share_of_turnover_bps: bps(sellQuote, grossTurnover),
      curve_token_turnover_base_units: tokenVolume.toString(),
      execution_count: curveState.execution_count ?? 0,
    },
    warnings: [
      "Gross turnover is not net cash inflow or issuer revenue.",
      "Virtual reserves determine curve pricing and are not withdrawable balances.",
      "Program-reported real quote reserves are not automatically equivalent to withdrawable treasury funds.",
      "Treasury mark-to-market is not realizable sale proceeds.",
      ...(lifecycleConsistent ? [] : ["Curve completion flag and lifecycle disagree; pause interpretation and reconcile state."]),
    ],
  };
}