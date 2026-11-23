import { DEFAULT_PUBKEY, WRAPPED_SOL_MINT } from "./fee-resolver.mjs";
import { PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID, PUMP_FEES_PROGRAM_ID, getPumpIdlSnapshotMetadata } from "./pump-decoder.mjs";

const U64_MAX = (1n << 64n) - 1n;

function uint(value, name) {
  const parsed = typeof value === "bigint" ? value : typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value) ? BigInt(value) : null;
  if (parsed === null || parsed < 0n || parsed > U64_MAX) throw new TypeError(`${name} must be a u64 integer`);
  return parsed;
}

function timestampMs(value) {
  const seconds = typeof value === "bigint" ? value : BigInt(value);
  if (seconds < 0n || seconds * 1000n > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("event timestamp is outside the supported range");
  }
  return Number(seconds * 1000n);
}

function formatRatio(numerator, denominator, precision = 24) {
  if (denominator === 0n) throw new RangeError("price denominator cannot be zero");
  const scale = 10n ** BigInt(precision);
  const scaled = numerator * scale / denominator;
  const whole = scaled / scale;
  const fraction = (scaled % scale).toString().padStart(precision, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function normalizedQuoteMint(quoteMint) {
  if (!quoteMint || quoteMint === DEFAULT_PUBKEY || quoteMint === WRAPPED_SOL_MINT) return WRAPPED_SOL_MINT;
  const error = new Error(`unsupported quote mint for current Pump history adapter: ${quoteMint}`);
  error.code = "UNSUPPORTED_QUOTE_MINT";
  throw error;
}

function baseEvent({
  eventKind,
  eventName,
  data,
  signature,
  ordering,
  network,
  sourceType,
  sourceId,
  marketPhase = "bonding_curve",
  curveAccount = null,
}) {
  if (!["mainnet", "devnet"].includes(network)) throw new TypeError("network must be mainnet or devnet");
  const eventSequence = Number.isSafeInteger(ordering?.eventSequence) && ordering.eventSequence >= 0 ? ordering.eventSequence : 0;
  const completeOrder = ["slot", "transactionIndex", "instructionIndex"].every((field) =>
    Number.isSafeInteger(ordering?.[field]) && ordering[field] >= 0
  ) && Number.isSafeInteger(ordering?.eventSequence) && ordering.eventSequence >= 0;
  const quoteMint = normalizedQuoteMint(data.quote_mint);
  const metadata = getPumpIdlSnapshotMetadata();
  const timestamp = timestampMs(data.timestamp);
  const signatureValue = signature ?? "unknown-signature";
  return {
    schema_version: "1.0.0",
    event_id: `${signatureValue}:event:${eventSequence}:${eventName}`,
    provenance: "observed_chain",
    event_kind: eventKind,
    market: {
      chain_id: "solana",
      network,
      token_mint: data.mint ?? data.base_mint,
      quote_mint: quoteMint,
      curve_program_id: PUMP_PROGRAM_ID,
      curve_account: curveAccount ?? data.bonding_curve ?? null,
      program_version: null,
      idl_revision: metadata.pump_idl_blob_sha,
      market_phase: marketPhase,
    },
    event_time_ms: timestamp,
    ordering: {
      slot: ordering?.slot ?? null,
      transaction_index: ordering?.transactionIndex ?? null,
      instruction_index: ordering?.instructionIndex ?? null,
      inner_instruction_index: ordering?.innerInstructionIndex ?? null,
      event_sequence: eventSequence,
      ordering_confidence: completeOrder ? "complete" : "partial",
    },
    source: {
      source_type: sourceType ?? "rpc",
      source_id: sourceId ?? signatureValue,
      signature: signatureValue,
      adapter_version: "pump-decoder-v1.3.0",
    },
    payload: {
      signature: signatureValue,
      source_event_name: eventName,
    },
    quality: {
      is_complete: completeOrder,
      validation_status: completeOrder ? "valid" : "warning",
      warnings: completeOrder ? [] : ["transaction ordering metadata is incomplete"],
      reconciliation_ref: null,
    },
  };
}

export function normalizePumpCreateEvent({
  decodedEvent,
  signature,
  ordering,
  network = "mainnet",
  sourceType = "rpc",
}) {
  if (decodedEvent?.status !== "DECODED" || decodedEvent.event_name !== "CreateEvent") {
    throw new TypeError("a decoded Pump CreateEvent is required");
  }
  const data = decodedEvent.data;
  const event = baseEvent({
    eventKind: "MARKET_CREATED",
    eventName: decodedEvent.event_name,
    data,
    signature,
    ordering,
    network,
    sourceType,
    curveAccount: data.bonding_curve,
  });
  event.payload = {
    ...event.payload,
    creator_address: data.creator,
    user_address: data.user,
    token_name: data.name,
    token_symbol: data.symbol,
    metadata_uri: data.uri,
    token_program_id: data.token_program,
    token_total_supply_base_units: uint(data.token_total_supply, "token_total_supply").toString(),
    initial_curve_state: {
      virtual_token_reserves_base_units: uint(data.virtual_token_reserves, "virtual_token_reserves").toString(),
      virtual_quote_reserves_base_units: uint(data.virtual_quote_reserves > 0n ? data.virtual_quote_reserves : data.virtual_sol_reserves, "virtual_quote_reserves").toString(),
      real_token_reserves_base_units: uint(data.real_token_reserves, "real_token_reserves").toString(),
      real_quote_reserves_base_units: "0",
      token_total_supply_base_units: uint(data.token_total_supply, "token_total_supply").toString(),
      protocol_fees_base_units: "0",
      creator_fees_base_units: "0",
      complete: false,
    },
    is_mayhem_mode: data.is_mayhem_mode === true,
    is_cashback_enabled: data.is_cashback_enabled === true,
    creator_fee_bps: uint(data.creator_fee_bps ?? 0n, "creator_fee_bps").toString(),
    is_holder_reward: data.is_holder_reward === true,
    curve_depth: data.depth ?? 0,
  };
  return event;
}

export function normalizePumpCompleteEvent({
  decodedEvent,
  signature,
  ordering,
  network = "mainnet",
  sourceType = "rpc",
}) {
  if (decodedEvent?.status !== "DECODED" || decodedEvent.event_name !== "CompleteEvent") {
    throw new TypeError("a decoded Pump CompleteEvent is required");
  }
  const event = baseEvent({
    eventKind: "CURVE_COMPLETE",
    eventName: decodedEvent.event_name,
    data: decodedEvent.data,
    signature,
    ordering,
    network,
    sourceType,
    curveAccount: decodedEvent.data.bonding_curve,
  });
  event.payload = {
    ...event.payload,
    actor_address: decodedEvent.data.user,
    mint: decodedEvent.data.mint,
    quote_mint: event.market.quote_mint,
  };
  return event;
}

export function normalizePumpPostCompleteBuyEvent({
  decodedEvent,
  signature,
  ordering,
  tokenDecimals,
  quoteDecimals = 9,
  network = "mainnet",
  sourceType = "rpc",
}) {
  if (decodedEvent?.status !== "DECODED" || decodedEvent.event_name !== "PostCompleteBuyEvent") {
    throw new TypeError("a decoded Pump PostCompleteBuyEvent is required");
  }
  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 18) {
    throw new RangeError("tokenDecimals must be supplied for post-completion price normalization");
  }
  const data = decodedEvent.data;
  const event = baseEvent({
    eventKind: "POST_COMPLETE_POOL_LEG",
    eventName: decodedEvent.event_name,
    data,
    signature,
    ordering,
    network,
    sourceType,
    marketPhase: "post_graduation",
    curveAccount: data.bonding_curve,
  });
  const baseOut = uint(data.base_out, "base_out");
  const quoteIn = uint(data.quote_in, "quote_in");
  if (baseOut === 0n || quoteIn === 0n) throw new RangeError("post-completion pool leg amounts must be positive");
  const protocolFee = uint(data.fee, "fee");
  const creatorFee = uint(data.creator_fee, "creator_fee");
  const buybackFee = uint(data.buyback_fee, "buyback_fee");
  if (buybackFee > protocolFee) throw new RangeError("buyback fee cannot exceed protocol fee charged");
  event.payload = {
    ...event.payload,
    actor_address: data.user,
    token_amount_base_units: baseOut.toString(),
    quote_amount_base_units: quoteIn.toString(),
    quote_mint: event.market.quote_mint,
    token_decimals: tokenDecimals,
    quote_decimals: quoteDecimals,
    execution_price_decimal: formatRatio(quoteIn * (10n ** BigInt(tokenDecimals)), baseOut * (10n ** BigInt(quoteDecimals))),
    fee_basis_points: uint(data.fee_basis_points, "fee_basis_points").toString(),
    protocol_fee_base_units: uint(data.fee, "fee").toString(),
    creator_fee_basis_points: uint(data.creator_fee_basis_points, "creator_fee_basis_points").toString(),
    creator_fee_base_units: uint(data.creator_fee, "creator_fee").toString(),
    buyback_fee_base_units: uint(data.buyback_fee, "buyback_fee").toString(),
    fee_components: [
      { fee_type: "protocol_charged", amount_base_units: protocolFee.toString(), mint: event.market.quote_mint },
      { fee_type: "protocol_retained", amount_base_units: (protocolFee - buybackFee).toString(), mint: event.market.quote_mint },
      { fee_type: "creator", amount_base_units: creatorFee.toString(), mint: event.market.quote_mint },
      { fee_type: "buyback_paid_immediately", amount_base_units: buybackFee.toString(), mint: event.market.quote_mint },
    ],
    fee_balances_delta: {
      protocol_fees_base_units: (protocolFee - buybackFee).toString(),
      creator_fees_base_units: creatorFee.toString(),
    },
    pool_base_reserves_before_base_units: uint(data.pool_base_reserves_before, "pool_base_reserves_before").toString(),
    pool_quote_reserves_before_base_units: uint(data.pool_quote_reserves_before, "pool_quote_reserves_before").toString(),
    pool_base_reserves_after_base_units: uint(data.pool_base_reserves_after, "pool_base_reserves_after").toString(),
    pool_quote_reserves_after_base_units: uint(data.pool_quote_reserves_after, "pool_quote_reserves_after").toString(),
    price_basis: "post_complete_pool_leg_event",
  };
  return event;
}

export function normalizePumpMigrationEvent({
  decodedEvent,
  signature,
  ordering,
  network = "mainnet",
  sourceType = "rpc",
}) {
  if (decodedEvent?.status !== "DECODED" || decodedEvent.event_name !== "CompletePumpAmmMigrationEvent") {
    throw new TypeError("a decoded CompletePumpAmmMigrationEvent is required");
  }
  const data = decodedEvent.data;
  const event = baseEvent({
    eventKind: "CURVE_MIGRATED",
    eventName: decodedEvent.event_name,
    data,
    signature,
    ordering,
    network,
    sourceType,
    marketPhase: "graduated",
    curveAccount: data.bonding_curve,
  });
  event.payload = {
    ...event.payload,
    actor_address: data.user,
    mint: data.mint,
    pool_address: data.pool,
    migrated_token_amount_base_units: uint(data.mint_amount, "mint_amount").toString(),
    migrated_quote_amount_base_units: uint(data.sol_amount, "sol_amount").toString(),
    pool_migration_fee_base_units: uint(data.pool_migration_fee, "pool_migration_fee").toString(),
    quote_mint: event.market.quote_mint,
  };
  return event;
}

export function normalizePumpAmmCreatePoolEvent({
  decodedEvent,
  signature,
  ordering,
  network = "mainnet",
  sourceType = "rpc",
}) {
  if (decodedEvent?.status !== "DECODED" || decodedEvent.event_name !== "CreatePoolEvent") {
    throw new TypeError("a decoded PumpSwap CreatePoolEvent is required");
  }
  const data = decodedEvent.data;
  const event = baseEvent({
    eventKind: "POOL_CREATED",
    eventName: decodedEvent.event_name,
    data: { ...data, mint: data.base_mint },
    signature,
    ordering,
    network,
    sourceType,
    marketPhase: "post_graduation",
  });
  event.payload.pool_program_id = PUMP_AMM_PROGRAM_ID;
  event.payload = {
    ...event.payload,
    pool_address: data.pool,
    pool_index: data.index,
    lp_mint: data.lp_mint,
    creator_address: data.creator,
    coin_creator_address: data.coin_creator,
    base_mint: data.base_mint,
    quote_mint: event.market.quote_mint,
    base_mint_decimals: data.base_mint_decimals,
    quote_mint_decimals: data.quote_mint_decimals,
    base_amount_in_base_units: uint(data.base_amount_in, "base_amount_in").toString(),
    quote_amount_in_base_units: uint(data.quote_amount_in, "quote_amount_in").toString(),
    pool_base_reserves_base_units: uint(data.pool_base_amount, "pool_base_amount").toString(),
    pool_quote_reserves_base_units: uint(data.pool_quote_amount, "pool_quote_amount").toString(),
    lp_token_amount_out_base_units: uint(data.lp_token_amount_out, "lp_token_amount_out").toString(),
    is_mayhem_mode: data.is_mayhem_mode === true,
    creator_fee_bps: uint(data.creator_fee_bps ?? 0n, "creator_fee_bps").toString(),
    is_holder_reward: data.is_holder_reward === true,
  };
  return event;
}

export function normalizePumpFeeSweepEvent({
  decodedEvent,
  signature,
  ordering,
  network = "mainnet",
  sourceType = "rpc",
}) {
  if (decodedEvent?.status !== "DECODED" || decodedEvent.event_name !== "SweepBondingCurveFeeEvent") {
    throw new TypeError("a decoded Pump SweepBondingCurveFeeEvent is required");
  }
  const data = decodedEvent.data;
  const event = baseEvent({
    eventKind: "FEE_MOVEMENT",
    eventName: decodedEvent.event_name,
    data,
    signature,
    ordering,
    network,
    sourceType,
    curveAccount: data.bonding_curve,
  });
  event.payload = {
    ...event.payload,
    mint: data.mint,
    recipient_address: data.recipient,
    amount_base_units: uint(data.amount, "amount").toString(),
    fee_bucket: data.bucket,
    quote_mint: event.market.quote_mint,
  };
  return event;
}

export function normalizePumpFeeConfigChangeEvent({
  decodedEvent,
  signature,
  ordering,
  network = "mainnet",
  sourceType = "rpc",
}) {
  if (!decodedEvent || decodedEvent.status !== "DECODED" || decodedEvent.program_id !== PUMP_FEES_PROGRAM_ID) {
    throw new TypeError("a decoded Pump Fees program event is required");
  }
  const data = decodedEvent.data;
  const mint = data.mint ?? "PUMP_FEE_CONFIG";
  const event = baseEvent({
    eventKind: "FEE_CONFIG_CHANGE",
    eventName: decodedEvent.event_name,
    data: { ...data, mint, quote_mint: DEFAULT_PUBKEY },
    signature,
    ordering,
    network,
    sourceType,
    marketPhase: "bonding_curve",
  });
  event.market.token_mint = mint;
  event.payload = {
    ...event.payload,
    fee_config_address: data.fee_config ?? null,
    fee_config_event_name: decodedEvent.event_name,
    decoded_fee_config_change: data,
  };
  return event;
}
