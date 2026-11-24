import { PublicKey } from "@solana/web3.js";
import { createHash } from "node:crypto";
import {
  PUMP_PROGRAM_ID,
  PUMP_AMM_PROGRAM_ID,
  PUMP_FEE_CONFIG_PDA,
  getPumpIdlSnapshotMetadata,
} from "./pump-decoder.mjs";
import { createRpcClientFromEnv } from "./solana-rpc.mjs";
import {
  decodeMintAccount,
  decodeBondingCurveAccount,
  decodePumpSwapPoolAccount,
  decodeTokenAccount,
  normalizeBondingCurveMarket,
} from "./pump-account-codec.mjs";
import { decodePumpTransaction, findTransactionIndexInBlock } from "./pump-transaction-parser.mjs";
import {
  reconcilePumpTradesWithTransaction,
  reconcilePumpSwapTradesWithTransaction,
  reconcileCurveStateSnapshot,
} from "./transaction-reconciler.mjs";
import { createInitialCurveStateFromMarketCreated, replayCurveEvents } from "../../core/market-state.mjs";
import {
  createInitialPumpSwapPoolState,
  replayPumpSwapPoolEvents,
  reconcilePumpSwapPoolSnapshot,
} from "../../core/pool-state.mjs";
import { buildRawCandles } from "../../core/candle-builder.mjs";
import { auditObservedEventTimeline } from "../../core/event-timeline-audit.mjs";
import { auditCandleEvidence } from "../../core/candle-integrity-audit.mjs";
import { assessSourceProvenance } from "../../core/source-provenance.mjs";
import { fetchPumpFeeConfigHistory } from "./pump-fee-history.mjs";

const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
const CURVE_EVENT_KINDS = new Set([
  "CURVE_BUY_EXECUTED",
  "CURVE_SELL_EXECUTED",
  "CURVE_COMPLETE",
  "CURVE_MIGRATED",
  "FEE_MOVEMENT",
  "CURVE_STATE_SNAPSHOT",
  "POST_COMPLETE_POOL_LEG",
]);
const POOL_EVENT_KINDS = new Set([
  "POOL_BUY_EXECUTED",
  "POOL_SELL_EXECUTED",
  "POOL_LIQUIDITY_ADDED",
  "POOL_LIQUIDITY_REMOVED",
  "POOL_FEE_MOVEMENT",
  "POOL_BOOST_BUY_BURN",
]);

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
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("concurrency must be a positive integer");
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
    const page = await rpc.getSignaturesForAddress(address, { commitment, limit: requested, before, until });
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
    address,
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
      return {
        signature: item.signature,
        transaction,
        status: transaction ? "FETCHED" : "PRUNED_OR_UNAVAILABLE",
      };
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
    if (!item.transaction) return { ...item, transaction_index: null, block_available: false };
    const block = blocks.get(item.transaction.slot);
    return {
      ...item,
      transaction_index: findTransactionIndexInBlock(block, item.signature),
      block_available: Boolean(block),
    };
  });
}

function mergeSignatureCollections(collections) {
  const bySignature = new Map();
  for (const collection of collections) {
    for (const record of collection.signatures) {
      const existing = bySignature.get(record.signature);
      if (existing) {
        existing.source_addresses.push(collection.address);
      } else {
        bySignature.set(record.signature, {
          ...record,
          source_addresses: [collection.address],
        });
      }
    }
  }
  return [...bySignature.values()];
}

function attachTransactionReconciliation(parsed, transaction) {
  const balanceDeltas = parsed.balance_deltas;
  const curveTrades = parsed.events.filter((event) =>
    event.event_kind === "CURVE_BUY_EXECUTED" || event.event_kind === "CURVE_SELL_EXECUTED"
  );
  if (curveTrades.length > 0) {
    const reconciliation = reconcilePumpTradesWithTransaction({ transaction, tradeEvents: curveTrades });
    for (const event of curveTrades) {
      event.quality.transaction_balance_reconciliation = reconciliation;
      if (reconciliation.status === "PASS") {
        event.quality.is_complete = true;
        event.quality.validation_status = "valid";
        event.quality.reconciliation_ref = `${parsed.signature}:curve-balance-delta`;
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
  }

  const poolTradesByAddress = new Map();
  for (const event of parsed.events) {
    if (event.event_kind !== "POOL_BUY_EXECUTED" && event.event_kind !== "POOL_SELL_EXECUTED") continue;
    const pool = event.payload.pool_address;
    if (!poolTradesByAddress.has(pool)) poolTradesByAddress.set(pool, []);
    poolTradesByAddress.get(pool).push(event);
  }
  for (const [pool, trades] of poolTradesByAddress) {
    const reconciliation = reconcilePumpSwapTradesWithTransaction({ transaction, tradeEvents: trades });
    for (const event of trades) {
      event.quality.transaction_balance_reconciliation = reconciliation;
      if (reconciliation.status === "PASS") {
        event.quality.is_complete = true;
        event.quality.validation_status = "valid";
        event.quality.reconciliation_ref = `${parsed.signature}:pumpswap-balance-delta`;
      } else {
        event.quality.is_complete = false;
        event.quality.validation_status = reconciliation.status === "INVALID" ? "invalid" : "warning";
        event.quality.warnings = [
          ...(event.quality.warnings ?? []),
          `PumpSwap transaction balance reconciliation: ${reconciliation.status} (${reconciliation.reason})`,
        ];
      }
    }
  }

  const tokenAccounts = balanceDeltas.token_accounts ?? [];
  for (const event of parsed.events) {
    if (!POOL_EVENT_KINDS.has(event.event_kind)) continue;
    const vaults = event.payload.pool_vault_accounts ?? {};
    const baseDelta = tokenAccounts.find((item) => item.address === vaults.base);
    const quoteDelta = tokenAccounts.find((item) => item.address === vaults.quote);
    event.payload.pool_vault_deltas = {
      base_delta_base_units: baseDelta?.delta_base_units ?? null,
      quote_delta_base_units: quoteDelta?.delta_base_units ?? null,
      source_signature: parsed.signature,
    };
  }
  return parsed;
}

async function loadPoolMetadata(rpc, poolCreatedEvent, {
  mintMetadataByMint,
  quoteDecimalsByMint,
  commitment,
}) {
  const payload = poolCreatedEvent?.payload ?? {};
  const poolAddress = payload.pool_address;
  if (typeof poolAddress !== "string" || poolAddress.length === 0) {
    throw new TypeError("POOL_CREATED event is missing pool_address");
  }

  let decodedPool = null;
  let baseVault = null;
  let quoteVault = null;
  const errors = [];
  try {
    const poolInfo = await rpc.getAccountInfo(poolAddress, { commitment });
    if (poolInfo?.value) decodedPool = decodePumpSwapPoolAccount({ ...poolInfo, address: poolAddress });
    else errors.push("PumpSwap Pool account is unavailable from the configured RPC");
  } catch (error) {
    errors.push(`Pool account: ${error.message}`);
  }

  const data = decodedPool?.data ?? {};
  const baseMint = data.base_mint ?? payload.base_mint ?? poolCreatedEvent.market.token_mint;
  const quoteMint = data.quote_mint ?? payload.quote_mint ?? poolCreatedEvent.market.quote_mint;
  let baseDecimals = payload.base_mint_decimals ?? mintMetadataByMint[baseMint]?.decimals ?? null;
  let quoteDecimals = payload.quote_mint_decimals ?? quoteDecimalsByMint[quoteMint] ?? null;
  if (quoteMint === WRAPPED_SOL_MINT) quoteDecimals = 9;

  if (!Number.isInteger(baseDecimals) && baseMint) {
    try {
      const info = await rpc.getAccountInfo(baseMint, { commitment });
      const decoded = decodeMintAccount(info);
      baseDecimals = decoded.decimals;
      mintMetadataByMint[baseMint] = decoded;
    } catch (error) {
      errors.push(`Base mint decimals: ${error.message}`);
    }
  }
  if (!Number.isInteger(quoteDecimals) && quoteMint && quoteMint !== WRAPPED_SOL_MINT) {
    try {
      const info = await rpc.getAccountInfo(quoteMint, { commitment });
      const decoded = decodeMintAccount(info);
      quoteDecimals = decoded.decimals;
      quoteDecimalsByMint[quoteMint] = quoteDecimals;
      mintMetadataByMint[quoteMint] = decoded;
    } catch (error) {
      errors.push(`Quote mint decimals: ${error.message}`);
    }
  }

  const baseVaultAddress = data.pool_base_token_account ?? null;
  const quoteVaultAddress = data.pool_quote_token_account ?? null;
  if (baseVaultAddress) {
    try {
      const info = await rpc.getAccountInfo(baseVaultAddress, { commitment });
      if (info?.value) baseVault = decodeTokenAccount(info);
      else errors.push("base token vault account is unavailable");
      if (baseVault && baseVault.mint !== baseMint) errors.push("base vault mint does not match Pool.base_mint");
    } catch (error) {
      errors.push(`Base vault: ${error.message}`);
    }
  }
  if (quoteVaultAddress) {
    try {
      const info = await rpc.getAccountInfo(quoteVaultAddress, { commitment });
      if (info?.value) quoteVault = decodeTokenAccount(info);
      else errors.push("quote token vault account is unavailable");
      if (quoteVault && quoteVault.mint !== quoteMint) errors.push("quote vault mint does not match Pool.quote_mint");
    } catch (error) {
      errors.push(`Quote vault: ${error.message}`);
    }
  }

  const metadata = {
    pool_address: poolAddress,
    base_mint: baseMint,
    quote_mint: quoteMint,
    base_mint_decimals: baseDecimals,
    quote_mint_decimals: quoteDecimals,
    pool_base_token_account: baseVaultAddress,
    pool_quote_token_account: quoteVaultAddress,
    curve_account: poolCreatedEvent.market.curve_account ?? null,
    idl_revision: getPumpIdlSnapshotMetadata().pump_amm_idl_blob_sha,
  };
  return {
    metadata,
    snapshot: {
      decoded_pool: decodedPool,
      base_vault: baseVault,
      quote_vault: quoteVault,
      errors,
    },
  };
}

function unresolvedProgramEvents(parsedTransactions, signatures, programId) {
  const signatureSet = new Set(signatures);
  return parsedTransactions.flatMap((transaction) => {
    if (!signatureSet.has(transaction.signature)) return [];
    return (transaction.parser_result?.unresolved_events ?? []).filter((item) =>
      item.decoded_event?.program_id === programId
    ).map((item) => ({ signature: transaction.signature, ...item }));
  });
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
  expectedGenesisHash = null,
} = {}) {
  if (!rpc || typeof rpc.getTransaction !== "function" || typeof rpc.getAccountInfo !== "function" ||
      typeof rpc.getSignaturesForAddress !== "function" || typeof rpc.getBlock !== "function") {
    throw new TypeError("a Solana RPC client with transaction, account, signature and block methods is required");
  }
  if (typeof mint !== "string" || mint.length === 0) throw new TypeError("mint is required");
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new RangeError("concurrency must be positive");
  let observedGenesisHash = null;
  if (typeof rpc.getGenesisHash === "function") {
    try { observedGenesisHash = await rpc.getGenesisHash(); } catch { observedGenesisHash = null; }
  }
  const curveAddress = derivePumpBondingCurveAddress(mint);

  const [mintInfo, curveInfo, curveSignatureCollection, feeConfigHistory] = await Promise.all([
    rpc.getAccountInfo(mint, { commitment }),
    rpc.getAccountInfo(curveAddress, { commitment }),
    collectSignatures(rpc, curveAddress, { maxSignatures, pageSize, until, commitment }),
    includeFeeConfigHistory
      ? fetchPumpFeeConfigHistory({
          rpc,
          initialSnapshotRecord: feeConfigBaselineSnapshotRecord,
          maxSignatures: Math.min(maxSignatures, 20_000),
          pageSize,
          concurrency,
          commitment,
          network,
        })
      : Promise.resolve(null),
  ]);

  const mintMetadata = decodeMintAccount(mintInfo);
  const mintMetadataByMint = { [mint]: mintMetadata };
  const quoteDecimalsByMint = { [WRAPPED_SOL_MINT]: 9 };
  const decodedCurve = curveInfo?.value
    ? decodeBondingCurveAccount({ ...curveInfo, address: curveAddress })
    : null;

  const curveQuoteMint = decodedCurve?.data?.quote_mint;
  if (curveQuoteMint && curveQuoteMint !== "11111111111111111111111111111111" && curveQuoteMint !== WRAPPED_SOL_MINT) {
    const error = new Error(`unsupported quote mint for current SOL-only curve adapter: ${curveQuoteMint}`);
    error.code = "UNSUPPORTED_QUOTE_MINT";
    throw error;
  }

  const initialFetched = await getTransactions(rpc, curveSignatureCollection.signatures, concurrency);
  const initialIndexed = await addTransactionIndexes(rpc, initialFetched);
  const initialEvents = [];
  for (const item of initialIndexed) {
    if (!item.transaction) continue;
    const parsed = decodePumpTransaction({
      transaction: item.transaction,
      signature: item.signature,
      transactionIndex: item.transaction_index,
      network,
      tokenDecimalsByMint: { [mint]: mintMetadata.decimals },
      quoteDecimalsByMint,
      sourceType: "rpc",
    });
    initialEvents.push(...parsed.events);
  }

  const poolCreatedEvents = initialEvents.filter((event) => event.event_kind === "POOL_CREATED");
  const poolEventsByAddress = new Map();
  for (const event of poolCreatedEvents) {
    if (event.payload.pool_address) poolEventsByAddress.set(event.payload.pool_address, event);
  }
  for (const event of initialEvents) {
    if (event.event_kind === "CURVE_MIGRATED" && event.payload.pool_address && !poolEventsByAddress.has(event.payload.pool_address)) {
      poolEventsByAddress.set(event.payload.pool_address, {
        event_kind: "POOL_CREATED",
        event_id: `${event.event_id}:pool-metadata`,
        market: { ...event.market, market_phase: "post_graduation" },
        payload: {
          pool_address: event.payload.pool_address,
          base_mint: mint,
          quote_mint: event.payload.quote_mint ?? WRAPPED_SOL_MINT,
        },
      });
    }
  }

  const poolAddresses = [...poolEventsByAddress.keys()];
  const loadedPools = await mapLimit(poolAddresses, concurrency, async (poolAddress) => {
    const event = poolEventsByAddress.get(poolAddress);
    const loaded = await loadPoolMetadata(rpc, event, {
      mintMetadataByMint,
      quoteDecimalsByMint,
      commitment,
    });
    return { poolAddress, ...loaded };
  });
  const poolMetadataByAddress = Object.fromEntries(loadedPools.map((pool) => [pool.poolAddress, pool.metadata]));

  const poolSignatureCollections = await mapLimit(poolAddresses, concurrency, async (poolAddress) =>
    collectSignatures(rpc, poolAddress, {
      maxSignatures,
      pageSize,
      until: null,
      commitment,
    })
  );
  const signatureCollections = [curveSignatureCollection, ...poolSignatureCollections];
  const mergedSignatureRecords = mergeSignatureCollections(signatureCollections);
  const initialFetchedBySignature = new Map(initialFetched.map((item) => [item.signature, item]));
  const additionalRecords = mergedSignatureRecords.filter((record) => !initialFetchedBySignature.has(record.signature));
  const additionalFetched = await getTransactions(rpc, additionalRecords, concurrency);
  const fetchedBySignature = new Map(initialFetched.map((item) => [item.signature, item]));
  for (const item of additionalFetched) fetchedBySignature.set(item.signature, item);
  const allFetched = mergedSignatureRecords.map((record) => {
    const fetched = fetchedBySignature.get(record.signature);
    return { ...fetched, source_addresses: record.source_addresses };
  });
  const indexed = await addTransactionIndexes(rpc, allFetched);
  const ordered = indexed.sort((a, b) => {
    const slotA = a.transaction?.slot ?? Number.MAX_SAFE_INTEGER;
    const slotB = b.transaction?.slot ?? Number.MAX_SAFE_INTEGER;
    if (slotA !== slotB) return slotA - slotB;
    return (a.transaction_index ?? Number.MAX_SAFE_INTEGER) - (b.transaction_index ?? Number.MAX_SAFE_INTEGER);
  });

  const parsedTransactions = [];
  const allEvents = [];
  const dataGaps = [];
  const curveSignatureSet = new Set(curveSignatureCollection.signatures.map((item) => item.signature));
  const poolSignatureSets = new Map(poolSignatureCollections.map((collection) => [
    collection.address,
    new Set(collection.signatures.map((item) => item.signature)),
  ]));

  for (const item of ordered) {
    if (!item.transaction) {
      dataGaps.push({
        signature: item.signature,
        source_addresses: item.source_addresses,
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
      tokenDecimalsByMint: Object.fromEntries(Object.entries(mintMetadataByMint).map(([key, value]) => [key, value.decimals])),
      quoteDecimalsByMint,
      poolMetadataByAddress,
      sourceType: "rpc",
    });
    attachTransactionReconciliation(parsed, item.transaction);
    parsedTransactions.push({
      signature: item.signature,
      slot: item.transaction.slot,
      transaction_index: item.transaction_index,
      source_addresses: item.source_addresses,
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
        source_addresses: item.source_addresses,
        status: "TRANSACTION_INDEX_UNAVAILABLE",
      });
    }
  }

  const curveDataGaps = dataGaps.filter((gap) =>
    gap.source_addresses?.some((address) => address === curveAddress)
  );
  const curveUnresolved = unresolvedProgramEvents(
    parsedTransactions,
    curveSignatureSet,
    PUMP_PROGRAM_ID,
  );
  const market = normalizeBondingCurveMarket({
    mint,
    network,
    curveAccount: curveAddress,
    idlRevision: getPumpIdlSnapshotMetadata().pump_idl_blob_sha,
  });
  const creationEvent = allEvents.find((event) => event.event_kind === "MARKET_CREATED" && event.market.token_mint === mint);
  const curveTimelineEvents = allEvents.filter((event) => event.market.token_mint === mint && CURVE_EVENT_KINDS.has(event.event_kind));
  const curveTimelineAudit = curveTimelineEvents.length ? auditObservedEventTimeline({ events: curveTimelineEvents }) : null;
  let replay = null;
  let snapshotReconciliation = null;
  let replayStatus = "NO_CREATION_EVENT";
  let curveReplayComplete = false;

  if (creationEvent) {
    const initialState = createInitialCurveStateFromMarketCreated({ marketCreatedEvent: creationEvent });
    const curveEvents = allEvents.filter((event) =>
      event.market.token_mint === mint && CURVE_EVENT_KINDS.has(event.event_kind)
    );
    const hasPartialOrder = curveEvents.some((event) => event.ordering.ordering_confidence !== "complete");
    curveReplayComplete = curveSignatureCollection.coverage_complete &&
      curveDataGaps.length === 0 &&
      curveUnresolved.length === 0 &&
      !hasPartialOrder && curveTimelineAudit?.status !== "REVIEW_REQUIRED";
    if (curveReplayComplete) {
      replay = replayCurveEvents(initialState, curveEvents);
      replayStatus = "REPLAYED_FULL_CURVE_HISTORY";
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
      replayStatus = "PARTIAL_CURVE_HISTORY";
    }
  }

  const poolReplays = [];
  for (const pool of loadedPools) {
    const poolCreatedEvent = allEvents.find((event) =>
      event.event_kind === "POOL_CREATED" && event.payload.pool_address === pool.poolAddress
    );
    const poolEvents = allEvents.filter((event) =>
      event.payload?.pool_address === pool.poolAddress && POOL_EVENT_KINDS.has(event.event_kind)
    );
    const poolSignatureSet = poolSignatureSets.get(pool.poolAddress) ?? new Set();
    const poolDataGaps = dataGaps.filter((gap) =>
      gap.source_addresses?.includes(pool.poolAddress)
    );
    const poolUnresolved = unresolvedProgramEvents(
      parsedTransactions,
      poolSignatureSet,
      PUMP_AMM_PROGRAM_ID,
    );
    let poolReplay = null;
    let poolSnapshotReconciliation = null;
    let poolStatus = "NO_POOL_CREATED_EVENT";
    let poolReplayComplete = false;
    const poolTimelineAudit = poolEvents.length ? auditObservedEventTimeline({ events: poolEvents }) : null;
    if (poolCreatedEvent) {
      const initialState = createInitialPumpSwapPoolState({ poolCreatedEvent, decodedPool: pool.snapshot.decoded_pool });
      poolReplay = replayPumpSwapPoolEvents(initialState, poolEvents);
      const poolTradeReconciliationComplete = poolEvents
        .filter((event) => event.event_kind === "POOL_BUY_EXECUTED" || event.event_kind === "POOL_SELL_EXECUTED")
        .every((event) => event.quality.transaction_balance_reconciliation?.status === "PASS");
      poolReplayComplete = (poolSignatureCollections.find((item) => item.address === pool.poolAddress)?.coverage_complete ?? false) &&
        poolDataGaps.length === 0 &&
        poolUnresolved.length === 0 &&
        poolReplay.status === "PASS" &&
        pool.snapshot.errors.length === 0 &&
        poolTradeReconciliationComplete &&
        poolEvents.every((event) => event.ordering.ordering_confidence === "complete") &&
        poolTimelineAudit?.status !== "REVIEW_REQUIRED";
      if (pool.snapshot.decoded_pool && pool.snapshot.base_vault && pool.snapshot.quote_vault) {
        poolSnapshotReconciliation = reconcilePumpSwapPoolSnapshot({
          replayedState: poolReplay.state,
          decodedPool: pool.snapshot.decoded_pool,
          baseVault: pool.snapshot.base_vault,
          quoteVault: pool.snapshot.quote_vault,
        });
        if (poolSnapshotReconciliation.status !== "PASS") poolReplayComplete = false;
      } else {
        poolSnapshotReconciliation = {
          status: "UNKNOWN",
          reason: "current Pool account and both vault snapshots are required for final reconciliation",
        };
        poolReplayComplete = false;
      }
      poolStatus = poolReplayComplete ? "REPLAYED_FULL_POOL_HISTORY" : "PARTIAL_POOL_HISTORY";
    }
    poolReplays.push({
      pool_address: pool.poolAddress,
      metadata: pool.metadata,
      signature_coverage: poolSignatureCollections.find((item) => item.address === pool.poolAddress) ?? null,
      data_gaps: poolDataGaps,
      unresolved_events: poolUnresolved,
      replay_status: poolStatus,
      event_timeline_audit: poolTimelineAudit,
      trade_balance_reconciliation_complete: poolEvents
        .filter((event) => event.event_kind === "POOL_BUY_EXECUTED" || event.event_kind === "POOL_SELL_EXECUTED")
        .every((event) => event.quality.transaction_balance_reconciliation?.status === "PASS"),
      replay: poolReplay,
      current_account_reconciliation: poolSnapshotReconciliation,
      current_snapshot: pool.snapshot,
    });
  }

  const candleEvents = allEvents.filter((event) =>
    ["CURVE_BUY_EXECUTED", "CURVE_SELL_EXECUTED", "POOL_BUY_EXECUTED", "POOL_SELL_EXECUTED"].includes(event.event_kind)
  );
  const candleOrderComplete = candleEvents.every((event) => event.ordering.ordering_confidence === "complete");
  const candles = candleOrderComplete ? buildRawCandles(candleEvents, 60_000) : [];
  const candleStatus = !candleOrderComplete ? "INCOMPLETE_CHAIN_ORDER" : candles.length ? "AVAILABLE" : "NO_TRADE_EVENTS";
  const allPaginationDeclaredComplete = curveSignatureCollection.coverage_complete && poolSignatureCollections.every(item => item.coverage_complete);
  const candleIntegrityAudit = auditCandleEvidence({ events: candleEvents, candles, intervalMs: 60_000, coverageStatus: allPaginationDeclaredComplete ? "PAGINATION_COMPLETE_DECLARED" : "PARTIAL" });
  const endpointId = (() => { try { return new URL(rpc.endpoint).hostname; } catch { return "injected-rpc-client"; } })();
  const adapterVersion = getPumpIdlSnapshotMetadata().pump_idl_blob_sha ?? getPumpIdlSnapshotMetadata().pump_amm_idl_blob_sha ?? "unknown";
  const queryFingerprint = createHash("sha256").update(JSON.stringify({ mint, network, maxSignatures, pageSize, until, commitment })).digest("hex");
  const sourceProvenance = assessSourceProvenance({
    scope: { network, genesis_hash: expectedGenesisHash ?? observedGenesisHash ?? null, provenance: "observed_chain" },
    source: { source_type: "rpc", source_id: "solana-rpc:" + endpointId, endpoint_id: endpointId, observed_genesis_hash: observedGenesisHash },
    capture: { commitment, captured_at_ms: Date.now(), adapter_version: String(adapterVersion), query_fingerprint: queryFingerprint },
    rawPayload: allFetched.map(item => ({ signature: item.signature, transaction: item.transaction }))
  });

  const hasMigration = allEvents.some((event) => event.event_kind === "CURVE_MIGRATED");
  const allPoolsComplete = hasMigration
    ? poolReplays.length > 0 && poolReplays.every((pool) => pool.replay_status === "REPLAYED_FULL_POOL_HISTORY")
    : poolReplays.length === 0 || poolReplays.every((pool) => pool.replay_status === "REPLAYED_FULL_POOL_HISTORY");
  const overallStatus = curveReplayComplete && allPoolsComplete
    ? "REPLAYED_FULL_HISTORY"
    : curveReplayComplete && hasMigration && poolReplays.length === 0
      ? "MISSING_PUMPSWAP_POOL_DISCOVERY"
      : curveReplayComplete
        ? "REPLAYED_CURVE_WITH_PARTIAL_PUMPSWAP_HISTORY"
        : replayStatus;

  return {
    schema_version: "1.1.0",
    status: overallStatus,
    curve_replay_status: replayStatus,
    market,
    bonding_curve_address: curveAddress,
    mint_metadata: mintMetadata,
    current_curve_account: decodedCurve,
    signature_coverage: {
      ...curveSignatureCollection,
      fetched_transactions: initialFetched.filter((item) => item.transaction).length,
      missing_transactions: curveDataGaps.length,
    },
    pool_signature_coverage: poolSignatureCollections,
    data_gaps: dataGaps,
    transactions: parsedTransactions,
    events: allEvents,
    replay: replay ? {
      state: replay.state,
      reconciliations: replay.reconciliations,
      processed_event_ids: replay.processed_event_ids,
    } : null,
    current_account_reconciliation: snapshotReconciliation,
    pool_replays: poolReplays,
    raw_candles_1m: candles,
    raw_candles_status: candleStatus,
    event_timeline_audit: { curve: curveTimelineAudit, pools: poolReplays.map(item => ({ pool_address: item.pool_address, audit: item.event_timeline_audit })) },
    candle_integrity_audit: candleIntegrityAudit,
    source_provenance: sourceProvenance,
    fee_config_pda: PUMP_FEE_CONFIG_PDA,
    fee_config_history: feeConfigHistory,
    limitations: [
      "Historical account bytes are not returned by standard Solana getTransaction; event replay uses pre-operation reserve observations and transaction token-account deltas, then compares with current account snapshots.",
      "A complete curve replay requires exhausted signature history, a CreateEvent, fetched transactions, block transaction indexes and no unresolved Pump program events.",
      "A complete PumpSwap replay requires exhausted pool signature history, all pool transactions and block indexes, decodable pool/vault accounts, supported pool-changing events, and transaction token-account deltas.",
      "PumpSwap BuyEvent/SellEvent reserve fields are pre-swap observations. Post-state is reconstructed from pool vault token-account deltas, not inferred from gross user quote amounts.",
      "FeeConfig history is emitted as update events; exact historical tier state requires snapshots before and after each update boundary.",
      "The curve quote path remains SOL-paired only. PumpSwap pool trades can be parsed for other quote mints when their mint decimals and pool metadata are available.",
    ],
  };
}

export async function fetchPumpMintHistoryFromEnv(options) {
  const rpc = createRpcClientFromEnv();
  return fetchPumpMintHistory({ rpc, ...options });
}
