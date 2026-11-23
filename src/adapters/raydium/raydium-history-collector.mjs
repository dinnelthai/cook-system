import { PublicKey } from "@solana/web3.js";
import { createRpcClientFromEnv } from "../pump/solana-rpc.mjs";
import {
  decodeMintAccount,
  decodeTokenAccount,
} from "../pump/pump-account-codec.mjs";
import {
  RAYDIUM_CPMM_PROGRAM_ID,
  RAYDIUM_LAUNCHLAB_PROGRAM_ID,
  decodeRaydiumAccount,
  decodeRaydiumTransaction,
  getRaydiumIdlMetadata,
} from "./raydium-decoder.mjs";
import { buildRawCandles } from "../../core/candle-builder.mjs";

export const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

export function deriveRaydiumLaunchLabPoolAddress({ mint, quoteMint = WRAPPED_SOL_MINT }) {
  const [address, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), new PublicKey(mint).toBuffer(), new PublicKey(quoteMint).toBuffer()],
    new PublicKey(RAYDIUM_LAUNCHLAB_PROGRAM_ID),
  );
  return { address: address.toBase58(), bump };
}

export function deriveRaydiumCpmmPoolAddress({ ammConfig, tokenA, tokenB }) {
  const a = new PublicKey(tokenA).toBuffer();
  const b = new PublicKey(tokenB).toBuffer();
  const [token0, token1] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a];
  const [address, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), new PublicKey(ammConfig).toBuffer(), token0, token1],
    new PublicKey(RAYDIUM_CPMM_PROGRAM_ID),
  );
  return { address: address.toBase58(), bump, token_0_mint: Buffer.compare(a, b) <= 0 ? tokenA : tokenB, token_1_mint: Buffer.compare(a, b) <= 0 ? tokenB : tokenA };
}

async function mapLimit(items, concurrency, mapper) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new RangeError("concurrency must be a positive integer");
  const output = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

async function fetchAddressSignatures(rpc, address, {
  maxSignatures = 50_000,
  pageSize = 1000,
  untilSignature = null,
  commitment = "confirmed",
} = {}) {
  if (!Number.isSafeInteger(maxSignatures) || maxSignatures < 1) throw new RangeError("maxSignatures must be positive");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new RangeError("pageSize must be between 1 and 1000");
  const signatures = [];
  const seen = new Set();
  let before;
  let exhausted = false;
  let reachedUntil = false;
  while (signatures.length < maxSignatures) {
    const requested = Math.min(pageSize, maxSignatures - signatures.length);
    const page = await rpc.getSignaturesForAddress(address, {
      commitment,
      limit: requested,
      before,
      until: untilSignature ?? undefined,
    });
    if (!Array.isArray(page) || page.length === 0) {
      exhausted = true;
      break;
    }
    for (const item of page) {
      if (item?.signature && !seen.has(item.signature)) {
        signatures.push(item);
        seen.add(item.signature);
      }
    }
    if (untilSignature && page.some((item) => item.signature === untilSignature)) {
      reachedUntil = true;
      break;
    }
    before = page.at(-1)?.signature;
    if (page.length < requested) {
      exhausted = true;
      break;
    }
    if (signatures.length >= maxSignatures) break;
  }
  return {
    address,
    signatures,
    count: signatures.length,
    exhausted,
    reached_until: reachedUntil,
    truncated_at_limit: !exhausted && !reachedUntil && signatures.length >= maxSignatures,
    newest_slot: signatures[0]?.slot ?? null,
    oldest_slot: signatures.at(-1)?.slot ?? null,
  };
}

function transactionAccountKeys(transaction) {
  const message = transaction?.transaction?.message ?? transaction?.message;
  const staticKeys = (message?.accountKeys ?? []).map((key) =>
    typeof key === "string" ? key : key.pubkey
  );
  const loaded = transaction?.meta?.loadedAddresses ?? {};
  return [...staticKeys, ...(loaded.writable ?? []), ...(loaded.readonly ?? [])];
}

function findTransactionIndex(block, signature) {
  const transactions = block?.transactions ?? [];
  for (let index = 0; index < transactions.length; index += 1) {
    const signatures = transactions[index]?.transaction?.signatures ?? [];
    if (signatures.includes(signature)) return index;
  }
  return null;
}

async function fetchTransactionSet(rpc, signatureItems, { concurrency = 8 } = {}) {
  const unique = new Map();
  for (const item of signatureItems) if (item?.signature) unique.set(item.signature, item);
  const items = [...unique.values()];
  const fetched = await mapLimit(items, concurrency, async (item) => {
    try {
      const transaction = await rpc.getTransaction(item.signature, { commitment: "confirmed" });
      return { signature: item.signature, slot: item.slot, transaction, error: null };
    } catch (error) {
      return { signature: item.signature, slot: item.slot, transaction: null, error: error instanceof Error ? error.message : String(error) };
    }
  });
  const bySlot = new Map();
  for (const item of fetched) {
    if (!item.transaction) continue;
    const slot = item.transaction.slot ?? item.slot;
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(item.signature);
  }
  const indexBySignature = new Map();
  const orderingGaps = [];
  for (const [slot, signatures] of bySlot) {
    if (signatures.length === 1) {
      indexBySignature.set(signatures[0], 0);
      continue;
    }
    try {
      const block = await rpc.getBlock(slot, { commitment: "confirmed" });
      for (const signature of signatures) {
        const index = findTransactionIndex(block, signature);
        if (index === null) orderingGaps.push({ slot, signature, reason: "signature_not_found_in_block" });
        else indexBySignature.set(signature, index);
      }
    } catch (error) {
      for (const signature of signatures) orderingGaps.push({
        slot,
        signature,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    transactions: fetched.map((item) => ({
      ...item,
      transaction_index: indexBySignature.get(item.signature) ?? null,
    })),
    ordering_gaps: orderingGaps,
  };
}

function formatPriceDecimal(quoteAmount, tokenAmount, quoteDecimals, tokenDecimals) {
  if (quoteAmount <= 0n || tokenAmount <= 0n) throw new RangeError("trade amounts must be positive");
  const scale = 18n;
  const numerator = quoteAmount * (10n ** BigInt(tokenDecimals)) * (10n ** scale);
  const denominator = tokenAmount * (10n ** BigInt(quoteDecimals));
  const scaled = numerator / denominator;
  const whole = scaled / (10n ** scale);
  const fraction = (scaled % (10n ** scale)).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction.length ? `${whole}.${fraction}` : whole.toString();
}

function eventOrdering({ transactionIndex, event, eventSequence, slot }) {
  if (!Number.isSafeInteger(transactionIndex) || transactionIndex < 0 ||
      !Number.isSafeInteger(event.outer_instruction_index) || event.outer_instruction_index < 0 ||
      !Number.isSafeInteger(event.inner_instruction_index) || event.inner_instruction_index < 0) {
    return null;
  }
  return {
    slot,
    transaction_index: transactionIndex,
    instruction_index: event.outer_instruction_index,
    inner_instruction_index: event.inner_instruction_index,
    event_sequence: eventSequence,
    ordering_confidence: "complete",
  };
}

function normalizeLaunchLabTrade({ event, transactionRecord, mint, quoteMint, tokenDecimals, quoteDecimals, eventSequence }) {
  const data = event.data;
  const direction = data.trade_direction?.variant;
  if (direction !== "Buy" && direction !== "Sell") return null;
  const isBuy = direction === "Buy";
  const quoteAmount = isBuy ? data.amount_in : data.amount_out;
  const tokenAmount = isBuy ? data.amount_out : data.amount_in;
  const ordering = eventOrdering({
    transactionIndex: transactionRecord.transaction_index,
    event,
    eventSequence,
    slot: transactionRecord.transaction.slot,
  });
  if (!ordering || !Number.isSafeInteger(transactionRecord.transaction.blockTime)) return null;
  const signature = transactionRecord.signature;
  return {
    schema_version: "1.0.0",
    event_id: `${signature}:launchlab:${event.outer_instruction_index}:${event.inner_instruction_index}:${eventSequence}`,
    event_kind: isBuy ? "CURVE_BUY_EXECUTED" : "CURVE_SELL_EXECUTED",
    event_time_ms: transactionRecord.transaction.blockTime * 1000,
    provenance: "observed_chain",
    ordering,
    market: {
      chain_id: "solana",
      network: "mainnet",
      token_mint: mint,
      quote_mint: quoteMint,
      curve_program_id: RAYDIUM_LAUNCHLAB_PROGRAM_ID,
      pool_address: data.pool_state,
      market_phase: "launchlab_curve",
    },
    payload: {
      actor_address: null,
      quote_amount_base_units: quoteAmount.toString(),
      token_amount_base_units: tokenAmount.toString(),
      execution_price_decimal: formatPriceDecimal(quoteAmount, tokenAmount, quoteDecimals, tokenDecimals),
      protocol_fee_base_units: data.protocol_fee.toString(),
      platform_fee_base_units: data.platform_fee.toString(),
      creator_fee_base_units: data.creator_fee.toString(),
      share_fee_base_units: data.share_fee.toString(),
      real_base_before_base_units: data.real_base_before.toString(),
      real_quote_before_base_units: data.real_quote_before.toString(),
      real_base_after_base_units: data.real_base_after.toString(),
      real_quote_after_base_units: data.real_quote_after.toString(),
      virtual_base_base_units: data.virtual_base.toString(),
      virtual_quote_base_units: data.virtual_quote.toString(),
      pool_status: data.pool_status?.variant ?? null,
      exact_in: data.exact_in,
      raw_amount_in_base_units: data.amount_in.toString(),
      raw_amount_out_base_units: data.amount_out.toString(),
    },
    source: { signature, event_name: event.event_name, source: event.source },
  };
}

function normalizeCpmmSwap({ event, transactionRecord, mint, quoteMint, tokenDecimals, quoteDecimals, poolAddress, eventSequence }) {
  const data = event.data;
  let isBuy;
  let quoteAmount;
  let tokenAmount;
  if (data.input_mint === quoteMint && data.output_mint === mint) {
    isBuy = true;
    quoteAmount = data.input_amount;
    tokenAmount = data.output_amount;
  } else if (data.input_mint === mint && data.output_mint === quoteMint) {
    isBuy = false;
    tokenAmount = data.input_amount;
    quoteAmount = data.output_amount;
  } else {
    return null;
  }
  const ordering = eventOrdering({
    transactionIndex: transactionRecord.transaction_index,
    event,
    eventSequence,
    slot: transactionRecord.transaction.slot,
  });
  if (!ordering || !Number.isSafeInteger(transactionRecord.transaction.blockTime)) return null;
  const signature = transactionRecord.signature;
  return {
    schema_version: "1.0.0",
    event_id: `${signature}:cpmm:${event.outer_instruction_index}:${event.inner_instruction_index}:${eventSequence}`,
    event_kind: isBuy ? "POOL_BUY_EXECUTED" : "POOL_SELL_EXECUTED",
    event_time_ms: transactionRecord.transaction.blockTime * 1000,
    provenance: "observed_chain",
    ordering,
    market: {
      chain_id: "solana",
      network: "mainnet",
      token_mint: mint,
      quote_mint: quoteMint,
      curve_program_id: RAYDIUM_CPMM_PROGRAM_ID,
      pool_address: poolAddress,
      market_phase: "raydium_cpmm",
    },
    payload: {
      actor_address: null,
      quote_amount_base_units: quoteAmount.toString(),
      token_amount_base_units: tokenAmount.toString(),
      execution_price_decimal: formatPriceDecimal(quoteAmount, tokenAmount, quoteDecimals, tokenDecimals),
      input_mint: data.input_mint,
      output_mint: data.output_mint,
      input_amount_base_units: data.input_amount.toString(),
      output_amount_base_units: data.output_amount.toString(),
      input_transfer_fee_base_units: data.input_transfer_fee.toString(),
      output_transfer_fee_base_units: data.output_transfer_fee.toString(),
      trade_fee_base_units: data.trade_fee.toString(),
      creator_fee_base_units: data.creator_fee.toString(),
      creator_fee_on_input: data.creator_fee_on_input,
      base_input: data.base_input,
    },
    source: { signature, event_name: event.event_name, source: event.source },
  };
}

function extractTokenAccountDelta(transaction, tokenAccountAddress) {
  const keys = transactionAccountKeys(transaction);
  const index = keys.indexOf(tokenAccountAddress);
  if (index < 0) return { address: tokenAccountAddress, delta: 0n, complete: true, touched: false };
  const pre = (transaction.meta?.preTokenBalances ?? []).find((item) => item.accountIndex === index);
  const post = (transaction.meta?.postTokenBalances ?? []).find((item) => item.accountIndex === index);
  if (!pre && !post) return { address: tokenAccountAddress, delta: 0n, complete: false, touched: true, reason: "token_balance_delta_missing" };
  const preAmount = BigInt(pre?.uiTokenAmount?.amount ?? "0");
  const postAmount = BigInt(post?.uiTokenAmount?.amount ?? "0");
  return { address: tokenAccountAddress, delta: postAmount - preAmount, complete: true, touched: true };
}

function inspectStateChangingTransactions(transactionRecords, decodedBySignature, vaultAddresses, programId, recognizedEventNames) {
  const gaps = [];
  for (const record of transactionRecords) {
    const tx = record.transaction;
    if (!tx || (tx.meta?.err !== null && tx.meta?.err !== undefined)) continue;
    const deltas = vaultAddresses.map((address) => extractTokenAccountDelta(tx, address));
    const missing = deltas.filter((item) => !item.complete);
    if (missing.length > 0) {
      gaps.push({
        signature: record.signature,
        reason: "vault_balance_delta_missing",
        vaults: missing.map((item) => item.address ?? null),
      });
      continue;
    }
    const changed = deltas.some((item) => item.delta !== 0n);
    if (!changed) continue;
    const decoded = decodedBySignature.get(record.signature);
    const recognizedEvent = decoded?.events?.some((event) =>
      event.program_id === programId && recognizedEventNames.includes(event.event_name)
    ) ?? false;
    const recognizedInstruction = decoded?.instructions?.some((instruction) =>
      instruction.program_id === programId &&
      instruction.status === "DECODED"
    ) ?? false;
    if (!recognizedEvent && !recognizedInstruction) {
      gaps.push({
        signature: record.signature,
        reason: "unexplained_pool_vault_balance_change",
        program_id: programId,
      });
    }
  }
  return gaps;
}

function replayVaultDeltas(transactionRecords, vaultAddresses, currentAmounts) {
  const totals = Object.fromEntries(vaultAddresses.map((address) => [address, 0n]));
  const gaps = [];
  for (const record of transactionRecords) {
    const tx = record.transaction;
    if (!tx || (tx.meta?.err !== null && tx.meta?.err !== undefined)) continue;
    for (const address of vaultAddresses) {
      const result = extractTokenAccountDelta(tx, address);
      if (!result.complete) {
        gaps.push({ signature: record.signature, vault: address, reason: result.reason });
      } else {
        totals[address] += result.delta;
      }
    }
  }
  const comparisons = vaultAddresses.map((address) => ({
    vault: address,
    replayed_amount_base_units: totals[address].toString(),
    current_amount_base_units: currentAmounts[address] ?? null,
    status: currentAmounts[address] !== null && currentAmounts[address] !== undefined &&
      totals[address].toString() === currentAmounts[address] ? "PASS" : "MISMATCH",
  }));
  return {
    status: gaps.length === 0 && comparisons.every((item) => item.status === "PASS") ? "PASS" : "INCOMPLETE_OR_MISMATCH",
    comparisons,
    gaps,
  };
}

async function fetchTokenAccountSnapshot(rpc, address, expectedMint) {
  const info = await rpc.getAccountInfo(address);
  if (!info?.value) return { status: "MISSING", address, amount_base_units: null, mint: null };
  const decoded = decodeTokenAccount(info);
  return {
    status: decoded.mint === expectedMint ? "PASS" : "MINT_MISMATCH",
    address,
    mint: decoded.mint,
    amount_base_units: decoded.amount_base_units,
    token_authority: decoded.token_authority,
    context_slot: info.context?.slot ?? null,
  };
}

async function fetchCurrentPoolAccount(rpc, address, programId) {
  const info = await rpc.getAccountInfo(address);
  if (!info?.value) return { status: "MISSING", address, context_slot: info?.context?.slot ?? null, data: null };
  if (info.value.owner !== programId) {
    return { status: "OWNER_MISMATCH", address, owner: info.value.owner, context_slot: info.context?.slot ?? null, data: null };
  }
  const decoded = decodeRaydiumAccount({ programId, data: info.value.data[0], encoding: info.value.data[1] });
  return {
    status: decoded.status === "DECODED" || decoded.status === "PARTIAL_ACCOUNT_LAYOUT" ? "PASS" : "DECODE_ERROR",
    address,
    owner: info.value.owner,
    context_slot: info.context?.slot ?? null,
    decoded,
  };
}

function migrationPoolFromInstructions(instructions) {
  const item = instructions.find((instruction) =>
    instruction.program_id === RAYDIUM_LAUNCHLAB_PROGRAM_ID &&
    instruction.instruction_name === "migrate_to_cpswap"
  );
  if (!item) return null;
  return {
    pool_address: item.accounts?.cpswap_pool ?? null,
    amm_config: item.accounts?.cpswap_config ?? null,
    signature: item.signature,
  };
}

async function latestSignatureStillMatches(rpc, address, expectedSignature) {
  const latest = await rpc.getSignaturesForAddress(address, { commitment: "confirmed", limit: 1 });
  return {
    latest_signature: latest[0]?.signature ?? null,
    stable: (latest[0]?.signature ?? null) === (expectedSignature ?? null),
  };
}

export async function fetchRaydiumMintHistory({
  rpc,
  mint,
  quoteMint = WRAPPED_SOL_MINT,
  maxSignatures = 50_000,
  pageSize = 1000,
  concurrency = 8,
  untilSignature = null,
  includeTransactions = false,
} = {}) {
  if (!rpc) throw new TypeError("rpc client is required");
  const mintInfo = await rpc.getAccountInfo(mint);
  const quoteInfo = await rpc.getAccountInfo(quoteMint);
  const mintDecoded = decodeMintAccount(mintInfo);
  const quoteDecoded = decodeMintAccount(quoteInfo);
  const launchLabPda = deriveRaydiumLaunchLabPoolAddress({ mint, quoteMint });
  const launchLabAccount = await fetchCurrentPoolAccount(rpc, launchLabPda.address, RAYDIUM_LAUNCHLAB_PROGRAM_ID);
  if (launchLabAccount.status !== "PASS" || launchLabAccount.decoded.account_name !== "PoolState") {
    return {
      status: "NOT_A_VERIFIED_LAUNCHLAB_POOL",
      mint,
      quote_mint: quoteMint,
      launchlab_pool_address: launchLabPda.address,
      launchlab_pool_account: launchLabAccount,
      idl_metadata: getRaydiumIdlMetadata(),
    };
  }
  const launchData = launchLabAccount.decoded.data;
  if (launchData.base_mint !== mint || launchData.quote_mint !== quoteMint) {
    return {
      status: "LAUNCHLAB_POOL_MINT_MISMATCH",
      mint,
      quote_mint: quoteMint,
      launchlab_pool_address: launchLabPda.address,
      launchlab_pool_account: launchLabAccount,
    };
  }

  const launchCoverage = await fetchAddressSignatures(rpc, launchLabPda.address, {
    maxSignatures, pageSize, untilSignature,
  });
  const launchTransactions = await fetchTransactionSet(rpc, launchCoverage.signatures, { concurrency });
  const launchParsed = launchTransactions.transactions
    .filter((record) => record.transaction)
    .map((record) => decodeRaydiumTransaction({
      transaction: record.transaction,
      signature: record.signature,
      transactionIndex: null,
    }));
  const launchInstructions = launchParsed.flatMap((item) => item.instructions);
  const migration = migrationPoolFromInstructions(launchInstructions);
  let ammConfig = migration?.amm_config ?? null;
  let cpmmPoolAddress = migration?.pool_address ?? null;

  if (!ammConfig && launchData.platform_config) {
    const platform = await fetchCurrentPoolAccount(rpc, launchData.platform_config, RAYDIUM_LAUNCHLAB_PROGRAM_ID);
    if (platform.status === "PASS" && platform.decoded.account_name === "PlatformConfig") {
      ammConfig = platform.decoded.data.cpswap_config ?? null;
    }
  }
  if (!cpmmPoolAddress && ammConfig && launchData.migrate_type === 1n) {
    cpmmPoolAddress = deriveRaydiumCpmmPoolAddress({
      ammConfig,
      tokenA: mint,
      tokenB: quoteMint,
    }).address;
  }
  if (!cpmmPoolAddress || !ammConfig) {
    return {
      status: "LAUNCHLAB_HISTORY_COLLECTED_MIGRATION_NOT_RESOLVED",
      mint,
      quote_mint: quoteMint,
      launchlab_pool_address: launchLabPda.address,
      launchlab_pool_account: launchLabAccount,
      launchlab_signature_coverage: launchCoverage,
      launchlab_transactions_fetched: launchTransactions.transactions.filter((item) => item.transaction).length,
      migration_instruction: migration,
      amm_config: ammConfig,
      idl_metadata: getRaydiumIdlMetadata(),
    };
  }

  const cpmmDerived = deriveRaydiumCpmmPoolAddress({
    ammConfig,
    tokenA: mint,
    tokenB: quoteMint,
  });
  if (cpmmDerived.address !== cpmmPoolAddress) {
    return {
      status: "CPMM_POOL_PDA_MISMATCH",
      mint,
      quote_mint: quoteMint,
      launchlab_pool_address: launchLabPda.address,
      discovered_cpmm_pool_address: cpmmPoolAddress,
      derived_cpmm_pool_address: cpmmDerived.address,
      amm_config: ammConfig,
    };
  }

  const cpmmAccount = await fetchCurrentPoolAccount(rpc, cpmmPoolAddress, RAYDIUM_CPMM_PROGRAM_ID);
  if (cpmmAccount.status !== "PASS" || cpmmAccount.decoded.account_name !== "PoolState") {
    return {
      status: "CPMM_POOL_ACCOUNT_NOT_VERIFIED",
      mint,
      quote_mint: quoteMint,
      launchlab_pool_address: launchLabPda.address,
      cpmm_pool_address: cpmmPoolAddress,
      cpmm_pool_account: cpmmAccount,
    };
  }
  const cpmmData = cpmmAccount.decoded.data;
  if (![cpmmData.token_0_mint, cpmmData.token_1_mint].includes(mint) ||
      ![cpmmData.token_0_mint, cpmmData.token_1_mint].includes(quoteMint)) {
    return {
      status: "CPMM_POOL_MINT_MISMATCH",
      mint,
      quote_mint: quoteMint,
      cpmm_pool_address: cpmmPoolAddress,
      cpmm_pool_data: cpmmData,
    };
  }

  const cpmmCoverage = await fetchAddressSignatures(rpc, cpmmPoolAddress, {
    maxSignatures, pageSize, untilSignature,
  });
  const allSignatureItems = [...launchCoverage.signatures, ...cpmmCoverage.signatures];
  const allTransactions = await fetchTransactionSet(rpc, allSignatureItems, { concurrency });
  const parsedTransactions = allTransactions.transactions
    .filter((record) => record.transaction)
    .map((record) => ({
      ...record,
      decoded: decodeRaydiumTransaction({
        transaction: record.transaction,
        signature: record.signature,
        transactionIndex: record.transaction_index,
      }),
    }))
    .sort((a, b) =>
      (a.transaction.slot ?? a.slot ?? 0) - (b.transaction.slot ?? b.slot ?? 0) ||
      (a.transaction_index ?? Number.MAX_SAFE_INTEGER) - (b.transaction_index ?? Number.MAX_SAFE_INTEGER)
    );

  const unresolved = [];
  const normalizedEvents = [];
  const protocolEvents = [];
  const decodedBySignature = new Map(parsedTransactions.map((record) => [record.signature, record.decoded]));
  for (const record of parsedTransactions) {
    if (record.decoded.failed) continue;
    if (record.decoded.unresolved_events.length) {
      unresolved.push(...record.decoded.unresolved_events.map((item) => ({ signature: record.signature, ...item })));
    }
    const txEvents = record.decoded.events;
    let sequence = 0;
    for (const event of txEvents) {
      if (event.program_id === RAYDIUM_LAUNCHLAB_PROGRAM_ID && event.event_name === "TradeEvent") {
        const normalized = normalizeLaunchLabTrade({
          event,
          transactionRecord: record,
          mint,
          quoteMint,
          tokenDecimals: mintDecoded.decimals,
          quoteDecimals: quoteDecoded.decimals,
          eventSequence: sequence,
        });
        if (normalized) normalizedEvents.push(normalized);
        else unresolved.push({ signature: record.signature, event_name: event.event_name, reason: "launchlab_event_order_or_time_incomplete" });
      } else if (event.program_id === RAYDIUM_CPMM_PROGRAM_ID && event.event_name === "SwapEvent") {
        const normalized = normalizeCpmmSwap({
          event,
          transactionRecord: record,
          mint,
          quoteMint,
          tokenDecimals: mintDecoded.decimals,
          quoteDecimals: quoteDecoded.decimals,
          poolAddress: cpmmPoolAddress,
          eventSequence: sequence,
        });
        if (normalized) normalizedEvents.push(normalized);
        else unresolved.push({ signature: record.signature, event_name: event.event_name, reason: "cpmm_swap_not_for_requested_pair_or_order_incomplete" });
      } else {
        protocolEvents.push({
          signature: record.signature,
          slot: record.transaction.slot,
          event_name: event.event_name,
          program_id: event.program_id,
          source: event.source,
          data: event.data,
        });
      }
      sequence += 1;
    }
  }

  const launchVaultSnapshots = await Promise.all([
    fetchTokenAccountSnapshot(rpc, launchData.base_vault, mint),
    fetchTokenAccountSnapshot(rpc, launchData.quote_vault, quoteMint),
  ]);
  const cpmmVaultSnapshots = await Promise.all([
    fetchTokenAccountSnapshot(rpc, cpmmData.token_0_vault, cpmmData.token_0_mint),
    fetchTokenAccountSnapshot(rpc, cpmmData.token_1_vault, cpmmData.token_1_mint),
  ]);
  const launchCurrentAmounts = Object.fromEntries(launchVaultSnapshots.map((item) => [item.address, item.amount_base_units]));
  const cpmmCurrentAmounts = Object.fromEntries(cpmmVaultSnapshots.map((item) => [item.address, item.amount_base_units]));
  const cpmmTransactionRecords = allTransactions.transactions.filter((item) =>
    cpmmCoverage.signatures.some((signature) => signature.signature === item.signature)
  );
  const launchVaultReplay = replayVaultDeltas(
    launchTransactions.transactions,
    [launchData.base_vault, launchData.quote_vault],
    launchCurrentAmounts,
  );
  const cpmmVaultReplay = replayVaultDeltas(
    cpmmTransactionRecords,
    [cpmmData.token_0_vault, cpmmData.token_1_vault],
    cpmmCurrentAmounts,
  );
  const unexplainedLaunchChanges = inspectStateChangingTransactions(
    launchTransactions.transactions,
    decodedBySignature,
    [launchData.base_vault, launchData.quote_vault],
    RAYDIUM_LAUNCHLAB_PROGRAM_ID,
    ["TradeEvent", "PoolCreateEvent", "CreateVestingEvent", "ClaimVestedEvent"],
  );
  const unexplainedCpmmChanges = inspectStateChangingTransactions(
    cpmmTransactionRecords,
    decodedBySignature,
    [cpmmData.token_0_vault, cpmmData.token_1_vault],
    RAYDIUM_CPMM_PROGRAM_ID,
    ["SwapEvent", "LpChangeEvent"],
  );
  const unexplainedStateChanges = [
    ...unexplainedLaunchChanges.map((item) => ({ venue: "launchlab", ...item })),
    ...unexplainedCpmmChanges.map((item) => ({ venue: "cpmm", ...item })),
  ];

  const launchLatest = await latestSignatureStillMatches(rpc, launchLabPda.address, launchCoverage.signatures[0]?.signature ?? null);
  const cpmmLatest = await latestSignatureStillMatches(rpc, cpmmPoolAddress, cpmmCoverage.signatures[0]?.signature ?? null);
  const orderingGaps = allTransactions.ordering_gaps;
  const transactionGaps = allTransactions.transactions.filter((item) => !item.transaction);
  const coverageComplete = launchCoverage.exhausted && cpmmCoverage.exhausted &&
    transactionGaps.length === 0 && orderingGaps.length === 0 &&
    launchLatest.stable && cpmmLatest.stable;
  const eventOrderComplete = unresolved.length === 0 && unexplainedStateChanges.length === 0 &&
    normalizedEvents.every((event) => event.ordering?.ordering_confidence === "complete");
  const vaultReconciliationPass = launchVaultReplay.status === "PASS" && cpmmVaultReplay.status === "PASS" &&
    launchVaultSnapshots.every((item) => item.status === "PASS") &&
    cpmmVaultSnapshots.every((item) => item.status === "PASS");
  const rawCandles1m = buildRawCandles(normalizedEvents, 60_000);
  const rawCandles5m = buildRawCandles(normalizedEvents, 300_000);
  const full = coverageComplete && eventOrderComplete && vaultReconciliationPass;

  return {
    status: full ? "REPLAYED_FULL_LAUNCHLAB_TO_CPMM_HISTORY" : "PARTIAL_LAUNCHLAB_TO_CPMM_HISTORY",
    mint,
    quote_mint: quoteMint,
    decimals: { token: mintDecoded.decimals, quote: quoteDecoded.decimals },
    launchlab: {
      pool_address: launchLabPda.address,
      pool_bump: launchLabPda.bump,
      pool_status: Number(launchData.status),
      migrate_type: Number(launchData.migrate_type),
      creator: launchData.creator,
      base_vault: launchData.base_vault,
      quote_vault: launchData.quote_vault,
      account_context_slot: launchLabAccount.context_slot,
      signature_coverage: launchCoverage,
      vault_snapshots: launchVaultSnapshots,
      vault_delta_replay: launchVaultReplay,
      latest_signature_stability: launchLatest,
    },
    migration: {
      instruction: migration,
      amm_config: ammConfig,
      derived_cpmm_pool_address: cpmmDerived.address,
      pool_address_matches_derived: cpmmDerived.address === cpmmPoolAddress,
    },
    cpmm: {
      pool_address: cpmmPoolAddress,
      amm_config: cpmmData.amm_config,
      creator: cpmmData.pool_creator,
      token_0_mint: cpmmData.token_0_mint,
      token_1_mint: cpmmData.token_1_mint,
      token_0_vault: cpmmData.token_0_vault,
      token_1_vault: cpmmData.token_1_vault,
      fee_balances: {
        protocol_token_0: cpmmData.protocol_fees_token_0.toString(),
        protocol_token_1: cpmmData.protocol_fees_token_1.toString(),
        fund_token_0: cpmmData.fund_fees_token_0.toString(),
        fund_token_1: cpmmData.fund_fees_token_1.toString(),
        creator_token_0: cpmmData.creator_fees_token_0.toString(),
        creator_token_1: cpmmData.creator_fees_token_1.toString(),
      },
      account_context_slot: cpmmAccount.context_slot,
      signature_coverage: cpmmCoverage,
      vault_snapshots: cpmmVaultSnapshots,
      vault_delta_replay: cpmmVaultReplay,
      latest_signature_stability: cpmmLatest,
    },
    event_coverage: {
      fetched_transactions: parsedTransactions.length,
      failed_transactions: parsedTransactions.filter((item) => item.decoded.failed).length,
      decoded_trade_events: normalizedEvents.length,
      unresolved_events: unresolved,
      protocol_events: protocolEvents.length,
      transaction_gaps: transactionGaps,
      ordering_gaps: orderingGaps,
      unexplained_state_changes: unexplainedStateChanges,
      ordering_complete: eventOrderComplete,
    },
    raw_candles_status: normalizedEvents.length > 0 ? "AVAILABLE" : "NO_EXECUTIONS",
    raw_candles_1m: rawCandles1m,
    raw_candles_5m: rawCandles5m,
    normalized_events: normalizedEvents,
    protocol_events: protocolEvents,
    ...(includeTransactions ? { transactions: parsedTransactions } : {}),
    coverage_complete: coverageComplete,
    vault_reconciliation_pass: vaultReconciliationPass,
    idl_metadata: getRaydiumIdlMetadata(),
  };
}

export async function fetchRaydiumMintHistoryFromEnv(options = {}) {
  return fetchRaydiumMintHistory({ rpc: createRpcClientFromEnv(), ...options });
}
