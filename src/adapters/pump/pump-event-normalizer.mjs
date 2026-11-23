import { DEFAULT_PUBKEY, WRAPPED_SOL_MINT } from "./fee-resolver.mjs";
import { PUMP_PROGRAM_ID, getPumpIdlSnapshotMetadata } from "./pump-decoder.mjs";

const U64_MAX = (1n << 64n) - 1n;

function asUnsignedBigInt(value, name) {
  if (typeof value === "bigint") {
    if (value < 0n || value > U64_MAX) throw new RangeError(`${name} is outside u64 range`);
    return value;
  }
  if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) {
    const parsed = BigInt(value);
    if (parsed > U64_MAX) throw new RangeError(`${name} is outside u64 range`);
    return parsed;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  throw new TypeError(`${name} must be an unsigned integer`);
}

function validateDecimals(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 18) {
    throw new RangeError(`${name} must be an integer between 0 and 18`);
  }
  return value;
}

function formatRatioDecimal(numerator, denominator, precision) {
  if (denominator === 0n) throw new RangeError("price denominator cannot be zero");
  const scale = 10n ** BigInt(precision);
  const scaled = (numerator * scale) / denominator;
  if (scaled === 0n) {
    const error = new RangeError("price is below configured decimal precision");
    error.code = "PRICE_PRECISION_TOO_LOW";
    throw error;
  }
  const whole = scaled / scale;
  const fraction = (scaled % scale).toString().padStart(precision, "0").replace(/0+$/, "");
  return fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
}

function completeOrdering(input) {
  const integerFields = ["slot", "transactionIndex", "instructionIndex", "eventSequence"];
  const complete = integerFields.every((field) =>
    Number.isSafeInteger(input[field]) && input[field] >= 0
  );
  const inner = input.innerInstructionIndex ?? null;
  if (inner !== null && (!Number.isSafeInteger(inner) || inner < 0)) {
    throw new TypeError("innerInstructionIndex must be a non-negative integer or null");
  }
  return {
    value: {
      slot: Number.isSafeInteger(input.slot) && input.slot >= 0 ? input.slot : null,
      transaction_index: Number.isSafeInteger(input.transactionIndex) && input.transactionIndex >= 0 ? input.transactionIndex : null,
      instruction_index: Number.isSafeInteger(input.instructionIndex) && input.instructionIndex >= 0 ? input.instructionIndex : null,
      inner_instruction_index: inner,
      event_sequence: Number.isSafeInteger(input.eventSequence) && input.eventSequence >= 0 ? input.eventSequence : 0,
      ordering_confidence: complete ? "complete" : "partial",
    },
    complete,
  };
}

function instructionVersion(name) {
  if (typeof name !== "string") return "unknown";
  if (name.endsWith("_v3")) return "v3";
  if (name.endsWith("_v2")) return "v2";
  return "legacy";
}

export function normalizePumpTradeEvent({
  decodedEvent,
  signature,
  ordering,
  tokenDecimals,
  quoteDecimals = 9,
  network = "mainnet",
  sourceType = "rpc",
  sourceId = signature,
  curveAccount = null,
  instructionName = null,
  accountStateReconciled = false,
  reconciliationRef = null,
  pricePrecision = 24,
}) {
  if (!decodedEvent || decodedEvent.status !== "DECODED" || decodedEvent.event_name !== "TradeEvent") {
    const error = new Error("a fully decoded Pump TradeEvent is required");
    error.code = "INVALID_TRADE_EVENT";
    throw error;
  }
  if (typeof signature !== "string" || signature.length === 0) {
    throw new TypeError("transaction signature is required");
  }
  if (!["mainnet", "devnet"].includes(network)) {
    throw new TypeError("unsupported network");
  }
  if (!["rpc", "indexer", "manual_import"].includes(sourceType)) {
    throw new TypeError("unsupported sourceType");
  }
  const tokenScale = validateDecimals(tokenDecimals, "tokenDecimals");
  const quoteScale = validateDecimals(quoteDecimals, "quoteDecimals");
  if (!Number.isInteger(pricePrecision) || pricePrecision < 1 || pricePrecision > 36) {
    throw new RangeError("pricePrecision must be between 1 and 36");
  }

  const data = decodedEvent.data;
  const mint = data.mint;
  const actor = data.user;
  if (typeof mint !== "string" || typeof actor !== "string") {
    throw new TypeError("TradeEvent is missing mint or user pubkey");
  }

  const rawQuoteMint = data.quote_mint ?? DEFAULT_PUBKEY;
  if (rawQuoteMint !== DEFAULT_PUBKEY && rawQuoteMint !== WRAPPED_SOL_MINT) {
    const error = new Error(`unsupported quote mint for current normalizer: ${rawQuoteMint}`);
    error.code = "UNSUPPORTED_QUOTE_MINT";
    throw error;
  }

  const quoteAmountField = asUnsignedBigInt(data.quote_amount ?? 0n, "quote_amount");
  const legacySolAmount = asUnsignedBigInt(data.sol_amount ?? 0n, "sol_amount");
  const quoteAmount = quoteAmountField > 0n ? quoteAmountField : legacySolAmount;
  const tokenAmount = asUnsignedBigInt(data.token_amount, "token_amount");
  if (quoteAmount === 0n || tokenAmount === 0n) {
    throw new RangeError("TradeEvent quote and token amounts must be positive");
  }

  const protocolFee = asUnsignedBigInt(data.fee ?? 0n, "fee");
  const creatorFee = asUnsignedBigInt(data.creator_fee ?? 0n, "creator_fee");
  const buybackFee = asUnsignedBigInt(data.buyback_fee ?? 0n, "buyback_fee");
  const virtualTokenReserves = asUnsignedBigInt(data.virtual_token_reserves, "virtual_token_reserves");
  const eventVirtualQuote = asUnsignedBigInt(data.virtual_quote_reserves ?? 0n, "virtual_quote_reserves");
  const virtualQuoteReserves = eventVirtualQuote > 0n
    ? eventVirtualQuote
    : asUnsignedBigInt(data.virtual_sol_reserves ?? 0n, "virtual_sol_reserves");
  const realTokenReserves = asUnsignedBigInt(data.real_token_reserves, "real_token_reserves");
  const eventRealQuote = asUnsignedBigInt(data.real_quote_reserves ?? 0n, "real_quote_reserves");
  const realQuoteReserves = eventRealQuote > 0n
    ? eventRealQuote
    : asUnsignedBigInt(data.real_sol_reserves ?? 0n, "real_sol_reserves");

  const priceNumerator = quoteAmount * (10n ** BigInt(tokenScale));
  const priceDenominator = tokenAmount * (10n ** BigInt(quoteScale));
  const price = formatRatioDecimal(priceNumerator, priceDenominator, pricePrecision);
  const timestamp = asUnsignedBigInt(data.timestamp, "timestamp");
  const eventTimeMsBigInt = timestamp * 1000n;
  if (eventTimeMsBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("event timestamp cannot be represented safely in milliseconds");
  }
  const eventTimeMs = Number(eventTimeMsBigInt);
  const eventOrdering = completeOrdering(ordering ?? {});
  const eventSequence = eventOrdering.value.event_sequence;
  const resolvedInstructionName = data.ix_name || instructionName || "unknown";
  const warnings = [];

  if (quoteAmountField > 0n && legacySolAmount > 0n && quoteAmountField !== legacySolAmount) {
    warnings.push("quote_amount and legacy sol_amount differ; quote_amount was selected without summing them");
  }
  if (resolvedInstructionName === "unknown") {
    warnings.push("instruction name is unavailable; version classification is unknown");
  }
  if (!eventOrdering.complete) {
    warnings.push("chain ordering metadata is incomplete; exact replay ordering is not guaranteed");
  }
  if (!accountStateReconciled) {
    warnings.push("TradeEvent has not yet been reconciled with authoritative transaction account deltas");
  } else if (typeof reconciliationRef !== "string" || reconciliationRef.length === 0) {
    throw new TypeError("reconciliationRef is required when accountStateReconciled is true");
  }

  const feeComponents = [];
  if (protocolFee > 0n) {
    feeComponents.push({
      fee_type: "protocol",
      amount_base_units: protocolFee.toString(),
      mint: WRAPPED_SOL_MINT,
    });
  }
  if (creatorFee > 0n) {
    feeComponents.push({
      fee_type: "creator",
      amount_base_units: creatorFee.toString(),
      mint: WRAPPED_SOL_MINT,
    });
  }

  const metadata = getPumpIdlSnapshotMetadata();
  const eventId = `${signature}:ix${eventOrdering.value.instruction_index ?? "unknown"}:event${eventSequence}`;
  const event = {
    schema_version: "1.0.0",
    event_id: eventId,
    provenance: "observed_chain",
    event_kind: data.is_buy ? "CURVE_BUY_EXECUTED" : "CURVE_SELL_EXECUTED",
    market: {
      chain_id: "solana",
      network,
      token_mint: mint,
      quote_mint: WRAPPED_SOL_MINT,
      curve_program_id: PUMP_PROGRAM_ID,
      curve_account: curveAccount,
      program_version: null,
      idl_revision: metadata.pump_idl_blob_sha,
      market_phase: "bonding_curve",
    },
    event_time_ms: eventTimeMs,
    ordering: eventOrdering.value,
    source: {
      source_type: sourceType,
      source_id: sourceId,
      signature,
      adapter_version: "pump-decoder-v1.2.0",
    },
    payload: {
      signature,
      actor_address: actor,
      token_amount_base_units: tokenAmount.toString(),
      quote_amount_base_units: quoteAmount.toString(),
      quote_mint: WRAPPED_SOL_MINT,
      execution_price_decimal: price,
      price_basis: "event_quote_amount_over_token_amount",
      token_decimals: tokenScale,
      quote_decimals: quoteScale,
      quote_amount_source: quoteAmountField > 0n ? "quote_amount" : "legacy_sol_amount",
      instruction_name: resolvedInstructionName,
      instruction_version: instructionVersion(resolvedInstructionName),
      fee_basis_points: asUnsignedBigInt(data.fee_basis_points ?? 0n, "fee_basis_points").toString(),
      creator_fee_basis_points: asUnsignedBigInt(data.creator_fee_basis_points ?? 0n, "creator_fee_basis_points").toString(),
      buyback_fee_basis_points: asUnsignedBigInt(data.buyback_fee_basis_points ?? 0n, "buyback_fee_basis_points").toString(),
      buyback_fee_base_units: buybackFee.toString(),
      fee_components: feeComponents,
      post_curve_state: {
        virtual_token_reserves_base_units: virtualTokenReserves.toString(),
        virtual_quote_reserves_base_units: virtualQuoteReserves.toString(),
        real_token_reserves_base_units: realTokenReserves.toString(),
        real_quote_reserves_base_units: realQuoteReserves.toString(),
        complete: realTokenReserves === 0n,
      },
    },
    quality: {
      is_complete: warnings.length === 0,
      validation_status: warnings.length === 0 ? "valid" : "warning",
      warnings,
      reconciliation_ref: accountStateReconciled ? reconciliationRef : null,
    },
  };

  return event;
}
