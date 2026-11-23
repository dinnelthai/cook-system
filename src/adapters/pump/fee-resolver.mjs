import { parseBaseUnits, U64_MAX, U128_MAX } from "../../core/integer.mjs";

export const DEFAULT_PUBKEY = "11111111111111111111111111111111";
const PUMP_FEES_PROGRAM_ID = "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ";
const FEE_CONFIG_CHANGE_EVENT_NAMES = new Set([
  "InitializeFeeConfigEvent",
  "UpsertFeeTiersEvent",
  "UpdateFeeConfigEvent",
  "UpsertStableFeeTiersEvent",
  "UpdateStableFeeConfigEvent",
  "SetExoticFlatFeesEvent",
]);

export function feeConfigSnapshotRecordFromDecodedAccount({
  decodedAccount,
  ordering,
  eventId,
}) {
  if (!decodedAccount || decodedAccount.program_id !== PUMP_FEES_PROGRAM_ID) {
    throw new TypeError("a decoded Pump Fees program account is required");
  }
  if (
    !["DECODED", "PARTIAL_ACCOUNT_LAYOUT"].includes(decodedAccount.status) ||
    decodedAccount.account_name !== "FeeConfig"
  ) {
    throw new TypeError("a decoded FeeConfig account snapshot is required");
  }
  if (!decodedAccount.data || !Array.isArray(decodedAccount.data.fee_tiers)) {
    throw new TypeError("FeeConfig snapshot does not contain fee_tiers");
  }
  if (typeof eventId !== "string" || eventId.length === 0) {
    throw new TypeError("eventId is required for a fee-config snapshot");
  }
  return {
    kind: "snapshot",
    event_id: eventId,
    ordering,
    fee_config: decodedAccount.data,
    missing_fields: decodedAccount.missing_fields ?? [],
  };
}

export function feeConfigChangeRecordFromDecodedEvent({
  decodedEvent,
  ordering,
  eventId,
}) {
  if (!decodedEvent || decodedEvent.program_id !== PUMP_FEES_PROGRAM_ID) {
    throw new TypeError("a decoded Pump Fees program event is required");
  }
  if (decodedEvent.status !== "DECODED") {
    throw new TypeError("fee-config change event must be fully decoded");
  }
  if (!FEE_CONFIG_CHANGE_EVENT_NAMES.has(decodedEvent.event_name)) return null;
  if (typeof eventId !== "string" || eventId.length === 0) {
    throw new TypeError("eventId is required for a fee-config change");
  }
  return {
    kind: "change",
    event_id: eventId,
    event_name: decodedEvent.event_name,
    ordering,
  };
}

export const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

function toBigInt(value, name, max = U128_MAX) {
  let parsed;
  if (typeof value === "bigint") parsed = value;
  else if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) parsed = BigInt(value);
  else if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) parsed = BigInt(value);
  else throw new TypeError(`${name} must be an unsigned integer`);
  if (parsed < 0n || parsed > max) throw new RangeError(`${name} is outside its supported range`);
  return parsed;
}

function normalizeFeeRecord(fees) {
  if (!fees || typeof fees !== "object") throw new TypeError("fee record is required");
  const lp = toBigInt(fees.lp_fee_bps ?? fees.lpFeeBps ?? 0n, "lp_fee_bps", U64_MAX);
  const protocol = toBigInt(fees.protocol_fee_bps ?? fees.protocolFeeBps, "protocol_fee_bps", U64_MAX);
  const creator = toBigInt(fees.creator_fee_bps ?? fees.creatorFeeBps, "creator_fee_bps", U64_MAX);
  return {
    lp_fee_bps: lp,
    protocol_fee_bps: protocol,
    creator_fee_bps: creator,
    total_trade_fee_bps: protocol + creator,
  };
}

function assertSolQuoteMint(quoteMint) {
  if (quoteMint !== DEFAULT_PUBKEY && quoteMint !== WRAPPED_SOL_MINT) {
    const error = new Error(`unsupported quote mint for SOL curve fee resolver: ${quoteMint}`);
    error.code = "UNSUPPORTED_QUOTE_MINT";
    throw error;
  }
}

export function calculateBondingCurveMarketCap({
  tokenTotalSupply,
  virtualQuoteReserves,
  virtualTokenReserves,
}) {
  const supply = toBigInt(tokenTotalSupply, "tokenTotalSupply");
  const quote = toBigInt(virtualQuoteReserves, "virtualQuoteReserves");
  const token = toBigInt(virtualTokenReserves, "virtualTokenReserves");
  if (token === 0n) throw new RangeError("virtual token reserves cannot be zero");
  return (quote * supply) / token;
}

export function calculateFeeTier({ feeTiers, marketCapLamports }) {
  if (!Array.isArray(feeTiers) || feeTiers.length === 0) {
    const error = new Error("fee_tiers must contain at least one tier");
    error.code = "EMPTY_FEE_TIERS";
    throw error;
  }
  const marketCap = toBigInt(marketCapLamports, "marketCapLamports");
  const tiers = feeTiers.map((tier, index) => ({
    threshold: toBigInt(tier.market_cap_lamports_threshold ?? tier.marketCapLamportsThreshold, `fee_tiers[${index}].threshold`),
    fees: normalizeFeeRecord(tier.fees),
  }));

  for (let index = 1; index < tiers.length; index += 1) {
    if (tiers[index].threshold < tiers[index - 1].threshold) {
      const error = new Error("fee_tiers must be ordered by non-decreasing market-cap threshold");
      error.code = "INVALID_FEE_TIER_ORDER";
      throw error;
    }
  }

  const first = tiers[0];
  if (marketCap < first.threshold) {
    return { ...first.fees, selected_threshold_lamports: first.threshold };
  }
  for (let index = tiers.length - 1; index >= 0; index -= 1) {
    if (marketCap >= tiers[index].threshold) {
      return { ...tiers[index].fees, selected_threshold_lamports: tiers[index].threshold };
    }
  }
  return { ...first.fees, selected_threshold_lamports: first.threshold };
}

export function resolveBondingCurveFees({
  bondingCurve,
  feeConfig = null,
  global = null,
  feeConfigStatus = "available",
  allowGlobalFallback = true,
}) {
  if (!bondingCurve || typeof bondingCurve !== "object") {
    throw new TypeError("bondingCurve account data is required");
  }
  const quoteMint = bondingCurve.quote_mint ?? bondingCurve.quoteMint ?? DEFAULT_PUBKEY;
  assertSolQuoteMint(quoteMint);

  if (feeConfigStatus === "stale" || feeConfigStatus === "unverified") {
    const error = new Error(`fee configuration is ${feeConfigStatus}; exact historical fee resolution is unavailable`);
    error.code = "FEE_CONFIG_NOT_VERIFIED";
    throw error;
  }

  if (feeConfig) {
    const marketCap = calculateBondingCurveMarketCap({
      tokenTotalSupply: bondingCurve.token_total_supply ?? bondingCurve.tokenTotalSupply,
      virtualQuoteReserves: bondingCurve.virtual_quote_reserves ?? bondingCurve.virtual_quote_reserves_base_units ?? bondingCurve.virtual_sol_reserves ?? bondingCurve.virtualQuoteReserves,
      virtualTokenReserves: bondingCurve.virtual_token_reserves ?? bondingCurve.virtual_token_reserves_base_units ?? bondingCurve.virtualTokenReserves,
    });
    const selected = calculateFeeTier({
      feeTiers: feeConfig.fee_tiers ?? feeConfig.feeTiers,
      marketCapLamports: marketCap,
    });
    return {
      status: "RESOLVED",
      source: "pump_fee_config",
      market_cap_lamports: marketCap.toString(),
      selected_tier_threshold_lamports: selected.selected_threshold_lamports.toString(),
      lp_fee_bps: selected.lp_fee_bps.toString(),
      protocol_fee_bps: selected.protocol_fee_bps.toString(),
      creator_fee_bps: selected.creator_fee_bps.toString(),
      total_trade_fee_bps: selected.total_trade_fee_bps.toString(),
      buyback_fee_bps: null,
      quote_mint: quoteMint,
    };
  }

  if (!allowGlobalFallback || !global) {
    const error = new Error("FeeConfig is unavailable and documented Global fallback was not provided");
    error.code = "FEE_CONFIG_UNAVAILABLE";
    throw error;
  }

  const fallback = normalizeFeeRecord({
    lp_fee_bps: 0n,
    protocol_fee_bps: global.fee_basis_points ?? global.feeBasisPoints,
    creator_fee_bps: global.creator_fee_basis_points ?? global.creatorFeeBasisPoints ?? 0n,
  });
  return {
    status: "RESOLVED_WITH_FALLBACK",
    source: "pump_global",
    market_cap_lamports: null,
    selected_tier_threshold_lamports: null,
    lp_fee_bps: fallback.lp_fee_bps.toString(),
    protocol_fee_bps: fallback.protocol_fee_bps.toString(),
    creator_fee_bps: fallback.creator_fee_bps.toString(),
    total_trade_fee_bps: fallback.total_trade_fee_bps.toString(),
    buyback_fee_bps: null,
    quote_mint: quoteMint,
  };
}

function orderingTuple(ordering) {
  const fields = ["slot", "transaction_index", "instruction_index", "event_sequence"];
  for (const field of fields) {
    if (!Number.isSafeInteger(ordering?.[field]) || ordering[field] < 0) {
      throw new TypeError(`fee config ordering is missing a valid ${field}`);
    }
  }
  const inner = ordering.inner_instruction_index ?? -1;
  if (!Number.isSafeInteger(inner) || inner < -1) {
    throw new TypeError("inner_instruction_index must be a non-negative integer or null");
  }
  return [ordering.slot, ordering.transaction_index, ordering.instruction_index, inner, ordering.event_sequence];
}

function compareOrdering(a, b) {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return 0;
}

export function buildFeeConfigTimeline(records, { coverageComplete = false } = {}) {
  if (!Array.isArray(records)) throw new TypeError("fee config records must be an array");
  const prepared = records.map((record) => {
    if (record.kind !== "snapshot" && record.kind !== "change") {
      throw new TypeError("fee config record kind must be snapshot or change");
    }
    if (record.kind === "snapshot" && (!record.fee_config || typeof record.fee_config !== "object")) {
      throw new TypeError("fee config snapshot record requires fee_config");
    }
    return { ...record, key: orderingTuple(record.ordering) };
  });
  prepared.sort((a, b) => compareOrdering(a.key, b.key));
  for (let index = 1; index < prepared.length; index += 1) {
    if (compareOrdering(prepared[index - 1].key, prepared[index].key) === 0) {
      throw new Error("duplicate fee-config timeline ordering key");
    }
  }
  return {
    coverage_complete: coverageComplete === true,
    entries: prepared.map(({ key, ...record }) => ({ ...record, _key: key })),
  };
}

export function resolveFeeConfigAt(timeline, targetOrdering) {
  if (!timeline || !Array.isArray(timeline.entries)) throw new TypeError("fee config timeline is required");
  const target = orderingTuple(targetOrdering);
  let latest = null;
  for (const entry of timeline.entries) {
    if (compareOrdering(entry._key, target) > 0) break;
    latest = entry;
  }
  if (!latest) return { status: "unavailable", fee_config: null, source_event_id: null };
  if (latest.kind === "change") {
    return { status: "stale", fee_config: null, source_event_id: latest.event_id ?? null };
  }
  if (!timeline.coverage_complete) {
    return { status: "unverified", fee_config: latest.fee_config, source_event_id: latest.event_id ?? null };
  }
  return { status: "available", fee_config: latest.fee_config, source_event_id: latest.event_id ?? null };
}

export function quoteExactSolIn({
  spendableSolIn,
  virtualTokenReserves,
  virtualSolReserves,
  protocolFeeBps,
  creatorFeeBps,
}) {
  const budget = toBigInt(spendableSolIn, "spendableSolIn", U64_MAX);
  const tokenReserve = toBigInt(virtualTokenReserves, "virtualTokenReserves", U64_MAX);
  const quoteReserve = toBigInt(virtualSolReserves, "virtualSolReserves", U64_MAX);
  const protocolBps = toBigInt(protocolFeeBps, "protocolFeeBps", U64_MAX);
  const creatorBps = toBigInt(creatorFeeBps, "creatorFeeBps", U64_MAX);
  const totalBps = protocolBps + creatorBps;

  if (budget <= 1n || tokenReserve === 0n || quoteReserve === 0n) {
    throw new RangeError("spendable input must exceed one base unit and virtual reserves must be positive");
  }
  if (totalBps >= 10_000n) throw new RangeError("combined trade fees must be below 10000 bps");

  // Pump's documented exact-quote-in formula intentionally subtracts one
  // base unit before fee stripping to preserve the program's rounding parity.
  const netQuote = ((budget - 1n) * 10_000n) / (10_000n + totalBps);
  const protocolFee = (netQuote * protocolBps + 9_999n) / 10_000n;
  const creatorFee = (netQuote * creatorBps + 9_999n) / 10_000n;
  const totalFees = protocolFee + creatorFee;
  const tokensOut = (netQuote * tokenReserve) / (quoteReserve + netQuote);
  if (tokensOut <= 0n) throw new RangeError("quote input is too small to buy one base unit");

  return {
    spendable_quote_in_base_units: budget.toString(),
    net_quote_in_base_units: netQuote.toString(),
    protocol_fee_base_units: protocolFee.toString(),
    creator_fee_base_units: creatorFee.toString(),
    total_fee_base_units: totalFees.toString(),
    token_out_base_units: tokensOut.toString(),
    total_fee_bps: totalBps.toString(),
    quote_mint: DEFAULT_PUBKEY,
    unspent_quote_in_base_units: (budget - netQuote - totalFees).toString(),
  };
}
