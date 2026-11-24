import {
  PUMP_PROGRAM_ID,
  PUMP_FEES_PROGRAM_ID,
  PUMP_AMM_PROGRAM_ID,
  decodeProgramEvent,
  decodeProgramInstruction,
  decodeProgramDataLogs,
  getProgramInstructionAccountNames,
} from "./pump-decoder.mjs";
import { normalizePumpTradeEvent } from "./pump-event-normalizer.mjs";
import {
  normalizePumpCreateEvent,
  normalizePumpCompleteEvent,
  normalizePumpPostCompleteBuyEvent,
  normalizePumpMigrationEvent,
  normalizePumpAmmCreatePoolEvent,
  normalizePumpFeeSweepEvent,
  normalizePumpFeeConfigChangeEvent,
} from "./pump-lifecycle-normalizer.mjs";
import { extractTransactionBalanceDeltas, reconcilePumpTradesWithTransaction } from "./transaction-reconciler.mjs";
import {
  normalizePumpSwapTradeEvent,
  normalizePumpSwapLiquidityEvent,
  normalizePumpSwapFeeSweepEvent,
  normalizePumpSwapBoostBuyAndBurnEvent,
} from "./pump-swap-normalizer.mjs";

function getAccountKeys(transaction) {
  const message = transaction?.transaction?.message ?? transaction?.message;
  const staticKeys = (message?.accountKeys ?? []).map((key) =>
    typeof key === "string" ? key : key.pubkey
  );
  const loaded = transaction?.meta?.loadedAddresses ?? {};
  return [
    ...staticKeys,
    ...(loaded.writable ?? []),
    ...(loaded.readonly ?? []),
  ];
}

function accountAddress(indexOrAddress, keys) {
  if (typeof indexOrAddress === "string") return indexOrAddress;
  if (Number.isSafeInteger(indexOrAddress)) return keys[indexOrAddress] ?? null;
  return null;
}

function decodeInstruction(ix, { keys, outerIndex, innerIndex }) {
  const programId = ix.programId ?? keys[ix.programIdIndex] ?? null;
  if (!programId || typeof ix.data !== "string") {
    return { status: "UNSUPPORTED_INSTRUCTION_ENCODING", program_id: programId, outer_instruction_index: outerIndex, inner_instruction_index: innerIndex };
  }
  if (![PUMP_PROGRAM_ID, PUMP_FEES_PROGRAM_ID, PUMP_AMM_PROGRAM_ID].includes(programId)) return null;

  let decoded;
  try {
    decoded = decodeProgramInstruction({ programId, data: ix.data, encoding: "base58" });
  } catch (error) {
    return {
      status: "INSTRUCTION_DECODE_ERROR",
      program_id: programId,
      outer_instruction_index: outerIndex,
      inner_instruction_index: innerIndex,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  if (decoded.status !== "DECODED" && decoded.status !== "DECODED_WITH_OMITTED_OPTIONAL_ARGS") {
    return { ...decoded, outer_instruction_index: outerIndex, inner_instruction_index: innerIndex };
  }

  const addresses = (ix.accounts ?? []).map((item) => accountAddress(item, keys));
  const names = getProgramInstructionAccountNames(programId, decoded.instruction_name) ?? [];
  const accounts = {};
  names.forEach((name, index) => {
    if (addresses[index]) accounts[name] = addresses[index];
  });
  return {
    ...decoded,
    outer_instruction_index: outerIndex,
    inner_instruction_index: innerIndex,
    account_addresses: addresses,
    accounts,
    mint: accounts.mint ?? accounts.base_mint ?? null,
    curve_account: accounts.bonding_curve ?? null,
  };
}

function decodeTransactionInstructions(transaction) {
  const message = transaction?.transaction?.message ?? transaction?.message;
  const keys = getAccountKeys(transaction);
  const outer = message?.instructions ?? [];
  const decoded = [];
  for (let index = 0; index < outer.length; index += 1) {
    const item = decodeInstruction(outer[index], { keys, outerIndex: index, innerIndex: null });
    if (item) decoded.push(item);
  }
  for (const group of transaction?.meta?.innerInstructions ?? []) {
    const outerIndex = group.index;
    for (let innerIndex = 0; innerIndex < (group.instructions ?? []).length; innerIndex += 1) {
      const item = decodeInstruction(group.instructions[innerIndex], { keys, outerIndex, innerIndex });
      if (item) decoded.push(item);
    }
  }
  return decoded;
}

function mapLogOrdering(logs) {
  const stack = [];
  const byLogIndex = new Map();
  let outerIndex = -1;
  let innerIndex = -1;
  for (let logIndex = 0; logIndex < logs.length; logIndex += 1) {
    const line = logs[logIndex];
    if (typeof line !== "string") continue;
    const invoke = line.match(/^Program ([1-9A-HJ-NP-Za-km-z]+) invoke \[(\d+)\]/);
    if (invoke) {
      const depth = Number(invoke[2]);
      if (depth === 1) {
        outerIndex += 1;
        innerIndex = -1;
        stack.length = 0;
        stack.push({ programId: invoke[1], outerIndex, innerIndex: null });
      } else {
        innerIndex += 1;
        stack.push({ programId: invoke[1], outerIndex, innerIndex });
      }
      continue;
    }
    const exit = line.match(/^Program ([1-9A-HJ-NP-Za-km-z]+) (?:success|failed:)/);
    if (exit) {
      let position = stack.length - 1;
      while (position >= 0 && stack[position].programId !== exit[1]) position -= 1;
      if (position >= 0) stack.splice(position);
      continue;
    }
    if (line.startsWith("Program data: ") && stack.length > 0) {
      byLogIndex.set(logIndex, { ...stack.at(-1) });
    }
  }
  return byLogIndex;
}

function relatedProgramInstruction(instructions, logOrder, programId) {
  if (!logOrder || !Number.isSafeInteger(logOrder.outerIndex)) return null;
  return instructions.find((instruction) =>
    instruction.program_id === programId &&
    instruction.outer_instruction_index === logOrder.outerIndex &&
    instruction.status.startsWith("DECODED")
  ) ?? null;
}

function poolMetadataForEvent({
  poolAddress,
  data,
  instructions,
  logOrder,
  poolMetadataByAddress,
  tokenDecimalsByMint,
  quoteDecimalsByMint,
  transaction,
}) {
  const known = poolMetadataByAddress instanceof Map
    ? poolMetadataByAddress.get(poolAddress)
    : poolMetadataByAddress?.[poolAddress];
  const related = relatedProgramInstruction(instructions, logOrder, PUMP_AMM_PROGRAM_ID);
  const baseMint = known?.base_mint ?? data.base_mint ?? related?.accounts?.base_mint ?? null;
  const quoteMint = known?.quote_mint ?? data.quote_mint ?? related?.accounts?.quote_mint ?? null;
  const baseDecimals = known?.base_mint_decimals ??
    (baseMint ? tokenDecimalsByMint[baseMint] ?? tokenDecimalsFromTransaction(transaction, baseMint) : null);
  const quoteDecimals = known?.quote_mint_decimals ??
    (quoteMint === "So11111111111111111111111111111111111111112"
      ? 9
      : quoteMint
        ? quoteDecimalsByMint[quoteMint] ?? tokenDecimalsByMint[quoteMint] ?? tokenDecimalsFromTransaction(transaction, quoteMint)
        : null);
  return {
    ...known,
    pool_address: poolAddress,
    base_mint: baseMint,
    quote_mint: quoteMint,
    base_mint_decimals: baseDecimals,
    quote_mint_decimals: quoteDecimals,
    pool_base_token_account: known?.pool_base_token_account ?? related?.accounts?.pool_base_token_account ?? null,
    pool_quote_token_account: known?.pool_quote_token_account ?? related?.accounts?.pool_quote_token_account ?? null,
  };
}

const NON_MARKET_PUMP_AMM_EVENTS = new Set([
  "AdminCtoPoolEvent",
  "AdminUpdateTokenIncentivesEvent",
  "ClaimCashbackEvent",
  "ClaimTokenIncentivesEvent",
  "CloseUserVolumeAccumulatorEvent",
  "CollectCoinCreatorFeeEvent",
  "CreateConfigEvent",
  "DisableEvent",
  "ExtendAccountEvent",
  "InitBoostEvent",
  "InitUserVolumeAccumulatorEvent",
  "MigratePoolCoinCreatorEvent",
  "ReservedFeeRecipientsEvent",
  "SetBondingCurveCoinCreatorEvent",
  "SetBoostAuthorityEvent",
  "SetMetaplexCoinCreatorEvent",
  "SyncUserVolumeAccumulatorEvent",
  "UpdateAdminEvent",
  "UpdateCreatorFeeConfigEvent",
  "UpdateFeeConfigEvent",
  "WithdrawEvent",
]);

function tokenDecimalsFromTransaction(transaction, mint) {
  const balances = [
    ...(transaction?.meta?.preTokenBalances ?? []),
    ...(transaction?.meta?.postTokenBalances ?? []),
  ];
  const match = balances.find((item) => item.mint === mint && Number.isInteger(item.uiTokenAmount?.decimals));
  return match?.uiTokenAmount.decimals ?? null;
}

function makeOrdering({ slot, transactionIndex, logOrder, eventSequence }) {
  return {
    slot: Number.isSafeInteger(slot) ? slot : null,
    transactionIndex: Number.isSafeInteger(transactionIndex) ? transactionIndex : null,
    instructionIndex: Number.isSafeInteger(logOrder?.outerIndex) ? logOrder.outerIndex : null,
    innerInstructionIndex: Number.isSafeInteger(logOrder?.innerIndex) ? logOrder.innerIndex : null,
    eventSequence,
  };
}

function relatedInstruction(instructions, logOrder, mint) {
  if (!logOrder || !Number.isSafeInteger(logOrder.outerIndex)) return null;
  return instructions.find((instruction) =>
    instruction.program_id === PUMP_PROGRAM_ID &&
    instruction.outer_instruction_index === logOrder.outerIndex &&
    instruction.mint === mint &&
    instruction.status.startsWith("DECODED")
  ) ?? instructions.find((instruction) =>
    instruction.program_id === PUMP_PROGRAM_ID &&
    instruction.outer_instruction_index === logOrder.outerIndex &&
    instruction.status.startsWith("DECODED")
  ) ?? null;
}

export function decodePumpTransaction({
  transaction,
  signature,
  transactionIndex = null,
  network = "mainnet",
  tokenDecimalsByMint = {},
  quoteDecimalsByMint = {},
  poolMetadataByAddress = {},
  sourceType = "rpc",
}) {
  if (!transaction || !transaction.meta) throw new TypeError("a full Solana transaction with metadata is required");
  const resolvedSignature = signature ?? transaction.transaction?.signatures?.[0];
  if (typeof resolvedSignature !== "string" || resolvedSignature.length === 0) {
    throw new TypeError("transaction signature is required");
  }
  const meta = transaction.meta;
  const logs = meta.logMessages ?? [];
  const decodedInstructions = decodeTransactionInstructions(transaction);
  const logOrdering = mapLogOrdering(logs);

  const programEvents = [
    ...decodeProgramDataLogs(logs, PUMP_PROGRAM_ID),
    ...decodeProgramDataLogs(logs, PUMP_FEES_PROGRAM_ID),
    ...decodeProgramDataLogs(logs, PUMP_AMM_PROGRAM_ID),
  ].sort((a, b) => (a.log_index ?? 0) - (b.log_index ?? 0));

  let eventSequence = 0;
  const decodedEvents = programEvents.map((event) => {
    const logOrder = logOrdering.get(event.log_index) ?? null;
    return {
      ...event,
      transaction_signature: resolvedSignature,
      slot: transaction.slot ?? null,
      transaction_index: transactionIndex,
      outer_instruction_index: logOrder?.outerIndex ?? null,
      inner_instruction_index: logOrder?.innerIndex ?? null,
      event_sequence: eventSequence++,
    };
  });

  if (meta.err !== null && meta.err !== undefined) {
    return {
      status: "FAILED_TRANSACTION",
      signature: resolvedSignature,
      slot: transaction.slot ?? null,
      transaction_index: transactionIndex,
      transaction_error: meta.err,
      decoded_instructions: decodedInstructions,
      decoded_events: decodedEvents,
      events: [],
      unresolved_events: [],
      balance_deltas: extractTransactionBalanceDeltas(transaction),
    };
  }

  const events = [];
  const unresolvedEvents = [];
  for (const decoded of decodedEvents) {
    if (decoded.status !== "DECODED") {
      unresolvedEvents.push({ event_name: decoded.event_name ?? null, status: decoded.status, log_index: decoded.log_index });
      continue;
    }
    const ordering = makeOrdering({
      slot: transaction.slot,
      transactionIndex,
      logOrder: logOrdering.get(decoded.log_index),
      eventSequence: decoded.event_sequence,
    });
    const context = {
      decodedEvent: decoded,
      signature: resolvedSignature,
      ordering,
      network,
      sourceType,
    };

    try {
      switch (decoded.event_name) {
        case "TradeEvent": {
          const mint = decoded.data.mint;
          const related = relatedInstruction(decodedInstructions, logOrdering.get(decoded.log_index), mint);
          const decimals = tokenDecimalsByMint[mint] ?? tokenDecimalsFromTransaction(transaction, mint);
          if (!Number.isInteger(decimals)) {
            unresolvedEvents.push({
              event_name: decoded.event_name,
              status: "MISSING_TOKEN_DECIMALS",
              mint,
              log_index: decoded.log_index,
              decoded_event: decoded,
            });
            break;
          }
          events.push(normalizePumpTradeEvent({
            ...context,
            tokenDecimals: decimals,
            quoteDecimals: 9,
            curveAccount: related?.curve_account ?? null,
            instructionName: related?.instruction_name ?? decoded.data.ix_name ?? null,
          }));
          break;
        }
        case "BuyEvent":
        case "SellEvent": {
          const poolAddress = decoded.data.pool;
          const poolMetadata = poolMetadataForEvent({
            poolAddress,
            data: decoded.data,
            instructions: decodedInstructions,
            logOrder: logOrdering.get(decoded.log_index),
            poolMetadataByAddress,
            tokenDecimalsByMint,
            quoteDecimalsByMint,
            transaction,
          });
          if (!poolMetadata.base_mint || !poolMetadata.quote_mint ||
              !Number.isInteger(poolMetadata.base_mint_decimals) ||
              !Number.isInteger(poolMetadata.quote_mint_decimals)) {
            unresolvedEvents.push({
              event_name: decoded.event_name,
              status: "MISSING_PUMPSWAP_POOL_METADATA",
              pool: poolAddress,
              log_index: decoded.log_index,
              decoded_event: decoded,
            });
            break;
          }
          const related = relatedProgramInstruction(decodedInstructions, logOrdering.get(decoded.log_index), PUMP_AMM_PROGRAM_ID);
          events.push(normalizePumpSwapTradeEvent({
            ...context,
            poolMetadata,
            instructionName: related?.instruction_name ?? null,
          }));
          break;
        }
        case "DepositEvent":
        case "WithdrawEvent": {
          const poolAddress = decoded.data.pool;
          const poolMetadata = poolMetadataForEvent({
            poolAddress,
            data: decoded.data,
            instructions: decodedInstructions,
            logOrder: logOrdering.get(decoded.log_index),
            poolMetadataByAddress,
            tokenDecimalsByMint,
            quoteDecimalsByMint,
            transaction,
          });
          if (!poolMetadata.base_mint || !poolMetadata.quote_mint) {
            unresolvedEvents.push({
              event_name: decoded.event_name,
              status: "MISSING_PUMPSWAP_POOL_METADATA",
              pool: poolAddress,
              log_index: decoded.log_index,
              decoded_event: decoded,
            });
            break;
          }
          events.push(normalizePumpSwapLiquidityEvent({ ...context, poolMetadata }));
          break;
        }
        case "BoostBuyAndBurnEvent": {
          const poolAddress = decoded.data.pool;
          const poolMetadata = poolMetadataForEvent({
            poolAddress,
            data: decoded.data,
            instructions: decodedInstructions,
            logOrder: logOrdering.get(decoded.log_index),
            poolMetadataByAddress,
            tokenDecimalsByMint,
            quoteDecimalsByMint,
            transaction,
          });
          if (!poolMetadata.base_mint || !poolMetadata.quote_mint) {
            unresolvedEvents.push({
              event_name: decoded.event_name,
              status: "MISSING_PUMPSWAP_POOL_METADATA",
              pool: poolAddress,
              log_index: decoded.log_index,
              decoded_event: decoded,
            });
            break;
          }
          events.push(normalizePumpSwapBoostBuyAndBurnEvent({ ...context, poolMetadata }));
          break;
        }
        case "SweepPoolFeeEvent": {
          const poolAddress = decoded.data.pool;
          const poolMetadata = poolMetadataForEvent({
            poolAddress,
            data: decoded.data,
            instructions: decodedInstructions,
            logOrder: logOrdering.get(decoded.log_index),
            poolMetadataByAddress,
            tokenDecimalsByMint,
            quoteDecimalsByMint,
            transaction,
          });
          events.push(normalizePumpSwapFeeSweepEvent({ ...context, poolMetadata }));
          break;
        }
        case "CreateEvent":
          events.push(normalizePumpCreateEvent(context));
          break;
        case "CompleteEvent":
          events.push(normalizePumpCompleteEvent(context));
          break;
        case "PostCompleteBuyEvent": {
          const mint = decoded.data.mint;
          const decimals = tokenDecimalsByMint[mint] ?? tokenDecimalsFromTransaction(transaction, mint);
          if (!Number.isInteger(decimals)) {
            unresolvedEvents.push({ event_name: decoded.event_name, status: "MISSING_TOKEN_DECIMALS", mint, log_index: decoded.log_index, decoded_event: decoded });
            break;
          }
          events.push(normalizePumpPostCompleteBuyEvent({ ...context, tokenDecimals: decimals, quoteDecimals: 9 }));
          break;
        }
        case "CompletePumpAmmMigrationEvent":
          events.push(normalizePumpMigrationEvent(context));
          break;
        case "CreatePoolEvent":
          events.push(normalizePumpAmmCreatePoolEvent(context));
          break;
        case "SweepBondingCurveFeeEvent":
          events.push(normalizePumpFeeSweepEvent(context));
          break;
        default:
          if (decoded.program_id === PUMP_FEES_PROGRAM_ID) {
            events.push(normalizePumpFeeConfigChangeEvent(context));
          } else if (decoded.program_id === PUMP_AMM_PROGRAM_ID && NON_MARKET_PUMP_AMM_EVENTS.has(decoded.event_name)) {
            break;
          } else {
            unresolvedEvents.push({ event_name: decoded.event_name, status: "UNHANDLED_EVENT", log_index: decoded.log_index, decoded_event: decoded });
          }
      }
    } catch (error) {
      unresolvedEvents.push({
        event_name: decoded.event_name,
        status: error.code ?? "NORMALIZATION_ERROR",
        error: error instanceof Error ? error.message : String(error),
        log_index: decoded.log_index,
        decoded_event: decoded,
      });
    }
  }

  const balanceDeltas = extractTransactionBalanceDeltas(transaction);
  const treasuryTradeGroups = new Map();
  for (const event of events) {
    if (event.event_kind !== "CURVE_BUY_EXECUTED" && event.event_kind !== "CURVE_SELL_EXECUTED") continue;
    const actor = event.payload?.actor_address;
    const mint = event.market?.token_mint;
    const key = `${actor ?? "unknown"}:${mint ?? "unknown"}`;
    if (!treasuryTradeGroups.has(key)) treasuryTradeGroups.set(key, []);
    treasuryTradeGroups.get(key).push(event);
  }

  for (const group of treasuryTradeGroups.values()) {
    const sides = new Set(group.map((event) => event.event_kind));
    let reconciliation;
    if (sides.size !== 1 || !group[0].payload?.actor_address) {
      reconciliation = {
        status: "UNKNOWN",
        reason: "mixed_sides_or_missing_actor_in_transaction",
        checks: [],
      };
    } else {
      reconciliation = reconcilePumpTradesWithTransaction({ transaction, tradeEvents: group });
    }

    for (const event of group) {
      event.status = reconciliation.status === "PASS" ? "CONFIRMED" : "UNVERIFIED";
      event.quality = {
        ...event.quality,
        transaction_reconciliation: {
          status: reconciliation.status,
          reason: reconciliation.reason,
          checks: reconciliation.checks,
        },
        reconciliation_ref: resolvedSignature,
      };
      event.payload.transaction_costs = {
        signature: resolvedSignature,
        fee_payer_address: balanceDeltas.fee_payer_address,
        fee_lamports: balanceDeltas.fee_lamports,
      };
      if (reconciliation.status === "PASS") {
        const warnings = (event.quality.warnings ?? []).filter((warning) =>
          warning !== "TradeEvent has not yet been reconciled with authoritative transaction account deltas"
        );
        event.quality.warnings = warnings;
        event.quality.is_complete = warnings.length === 0;
        event.quality.validation_status = warnings.length === 0 ? "valid" : "warning";
      } else {
        event.quality.warnings = [
          ...(event.quality.warnings ?? []),
          "Treasury PnL must ignore this event until transaction balance reconciliation passes",
        ];
        event.quality.is_complete = false;
        event.quality.validation_status = "warning";
      }
    }
  }

  return {
    status: unresolvedEvents.length > 0 ? "PARTIAL" : events.length > 0 ? "DECODED" : "NO_PUMP_EVENTS",
    signature: resolvedSignature,
    slot: transaction.slot ?? null,
    transaction_index: transactionIndex,
    block_time: transaction.blockTime ?? null,
    decoded_instructions: decodedInstructions,
    decoded_events: decodedEvents,
    events,
    unresolved_events: unresolvedEvents,
    balance_deltas: balanceDeltas,
  };
}

export function findTransactionIndexInBlock(block, signature) {
  if (!block || !Array.isArray(block.transactions)) return null;
  const index = block.transactions.findIndex((entry) =>
    entry.transaction?.signatures?.includes(signature)
  );
  return index >= 0 ? index : null;
}
