import { U64_MAX, U128_MAX } from "../../core/integer.mjs";

function toUnsigned(value, name, max = U128_MAX) {
  let parsed;
  if (typeof value === "bigint") parsed = value;
  else if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) parsed = BigInt(value);
  else if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) parsed = BigInt(value);
  else throw new TypeError(`${name} must be an unsigned integer`);
  if (parsed < 0n || parsed > max) throw new RangeError(`${name} is outside its supported range`);
  return parsed;
}

function ceilDiv(numerator, denominator) {
  if (denominator <= 0n) throw new RangeError("denominator must be positive");
  return numerator === 0n ? 0n : (numerator + denominator - 1n) / denominator;
}

function normalizeFees({ protocolFeeBps, creatorFeeBps }) {
  const protocol = toUnsigned(protocolFeeBps, "protocolFeeBps", 10_000n);
  const creator = toUnsigned(creatorFeeBps, "creatorFeeBps", 10_000n);
  if (protocol + creator >= 10_000n) throw new RangeError("combined protocol and creator fee must be below 10000 bps");
  return { protocol, creator, total: protocol + creator };
}

function feeBreakdown(grossQuote, fees) {
  const protocol = ceilDiv(grossQuote * fees.protocol, 10_000n);
  const creator = ceilDiv(grossQuote * fees.creator, 10_000n);
  return {
    protocol_fee_base_units: protocol,
    creator_fee_base_units: creator,
    total_fee_base_units: protocol + creator,
  };
}

function curveState(input) {
  const virtualToken = toUnsigned(input.virtualTokenReserves ?? input.virtual_token_reserves, "virtualTokenReserves", U64_MAX);
  const virtualQuote = toUnsigned(input.virtualQuoteReserves ?? input.virtual_quote_reserves ?? input.virtualSolReserves, "virtualQuoteReserves", U64_MAX);
  const realToken = toUnsigned(input.realTokenReserves ?? input.real_token_reserves, "realTokenReserves", U64_MAX);
  const realQuote = toUnsigned(input.realQuoteReserves ?? input.real_quote_reserves ?? 0n, "realQuoteReserves", U64_MAX);
  const supply = input.tokenTotalSupply ?? input.token_total_supply;
  const tokenTotalSupply = supply === undefined ? null : toUnsigned(supply, "tokenTotalSupply", U64_MAX);
  if (virtualToken === 0n || virtualQuote === 0n) throw new RangeError("virtual reserves must be positive");
  if (realToken > virtualToken) throw new RangeError("real token reserves cannot exceed virtual token reserves");
  return { virtualToken, virtualQuote, realToken, realQuote, tokenTotalSupply };
}

function makeQuote({ side, method, input, output, curveInput, fee, remaining, unspent = 0n, legs, status = "QUOTED" }) {
  return {
    status,
    side,
    method,
    input_base_units: input.toString(),
    output_base_units: output.toString(),
    curve_input_base_units: curveInput.toString(),
    protocol_fee_base_units: fee.protocol_fee_base_units.toString(),
    creator_fee_base_units: fee.creator_fee_base_units.toString(),
    total_fee_base_units: fee.total_fee_base_units.toString(),
    unspent_input_base_units: unspent.toString(),
    remaining_real_token_reserves_base_units: remaining.toString(),
    legs: legs.map((leg) => Object.fromEntries(Object.entries(leg).map(([key, value]) => [
      key,
      typeof value === "bigint" ? value.toString() : value,
    ]))),
  };
}

/**
 * Exact quote-in curve buy. Uses Pump's documented (budget - 1) fee stripping
 * and integer constant-product rounding. This only quotes the curve leg.
 */
export function quoteExactQuoteInBuy({
  spendableQuoteIn,
  virtualTokenReserves,
  virtualQuoteReserves,
  realTokenReserves,
  protocolFeeBps,
  creatorFeeBps,
}) {
  const budget = toUnsigned(spendableQuoteIn, "spendableQuoteIn", U64_MAX);
  const state = curveState({ virtualTokenReserves, virtualQuoteReserves, realTokenReserves });
  const fees = normalizeFees({ protocolFeeBps, creatorFeeBps });
  if (budget <= 1n) throw new RangeError("spendable quote input must exceed one base unit");
  let netQuote = (budget * 10_000n) / (10_000n + fees.total);
  let fee = feeBreakdown(netQuote, fees);
  if (netQuote + fee.total_fee_base_units > budget) {
    netQuote -= netQuote + fee.total_fee_base_units - budget;
    fee = feeBreakdown(netQuote, fees);
  }
  const effectiveQuote = netQuote > 0n ? netQuote - 1n : 0n;
  const tokenOutRaw = (effectiveQuote * state.virtualToken) / (state.virtualQuote + effectiveQuote);
  const tokenOut = tokenOutRaw > state.realToken ? state.realToken : tokenOutRaw;
  if (tokenOut === 0n) throw new RangeError("quote input is too small to buy one token base unit");
  const spent = netQuote + fee.total_fee_base_units;
  return makeQuote({
    side: "buy",
    method: "exact_quote_in",
    input: budget,
    output: tokenOut,
    curveInput: netQuote,
    fee,
    remaining: state.realToken - tokenOut,
    unspent: budget > spent ? budget - spent : 0n,
    legs: [{ venue: "bonding_curve", quote_in: spent, token_out: tokenOut, net_quote_in: netQuote }],
  });
}

/**
 * Exact-token-out curve buy. The +1 is part of Pump's integer quote formula;
 * fees are then added on top using ceiling division.
 */
export function quoteExactTokenOutBuy({
  tokenAmountOut,
  virtualTokenReserves,
  virtualQuoteReserves,
  realTokenReserves,
  protocolFeeBps,
  creatorFeeBps,
}) {
  const amount = toUnsigned(tokenAmountOut, "tokenAmountOut", U64_MAX);
  const state = curveState({ virtualTokenReserves, virtualQuoteReserves, realTokenReserves });
  const fees = normalizeFees({ protocolFeeBps, creatorFeeBps });
  if (amount === 0n) throw new RangeError("tokenAmountOut must be positive");
  if (amount > state.realToken) {
    const error = new RangeError("requested token output exceeds remaining curve inventory");
    error.code = "INSUFFICIENT_CURVE_INVENTORY";
    throw error;
  }
  if (amount >= state.virtualToken) throw new RangeError("requested token output exhausts virtual token reserves");
  const netQuote = ((amount * state.virtualQuote) / (state.virtualToken - amount)) + 1n;
  const fee = feeBreakdown(netQuote, fees);
  const totalCost = netQuote + fee.total_fee_base_units;
  return makeQuote({
    side: "buy",
    method: "exact_token_out",
    input: totalCost,
    output: amount,
    curveInput: netQuote,
    fee,
    remaining: state.realToken - amount,
    legs: [{ venue: "bonding_curve", quote_in: totalCost, token_out: amount, net_quote_in: netQuote }],
  });
}

/**
 * Exact-token-in sell. The curve pays gross constant-product quote output,
 * then deducts separately ceiling-rounded protocol and creator fees.
 */
export function quoteExactTokenInSell({
  tokenAmountIn,
  virtualTokenReserves,
  virtualQuoteReserves,
  protocolFeeBps,
  creatorFeeBps,
}) {
  const amount = toUnsigned(tokenAmountIn, "tokenAmountIn", U64_MAX);
  const state = curveState({ virtualTokenReserves, virtualQuoteReserves, realTokenReserves: 0n });
  const fees = normalizeFees({ protocolFeeBps, creatorFeeBps });
  if (amount === 0n) throw new RangeError("tokenAmountIn must be positive");
  const grossQuote = (amount * state.virtualQuote) / (state.virtualToken + amount);
  const fee = feeBreakdown(grossQuote, fees);
  const netQuote = grossQuote > fee.total_fee_base_units ? grossQuote - fee.total_fee_base_units : 0n;
  return makeQuote({
    side: "sell",
    method: "exact_token_in",
    input: amount,
    output: netQuote,
    curveInput: amount,
    fee,
    remaining: 0n,
    legs: [{ venue: "bonding_curve", token_in: amount, gross_quote_out: grossQuote, quote_out: netQuote }],
  });
}

function quoteConstantProductExactQuoteIn({ budget, baseReserve, quoteReserve, fees }) {
  if (budget <= 1n) return { tokenOut: 0n, quoteIn: 0n, fee: feeBreakdown(0n, fees), spent: 0n, unspent: budget };
  let netQuote = (budget * 10_000n) / (10_000n + fees.total);
  let fee = feeBreakdown(netQuote, fees);
  if (netQuote + fee.total_fee_base_units > budget) {
    netQuote -= netQuote + fee.total_fee_base_units - budget;
    fee = feeBreakdown(netQuote, fees);
  }
  const effectiveQuote = netQuote > 0n ? netQuote - 1n : 0n;
  const tokenOut = (effectiveQuote * baseReserve) / (quoteReserve + effectiveQuote);
  const spent = netQuote + fee.total_fee_base_units;
  return { tokenOut, quoteIn: netQuote, fee, spent, unspent: budget > spent ? budget - spent : 0n };
}

function quoteConstantProductExactTokenOut({ amount, baseReserve, quoteReserve, fees }) {
  if (amount <= 0n || amount >= baseReserve) throw new RangeError("pool token output must be positive and below pool base reserves");
  const netQuote = ceilDiv(amount * quoteReserve, baseReserve - amount);
  const fee = feeBreakdown(netQuote, fees);
  return { tokenOut: amount, quoteIn: netQuote, fee, spent: netQuote + fee.total_fee_base_units };
}

function migrationPoolState({
  curve,
  curveBaseTokenBalance,
  poolMigrationFee,
  curveCompletionQuoteIn,
}) {
  const baseBalance = toUnsigned(curveBaseTokenBalance, "curveBaseTokenBalance", U64_MAX);
  const migrationFee = toUnsigned(poolMigrationFee ?? 0n, "poolMigrationFee", U64_MAX);
  if (baseBalance < curve.realToken) throw new RangeError("curve base token account balance is below remaining real reserves");
  const poolBase = baseBalance - curve.realToken;
  const poolQuoteBeforeFee = curve.realQuote + curveCompletionQuoteIn;
  if (poolQuoteBeforeFee <= migrationFee) throw new RangeError("migration fee consumes all quote liquidity");
  const poolQuote = poolQuoteBeforeFee - migrationFee;
  if (poolBase === 0n || poolQuote === 0n) throw new RangeError("synthetic migration would create an empty pool side");
  return { poolBase, poolQuote, migrationFee };
}

/**
 * V3 buy exact token-out including the synthetic migration leg.
 * Mayhem curves deliberately never enter this branch.
 */
export function quoteV3ExactTokenOutBuy({
  tokenAmountOut,
  bondingCurve,
  curveBaseTokenBalance,
  poolMigrationFee,
  protocolFeeBps,
  creatorFeeBps,
  isMayhemMode = false,
  partialFill = false,
}) {
  const curve = curveState(bondingCurve ?? {});
  const amount = toUnsigned(tokenAmountOut, "tokenAmountOut", U64_MAX);
  const fees = normalizeFees({ protocolFeeBps, creatorFeeBps });
  if (curve.realToken === 0n) throw new RangeError("bonding curve has no remaining inventory");
  if (amount === 0n) throw new RangeError("tokenAmountOut must be positive");

  if (amount <= curve.realToken) {
    return quoteExactTokenOutBuy({
      tokenAmountOut: amount,
      virtualTokenReserves: curve.virtualToken,
      virtualQuoteReserves: curve.virtualQuote,
      realTokenReserves: curve.realToken,
      protocolFeeBps: fees.protocol,
      creatorFeeBps: fees.creator,
    });
  }

  if (isMayhemMode || bondingCurve?.is_mayhem_mode === true || bondingCurve?.isMayhemMode === true) {
    if (!partialFill) {
      const error = new RangeError("Mayhem curve cannot use synthetic migration; partial_fill is required to take remaining inventory");
      error.code = "MAYHEM_PARTIAL_FILL_REQUIRED";
      throw error;
    }
    return quoteExactTokenOutBuy({
      tokenAmountOut: curve.realToken,
      virtualTokenReserves: curve.virtualToken,
      virtualQuoteReserves: curve.virtualQuote,
      realTokenReserves: curve.realToken,
      protocolFeeBps: fees.protocol,
      creatorFeeBps: fees.creator,
    });
  }

  const curveLeg = quoteExactTokenOutBuy({
    tokenAmountOut: curve.realToken,
    virtualTokenReserves: curve.virtualToken,
    virtualQuoteReserves: curve.virtualQuote,
    realTokenReserves: curve.realToken,
    protocolFeeBps: fees.protocol,
    creatorFeeBps: fees.creator,
  });
  const pool = migrationPoolState({
    curve,
    curveBaseTokenBalance,
    poolMigrationFee,
    curveCompletionQuoteIn: BigInt(curveLeg.input_base_units),
  });
  const extraTokens = amount - curve.realToken;
  const poolLeg = quoteConstantProductExactTokenOut({
    amount: extraTokens,
    baseReserve: pool.poolBase,
    quoteReserve: pool.poolQuote,
    fees,
  });
  const totalFee = {
    protocol_fee_base_units: BigInt(curveLeg.protocol_fee_base_units) + poolLeg.fee.protocol_fee_base_units,
    creator_fee_base_units: BigInt(curveLeg.creator_fee_base_units) + poolLeg.fee.creator_fee_base_units,
  };
  totalFee.total_fee_base_units = totalFee.protocol_fee_base_units + totalFee.creator_fee_base_units;
  const totalCost = BigInt(curveLeg.input_base_units) + poolLeg.spent;
  return makeQuote({
    side: "buy",
    method: "v3_synthetic_migration_exact_token_out",
    input: totalCost,
    output: amount,
    curveInput: BigInt(curveLeg.curve_input_base_units),
    fee: totalFee,
    remaining: 0n,
    legs: [
      { venue: "bonding_curve", quote_in: BigInt(curveLeg.input_base_units), token_out: curve.realToken },
      { venue: "synthetic_pumpswap_pool", quote_in: poolLeg.spent, token_out: extraTokens, pool_base_before: pool.poolBase, pool_quote_before: pool.poolQuote },
    ],
  });
}

/**
 * V3 exact-quote-in including synthetic migration. Any quote left after the
 * curve is completed is spent against the pool-to-be; Mayhem keeps old
 * partial-fill semantics and never creates a synthetic pool leg.
 */
export function quoteV3ExactQuoteInBuy({
  spendableQuoteIn,
  bondingCurve,
  curveBaseTokenBalance,
  poolMigrationFee,
  protocolFeeBps,
  creatorFeeBps,
  isMayhemMode = false,
  partialFill = false,
}) {
  const budget = toUnsigned(spendableQuoteIn, "spendableQuoteIn", U64_MAX);
  const curve = curveState(bondingCurve ?? {});
  const fees = normalizeFees({ protocolFeeBps, creatorFeeBps });
  if (curve.realToken === 0n) throw new RangeError("bonding curve has no remaining inventory");
  const curveOnly = quoteExactQuoteInBuy({
    spendableQuoteIn: budget,
    virtualTokenReserves: curve.virtualToken,
    virtualQuoteReserves: curve.virtualQuote,
    realTokenReserves: curve.realToken,
    protocolFeeBps: fees.protocol,
    creatorFeeBps: fees.creator,
  });
  if (BigInt(curveOnly.output_base_units) < curve.realToken) return curveOnly;

  if (isMayhemMode || bondingCurve?.is_mayhem_mode === true || bondingCurve?.isMayhemMode === true) {
    if (!partialFill) {
      const error = new RangeError("Mayhem curve does not support synthetic migration; set partial_fill to buy only remaining curve inventory");
      error.code = "MAYHEM_PARTIAL_FILL_REQUIRED";
      throw error;
    }
    const capped = quoteExactTokenOutBuy({
      tokenAmountOut: curve.realToken,
      virtualTokenReserves: curve.virtualToken,
      virtualQuoteReserves: curve.virtualQuote,
      realTokenReserves: curve.realToken,
      protocolFeeBps: fees.protocol,
      creatorFeeBps: fees.creator,
    });
    const spent = BigInt(capped.input_base_units);
    return {
      ...capped,
      method: "mayhem_partial_fill_exact_quote_in",
      input_base_units: budget.toString(),
      unspent_input_base_units: (budget > spent ? budget - spent : 0n).toString(),
      status: "PARTIAL_FILL",
    };
  }

  const curveLeg = quoteExactTokenOutBuy({
    tokenAmountOut: curve.realToken,
    virtualTokenReserves: curve.virtualToken,
    virtualQuoteReserves: curve.virtualQuote,
    realTokenReserves: curve.realToken,
    protocolFeeBps: fees.protocol,
    creatorFeeBps: fees.creator,
  });
  const curveCost = BigInt(curveLeg.input_base_units);
  if (budget <= curveCost) {
    return quoteExactQuoteInBuy({
      spendableQuoteIn: budget,
      virtualTokenReserves: curve.virtualToken,
      virtualQuoteReserves: curve.virtualQuote,
      realTokenReserves: curve.realToken,
      protocolFeeBps: fees.protocol,
      creatorFeeBps: fees.creator,
    });
  }
  const pool = migrationPoolState({
    curve,
    curveBaseTokenBalance,
    poolMigrationFee,
    curveCompletionQuoteIn: curveCost,
  });
  const poolBudget = budget - curveCost;
  const poolLeg = quoteConstantProductExactQuoteIn({
    budget: poolBudget,
    baseReserve: pool.poolBase,
    quoteReserve: pool.poolQuote,
    fees,
  });
  const totalFee = {
    protocol_fee_base_units: BigInt(curveLeg.protocol_fee_base_units) + poolLeg.fee.protocol_fee_base_units,
    creator_fee_base_units: BigInt(curveLeg.creator_fee_base_units) + poolLeg.fee.creator_fee_base_units,
  };
  totalFee.total_fee_base_units = totalFee.protocol_fee_base_units + totalFee.creator_fee_base_units;
  const totalOutput = curve.realToken + poolLeg.tokenOut;
  const totalSpent = curveCost + poolLeg.spent;
  return makeQuote({
    side: "buy",
    method: "v3_synthetic_migration_exact_quote_in",
    input: budget,
    output: totalOutput,
    curveInput: BigInt(curveLeg.curve_input_base_units) + poolLeg.quoteIn,
    fee: totalFee,
    remaining: 0n,
    unspent: budget > totalSpent ? budget - totalSpent : 0n,
    legs: [
      { venue: "bonding_curve", quote_in: curveCost, token_out: curve.realToken },
      ...(poolLeg.tokenOut > 0n ? [{ venue: "synthetic_pumpswap_pool", quote_in: poolLeg.spent, token_out: poolLeg.tokenOut, pool_base_before: pool.poolBase, pool_quote_before: pool.poolQuote }] : []),
    ],
  });
}

export function quoteMayhemExactTokenOutBuy({
  tokenAmountOut,
  bondingCurve,
  protocolFeeBps,
  creatorFeeBps,
  partialFill = false,
}) {
  const requested = toUnsigned(tokenAmountOut, "tokenAmountOut", U64_MAX);
  const curve = curveState(bondingCurve ?? {});
  const quote = quoteV3ExactTokenOutBuy({
    tokenAmountOut: requested,
    bondingCurve,
    protocolFeeBps,
    creatorFeeBps,
    isMayhemMode: true,
    partialFill,
  });
  if (requested > curve.realToken) {
    return {
      ...quote,
      status: "PARTIAL_FILL",
      method: "mayhem_partial_fill_exact_token_out",
      requested_output_base_units: requested.toString(),
    };
  }
  return quote;
}

export function quoteMayhemExactQuoteInBuy({
  spendableQuoteIn,
  bondingCurve,
  protocolFeeBps,
  creatorFeeBps,
  partialFill = false,
}) {
  return quoteV3ExactQuoteInBuy({
    spendableQuoteIn,
    bondingCurve,
    protocolFeeBps,
    creatorFeeBps,
    isMayhemMode: true,
    partialFill,
  });
}
