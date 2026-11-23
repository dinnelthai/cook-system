import { PublicKey } from "@solana/web3.js";
import {
  PUMP_PROGRAM_ID,
  PUMP_FEE_CONFIG_PDA,
  getPumpIdlSnapshotMetadata,
} from "./pump-decoder.mjs";
import { createRpcClientFromEnv } from "./solana-rpc.mjs";
import {
  decodeMintAccount,
  decodeBondingCurveAccount,
  bondingCurveSnapshotState,
  normalizeBondingCurveMarket,
} from "./pump-account-codec.mjs";
import { decodePumpTransaction, findTransactionIndexInBlock } from "./pump-transaction-parser.mjs";
import { reconcilePumpTradesWithTransaction, reconcileCurveStateSnapshot } from "./transaction-reconciler.mjs";
import { createInitialCurveStateFromMarketCreated, replayCurveEvents } from "../../core/market-state.mjs";
import { buildRawCandles } from "../../core/candle-builder.mjs";
import { fetchPumpFeeConfigHistory } from "./pump-fee-history.mjs";

export function derivePumpBondingCurveAddress(mint) {
  const mintKey = new PublicKey(mint);
  const programKey = new PublicKey(PUMP_PROGRAM_ID);
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mintKey.toBuffer()],
    programKey,
  );
  return address.toBase58();
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

async function collectSignatures(rpc, address, {
  maxSignatures = 10_000,
  pageSize = 1000,
  until = null,
  commitment = "confirmed",
} = {}) {
  const signatures = [];
  let before;
  let reachedUntil = false;
  let exhausted = false;
  if (!Number.isSafeInteger(maxSignatures) || maxSignatures < 1) throw new RangeError("maxSignatures must be positive");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new RangeError("pageSize must be between 1 and 1000");
  while (signatures.length < maxSignatures) {
    const requested = Math.min(pageSize, maxSignatures - signatures.length);
    const page = await rpc.getSignaturesForAddress(address, {
      commitment,
      limit: requested,
      before,
      until,
    });
    if (!Array.isArray(page) || page.length === 0) {
      exhausted = true;
      break;
    }
    signatures.push(...page);
    if (until && page.some((item) => item.signature === until)) {
      reachedUntil = true;
      break;
    }
    before = page.at(-1).signature;
    if (page.length < requested) {
      exhausted = true;
      break;
    }
    if (signatures.length >= maxSignatures) break;
  }
  return {
    signatures,
    coverage_complete: exhausted || reachedUntil,
    stopped_at_limit: signatures.length >= maxSignatures && !exhausted && !reachedUntil,
    reached_until: reachedUntil,
  };
}

async function getTransactions(rpc, signatures, concurrency = 5) {
  return mapLimit(signatures, concurrency, async (item) => {
    try {
      const transaction = await rpc.getTransaction(item.signature);
      return { signature: item.signature, transaction, status: transaction ? "FETCHED" : "PRUNED_OR_UNAVAILABLE" };
    } catch (error) {
      return { signature: item.signature, transaction: null, status: "RPC_ERROR", error: error.message };
    }
  });
}

async function addTransactionIndexes(rpc, fetched) {
  const slots = [...new Set(fetched.map((item) => item.transaction?.slot).filter(Number.isSafeInteger))];
  const blocks = new Map();
  await mapLimit(slots, 3, async (slot) => {
    try {
      blocks.set(slot, await rpc.getBlock(slot));
    } catch {
      blocks.set(slot, null);
    }
  });
  return fetched.map((item) => {
    if (!item.transaction) return { ...item, transaction_index: null };
    const block = blocks.get(item.transaction.slot);
    return {
      ...item,
      transaction_index: findTransactionIndexInBlock(block, item.signature),
      block_available: Boolean(block),
    };
  });
}

function attachTransactionReconciliation(parsed, transaction) {
  const trades = parsed.events.filter((event) =>
    event.event_kind === "CURVE_BUY_EXECUTED" || event.event_kind === "CURVE_SELL_EXECUTED"
  );
  if (trades.length === 0) return parsed;
  const reconciliation = reconcilePumpTradesWithTransaction({ transaction, tradeEvents: trades });
  for (const event of trades) {
    event.quality.transaction_balance_reconciliation = reconciliation;
    if (reconciliation.status === "PASS") {
      event.quality.is_complete = true;
      event.quality.validation_status = "valid";
      event.quality.reconciliation_ref = `${parsed.signature}:balance-delta`;
      event.quality.warnings = (event.quality.warnings ?? []).filter((warning) =>
        !warning.includes("not yet been reconciled")
      );
    } else {
      event.quality.is_complete = false;
      event.quality.validation_status = reconciliation.status === "INVALID" ? "invalid" : "warning";
      event.quality.warnings = [
        ...(event.quality.warnings ?? []),
        `transaction balance reconciliation: ${reconciliation.status} (${reconciliation.reason})`,
      ];
    }
  }
  return parsed;
}

export async function fetchPumpMintHistory({
  rpc,
  mint,
  network = "mainnet",
  maxSignatures = 10_000,
  pageSize = 1000,
  concurrency = 5,
  until = null,
  commitment = "confirmed",
  includeRawTransactions = false,
  includeFeeConfigHistory = false,
  feeConfigBaselineSnapshotRecord = null,
} = {}) {
  if (!rpc || typeof rpc.getTransaction !== "function") throw new TypeError("Solana RPC client is required");
  if (typeof mint !== "string" || mint.length === 0) throw new TypeError("mint is required");
  const curveAddress = derivePumpBondingCurveAddress(mint);

  const [mintInfo, curveInfo, signatureCollection, feeConfigHistory] = await Promise.all([
    rpc.getAccountInfo(mint, { commitment }),
    rpc.getAccountInfo(curveAddress, { commitment }),
    collectSignatures(rpc, curveAddress, { maxSignatures, pageSize, until, commitment }),
    includeFeeConfigHistory
      ? fetchPumpFeeConfigHistory({ rpc, initialSnapshotRecord: feeConfigBaselineSnapshotRecord, maxSignatures: Math.min(maxSignatures, 20_000), pageSize, concurrency, commitment, network })
      : Promise.resolve(null),
  ]);

  const mintMetadata = decodeMintAccount(mintInfo);
  const decodedCurve = curveInfo?.value ? decodeBondingCurveAccount({ ...curveInfo, address: curveAddress }) : null;
  const signatureRecords = signatureCollection.signatures;
  const fetched = await getTransactions(rpc, signatureRecords, concurrency);
  const indexed = await addTransactionIndexes(rpc, fetched);

  const ordered = indexed.sort((a, b) => {
    const slotA = a.transaction?.slot ?? Number.MAX_SAFE_INTEGER;
    const slotB = b.transaction?.slot ?? Number.MAX_SAFE_INTEGER;
    if (slotA !== slotB) return slotA - slotB;
    return (a.transaction_index ?? Number.MAX_SAFE_INTEGER) - (b.transaction_index ?? Number.MAX_SAFE_INTEGER);
  });

  const parsedTransactions = [];
  const allEvents = [];
  const dataGaps = [];
  for (const item of ordered) {
    if (!item.transaction) {
      dataGaps.push({
        signature: item.signature,
        status: item.status,
        error: item.error ?? null,
      });
      continue;
    }
    const parsed = decodePumpTransaction({
      transaction: item.transaction,
      signature: item.signature,
      transactionIndex: item.transaction_index,
      network,
      tokenDecimalsByMint: { [mint]: mintMetadata.decimals },
      sourceType: "rpc",
    });
    attachTransactionReconciliation(parsed, item.transaction);
    parsedTransactions.push({
      signature: item.signature,
      slot: item.transaction.slot,
      transaction_index: item.transaction_index,
      status: parsed.status,
      event_count: parsed.events.length,
      unresolved_count: parsed.unresolved_events.length,
      parser_result: parsed,
      ...(includeRawTransactions ? { raw_transaction: item.transaction } : {}),
    });
    allEvents.push(...parsed.events);
    if (!item.block_available || item.transaction_index === null) {
      dataGaps.push({
        signature: item.signature,
        slot: item.transaction.slot,
        status: "TRANSACTION_INDEX_UNAVAILABLE",
      });
    }
  }

  const curveQuoteMint = decodedCurve?.data?.quote_mint;
  if (curveQuoteMint && curveQuoteMint !== "11111111111111111111111111111111" && curveQuoteMint !== "So11111111111111111111111111111111111111112") {
    const error = new Error(`unsupported quote mint for current SOL-only history collector: ${curveQuoteMint}`);
    error.code = "UNSUPPORTED_QUOTE_MINT";
    throw error;
  }
  const market = normalizeBondingCurveMarket({
    mint,
    network,
    curveAccount: curveAddress,
    idlRevision: getPumpIdlSnapshotMetadata().pump_idl_blob_sha,
  });
  const creationEvent = allEvents.find((event) => event.event_kind === "MARKET_CREATED");
  let replay = null;
  let snapshotReconciliation = null;
  let replayStatus = "NO_CREATION_EVENT";

  if (creationEvent) {
    const initialState = createInitialCurveStateFromMarketCreated({ marketCreatedEvent: creationEvent });
    const curveEvents = allEvents.filter((event) =>
      event.market.token_mint === mint &&
      event.market.curve_program_id === PUMP_PROGRAM_ID
    );
    const hasPartialOrder = curveEvents.some((event) => event.ordering.ordering_confidence !== "complete");
    if (!hasPartialOrder && signatureCollection.coverage_complete && dataGaps.length === 0) {
      replay = replayCurveEvents(initialState, curveEvents);
      replayStatus = "REPLAYED_FULL_HISTORY";
      if (decodedCurve && replay.state.lifecycle !== "graduated") {
        snapshotReconciliation = reconcileCurveStateSnapshot({
          replayedState: replay.state,
          decodedBondingCurve: decodedCurve,
        });
      } else if (decodedCurve) {
        snapshotReconciliation = {
          status: "NOT_COMPARABLE_AFTER_MIGRATION",
          reason: "current curve account is migrated or replay has reached the graduation lifecycle",
        };
      }
    } else {
      replayStatus = "PARTIAL_HISTORY";
    }
  }

  const candleEvents = allEvents.filter((event) => event.market.token_mint === mint && event.market.curve_program_id === PUMP_PROGRAM_ID);
  const candleOrderComplete = candleEvents
    .filter((event) => event.event_kind === "CURVE_BUY_EXECUTED" || event.event_kind === "CURVE_SELL_EXECUTED")
    .every((event) => event.ordering.ordering_confidence === "complete");
  const candles = candleOrderComplete ? buildRawCandles(candleEvents, 60_000) : [];
  const candleStatus = candleOrderComplete ? "AVAILABLE" : "INCOMPLETE_CHAIN_ORDER";

  return {
    schema_version: "1.0.0",
    status: replayStatus,
    market,
    bonding_curve_address: curveAddress,
    mint_metadata: mintMetadata,
    current_curve_account: decodedCurve,
    signature_coverage: {
      ...signatureCollection,
      fetched_transactions: fetched.filter((item) => item.transaction).length,
      missing_transactions: dataGaps.length,
    },
    data_gaps: dataGaps,
    transactions: parsedTransactions,
    events: allEvents,
    replay: replay ? {
      state: replay.state,
      reconciliations: replay.reconciliations,
      processed_event_ids: replay.processed_event_ids,
    } : null,
    current_account_reconciliation: snapshotReconciliation,
    raw_candles_1m: candles,
    raw_candles_status: candleStatus,
    fee_config_pda: PUMP_FEE_CONFIG_PDA,
    fee_config_history: feeConfigHistory,
    limitations: [
      "Historical account bytes are not returned by standard Solana getTransaction; replay uses observed event post-state and transaction balance deltas, then compares with the current account snapshot when the lifecycle permits.",
      "A complete replay is claimed only when the CreateEvent is present, signature history is exhausted or the requested until signature is reached, every transaction is fetched, and block transaction indexes are available.",
      "FeeConfig history is emitted as update events; exact historical tier state requires snapshots before and after each update boundary.",
    ],
  };
}

export async function fetchPumpMintHistoryFromEnv(options) {
  const rpc = createRpcClientFromEnv();
  return fetchPumpMintHistory({ rpc, ...options });
}
