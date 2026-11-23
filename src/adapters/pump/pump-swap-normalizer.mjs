import { PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID } from "./pump-decoder.mjs";

const ZERO_PUBKEY = "11111111111111111111111111111111";
const U64_MAX = (1n << 64n) - 1n;

function uint(value, name) {
  const parsed = typeof value === "bigint"
    ? value
    : typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)
      ? BigInt(value)
      : null;
  if (parsed === null || parsed < 0n || parsed > U64_MAX) {
    throw new TypeError(`${name} must be a u64 integer`);
  }
  return parsed;
}

function signed(value, name) {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^-?(0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
  throw new TypeError(`${name} must be a signed integer`);
}

function decimals(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 18) {
    throw new RangeError(`${name} must be an integer from 0 to 18`);
  }
  return value;
}

function timestampMs(value) {
  const seconds = signed(value, "timestamp");
  if (seconds < 0n || seconds * 1000n > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("event timestamp is outside the supported range");
  }
  return Number(seconds * 1000n);
}

function ratio(numerator, denominator, precision = 24) {
  if (denominator <= 0n) throw new RangeError("price denominator must be positive");
  const scale = 10n ** BigInt(precision);
  const scaled = numerator * scale / denominator;
  const whole = scaled / scale;
  const fraction = (scaled % scale).toString().padStart(precision, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function orderingValue(ordering = {}) {
  const complete = ["slot", "transactionIndex", "instructionIndex"].every((key) =>
    Number.isSafeInteger(ordering[key]) && ordering[key] >= 0
  ) && Number.isSafeInteger(ordering.eventSequence) && ordering.eventSequence >= 0;
  return {
    value: {
      slot: ordering.slot ?? null,
      transaction_index: ordering.transactionIndex ?? null,
      instruction_index: ordering.instructionIndex ?? null,
      inner_instruction_index: ordering.innerInstructionIndex ?? null,
      event_sequence: ordering.eventSequence ?? 0,
      ordering_confidence: complete ? "complete" : "partial",
    },
    complete,
  };
}

function feeComponents(data, quoteMint) {
  const fields = [
    ["lp", "lp_fee"],
    ["protocol_charged", "protocol_fee"],
    ["creator_charged", "coin_creator_fee"],
    ["buyback_paid_immediately", "buyback_fee"],
    ["cashback", "cashback"],
    ["holder_rewards", "holder_rewards"],
  ];
  return fields.flatMap(([feeType, field]) => {
    const amount = uint(data[field] ?? 0n, field);
    return amount > 0n ? [{ fee_type: feeType, amount_base_units: amount.toString(), mint: quoteMint }] : [];
  });
}

function baseMarket({ baseMint, quoteMint, poolMetadata, network }) {
  if (network !== "mainnet" && network !== "devnet") throw new TypeError("unsupported network");
  if (typeof baseMint !== "string" || typeof quoteMint !== "string") {
    throw new TypeError("PumpSwap pool metadata must include base and quote mints");
  }
  return {
    chain_id: "solana",
    network,
    token_mint: baseMint,
    quote_mint: quoteMint,
    curve_program_id: PUMP_PROGRAM_ID,
    curve_account: poolMetadata.curve_account ?? null,
    program_version: null,
    idl_revision: poolMetadata.idl_revision ?? null,
    market_phase: "post_graduation",
  };
}

function baseEvent({
  eventKind,
  decodedEvent,
  signature,
  ordering,
  network,
  sourceType,
  poolMetadata,
  payload,
  warnings = [],
}) {
  const data = decodedEvent.data;
  const order = orderingValue(ordering);
  const sequence = order.value.event_sequence;
  const eventId = `${signature}:ix${order.value.instruction_index ?? "unknown"}:event${sequence}`;
  const complete = order.complete;
  const eventTime = timestampMs(data.timestamp);
  return {
    schema_version: "1.0.0",
    event_id: eventId,
    provenance: "observed_chain",
    event_kind: eventKind,
    market: baseMarket({
      baseMint: poolMetadata.base_mint,
      quoteMint: poolMetadata.quote_mint,
      poolMetadata,
      network,
    }),
    event_time_ms: eventTime,
    ordering: order.value,
    source: {
      source_type: sourceType ?? "rpc",
      source_id: signature,
      signature,
      adapter_version: "pumpswap-decoder-v1.4.0",
    },
    payload: {
      signature,
      source_event_name: decodedEvent.event_name,
      pool_address: data.pool,
      pool_program_id: PUMP_AMM_PROGRAM_ID,
      ...payload,
    },
    quality: {
      is_complete: complete,
      validation_status: complete ? "valid" : "warning",
      warnings: [
        ...warnings,
        ...(!complete ? ["transaction ordering metadata is incomplete"] : []),
      ],
      reconciliation_ref: null,
    },
  };
}

function reserveBefore(data) {
  const base = uint(data.pool_base_token_reserves, "pool_base_token_reserves");
  const quote = uint(data.pool_quote_token_reserves, "pool_quote_token_reserves");
  if (quote <= 0n) throw new RangeError("raw quote vault reserves must be positive");
  return {
    pool_base_reserves_base_units: base.toString(),
    pool_quote_reserves_base_units: quote.toString(),
    observation: "pre_swap",
  };
}

export function normalizePumpSwapTradeEvent({
  decodedEvent,
  signature,
  ordering,
  network = "mainnet",
  sourceType = "rpc",
  poolMetadata,
  instructionName = null,
}) {
  if (decodedEvent?.status !== "DECODED" ||
      !["BuyEvent", "SellEvent"].includes(decodedEvent.event_name) ||
      decodedEvent.program_id !== PUMP_AMM_PROGRAM_ID) {
    throw new TypeError("a decoded PumpSwap BuyEvent or SellEvent is required");
  }
  if (!poolMetadata) throw new TypeError("PumpSwap pool metadata is required");
  const data = decodedEvent.data;
  const isBuy = decodedEvent.event_name === "BuyEvent";
  const tokenAmount = uint(isBuy ? data.base_amount_out : data.base_amount_in, "base amount");
  const quoteCandidate = isBuy
    ? (data.user_quote_amount_in ?? data.quote_amount_in_with_lp_fee ?? data.quote_amount_in)
    : (data.user_quote_amount_out ?? data.quote_amount_out);
  const quoteAmount = uint(quoteCandidate, "user quote amount");
  if (tokenAmount === 0n || quoteAmount === 0n) throw new RangeError("PumpSwap trade amounts must be positive");

  const baseDecimals = decimals(poolMetadata.base_mint_decimals, "base_mint_decimals");
  const quoteDecimals = decimals(poolMetadata.quote_mint_decimals, "quote_mint_decimals");
  const price = ratio(
    quoteAmount * (10n ** BigInt(baseDecimals)),
    tokenAmount * (10n ** BigInt(quoteDecimals)),
  );
  const protocolFee = uint(data.protocol_fee ?? 0n, "protocol_fee");
  const creatorFee = uint(data.coin_creator_fee ?? 0n, "coin_creator_fee");
  const buybackFee = uint(data.buyback_fee ?? 0n, "buyback_fee");
  const retained = data.protocol_fee_recipient === ZERO_PUBKEY;
  const ixName = data.ix_name ?? instructionName ?? null;
  const isV2 = retained || (typeof ixName === "string" && ixName.endsWith("_v2"));
  const reserve = reserveBefore(data);

  return baseEvent({
    eventKind: isBuy ? "POOL_BUY_EXECUTED" : "POOL_SELL_EXECUTED",
    decodedEvent,
    signature,
    ordering,
    network,
    sourceType,
    poolMetadata,
    warnings: [
      "PumpSwap BuyEvent/SellEvent raw pool reserve fields are pre-swap observations; post-state must be derived from pool-vault token-account deltas",
      "The signed virtual_quote_reserves event field is checked against both pre- and post-operation fee-adjusted replay values; its timing is not assumed",
      ...(!poolMetadata.pool_base_token_account || !poolMetadata.pool_quote_token_account
        ? ["pool vault addresses are unavailable; exact reserve-delta reconciliation is incomplete"]
        : []),
    ],
    payload: {
      actor_address: data.user,
      base_mint: poolMetadata.base_mint,
      quote_mint: poolMetadata.quote_mint,
      token_amount_base_units: tokenAmount.toString(),
      quote_amount_base_units: quoteAmount.toString(),
      execution_price_decimal: price,
      side: isBuy ? "buy" : "sell",
      instruction_name: ixName,
      pool_trade_version: isV2 ? "v2" : "v1",
      fee_components: feeComponents(data, poolMetadata.quote_mint),
      fee_balances_delta: {
        protocol_fees_base_units: isV2 ? protocolFee.toString() : "0",
        creator_fees_base_units: isV2 ? creatorFee.toString() : "0",
      },
      pool_reserves_before: reserve,
      virtual_quote_reserves_reported_base_units: signed(data.virtual_quote_reserves ?? 0n, "virtual_quote_reserves").toString(),
      pool_vault_accounts: {
        base: poolMetadata.pool_base_token_account ?? null,
        quote: poolMetadata.pool_quote_token_account ?? null,
      },
      raw_amount_fields: {
        quote_amount_in: data.quote_amount_in?.toString?.() ?? null,
        quote_amount_in_with_lp_fee: data.quote_amount_in_with_lp_fee?.toString?.() ?? null,
        user_quote_amount_in: data.user_quote_amount_in?.toString?.() ?? null,
        quote_amount_out: data.quote_amount_out?.toString?.() ?? null,
        user_quote_amount_out: data.user_quote_amount_out?.toString?.() ?? null,
        lp_fee: uint(data.lp_fee ?? 0n, "lp_fee").toString(),
        protocol_fee: protocolFee.toString(),
        creator_fee: creatorFee.toString(),
        buyback_fee: buybackFee.toString(),
      },
    },
  });
}

export function normalizePumpSwapLiquidityEvent({
  decodedEvent,
  signature,
  ordering,
  network = "mainnet",
  sourceType = "rpc",
  poolMetadata,
}) {
  if (decodedEvent?.status !== "DECODED" ||
      !["DepositEvent", "WithdrawEvent"].includes(decodedEvent.event_name) ||
      decodedEvent.program_id !== PUMP_AMM_PROGRAM_ID) {
    throw new TypeError("a decoded PumpSwap DepositEvent or WithdrawEvent is required");
  }
  if (!poolMetadata) throw new TypeError("PumpSwap pool metadata is required");
  const data = decodedEvent.data;
  const isDeposit = decodedEvent.event_name === "DepositEvent";
  const baseAmount = uint(isDeposit ? data.base_amount_in : data.base_amount_out, "base liquidity amount");
  const quoteAmount = uint(isDeposit ? data.quote_amount_in : data.quote_amount_out, "quote liquidity amount");
  return baseEvent({
    eventKind: isDeposit ? "POOL_LIQUIDITY_ADDED" : "POOL_LIQUIDITY_REMOVED",
    decodedEvent,
    signature,
    ordering,
    network,
    sourceType,
    poolMetadata,
    warnings: ["liquidity event reserve fields are pre-operation observations; use pool-vault token-account deltas to derive post-state"],
    payload: {
      actor_address: data.user,
      base_mint: poolMetadata.base_mint,
      quote_mint: poolMetadata.quote_mint,
      base_amount_base_units: baseAmount.toString(),
      quote_amount_base_units: quoteAmount.toString(),
      lp_token_amount_base_units: uint(isDeposit ? data.lp_token_amount_out : data.lp_token_amount_in, "lp token amount").toString(),
      pool_reserves_before: reserveBefore(data),
      pool_vault_accounts: {
        base: poolMetadata.pool_base_token_account ?? null,
        quote: poolMetadata.pool_quote_token_account ?? null,
      },
    },
  });
}

export function normalizePumpSwapFeeSweepEvent({
  decodedEvent,
  signature,
  ordering,
  network = "mainnet",
  sourceType = "rpc",
  poolMetadata,
}) {
  if (decodedEvent?.status !== "DECODED" ||
      decodedEvent.event_name !== "SweepPoolFeeEvent" ||
      decodedEvent.program_id !== PUMP_AMM_PROGRAM_ID) {
    throw new TypeError("a decoded PumpSwap SweepPoolFeeEvent is required");
  }
  const data = decodedEvent.data;
  const metadata = poolMetadata ?? {
    base_mint: data.base_mint,
    quote_mint: data.quote_mint,
    base_mint_decimals: null,
    quote_mint_decimals: null,
    curve_account: null,
    idl_revision: null,
  };
  const event = baseEvent({
    eventKind: "POOL_FEE_MOVEMENT",
    decodedEvent,
    signature,
    ordering,
    network,
    sourceType,
    poolMetadata: metadata,
    payload: {
      base_mint: data.base_mint,
      quote_mint: data.quote_mint,
      recipient_address: data.recipient,
      payer_address: data.payer,
      amount_base_units: uint(data.amount, "amount").toString(),
      fee_bucket: Number(data.bucket),
      pool_vault_accounts: {
        base: metadata.pool_base_token_account ?? null,
        quote: metadata.pool_quote_token_account ?? null,
      },
    },
  });
  return event;
}


export function normalizePumpSwapBoostBuyAndBurnEvent({
  decodedEvent,
  signature,
  ordering,
  network = "mainnet",
  sourceType = "rpc",
  poolMetadata,
}) {
  if (decodedEvent?.status !== "DECODED" ||
      decodedEvent.event_name !== "BoostBuyAndBurnEvent" ||
      decodedEvent.program_id !== PUMP_AMM_PROGRAM_ID) {
    throw new TypeError("a decoded PumpSwap BoostBuyAndBurnEvent is required");
  }
  if (!poolMetadata) throw new TypeError("PumpSwap pool metadata is required");
  const data = decodedEvent.data;
  if (data.pool !== poolMetadata.pool_address || data.mint !== poolMetadata.base_mint) {
    throw new Error("PumpSwap boost event pool or mint does not match the resolved Pool account");
  }
  return baseEvent({
    eventKind: "POOL_BOOST_BUY_BURN",
    decodedEvent,
    signature,
    ordering,
    network,
    sourceType,
    poolMetadata,
    warnings: [
      "boost buy-and-burn is a protocol-driven pool state transition, not user swap volume",
      "post-operation pool reserves are reconciled against transaction pool-vault token-account deltas",
    ],
    payload: {
      actor_address: data.authority,
      base_mint: poolMetadata.base_mint,
      quote_mint: poolMetadata.quote_mint,
      quote_amount_base_units: uint(data.quote_amount_in_used, "quote_amount_in_used").toString(),
      quote_amount_requested_base_units: uint(data.quote_amount_in_requested, "quote_amount_in_requested").toString(),
      token_amount_base_units: uint(data.base_amount_burned, "base_amount_burned").toString(),
      pool_reserves_after: {
        pool_base_reserves_base_units: uint(data.base_reserves_after, "base_reserves_after").toString(),
        pool_quote_reserves_base_units: uint(data.real_quote_reserves_after, "real_quote_reserves_after").toString(),
      },
      virtual_quote_reserves_reported_base_units: signed(data.virtual_quote_reserves, "virtual_quote_reserves").toString(),
      boost_vault_remaining_base_units: uint(data.boost_vault_remaining, "boost_vault_remaining").toString(),
      pool_vault_accounts: {
        base: poolMetadata.pool_base_token_account ?? null,
        quote: poolMetadata.pool_quote_token_account ?? null,
      },
    },
  });
}
