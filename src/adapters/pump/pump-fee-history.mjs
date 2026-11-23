import { PUMP_FEES_PROGRAM_ID, PUMP_FEE_CONFIG_PDA, decodeProgramAccount } from "./pump-decoder.mjs";
import { decodePumpTransaction, findTransactionIndexInBlock } from "./pump-transaction-parser.mjs";
import {
  buildFeeConfigTimeline,
  feeConfigChangeRecordFromDecodedEvent,
  feeConfigSnapshotRecordFromDecodedAccount,
} from "./fee-resolver.mjs";

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index], index);
    }
  }));
  return output;
}

async function collectSignatures(rpc, address, { maxSignatures, pageSize, commitment }) {
  const signatures = [];
  let before;
  let exhausted = false;
  while (signatures.length < maxSignatures) {
    const page = await rpc.getSignaturesForAddress(address, {
      commitment,
      before,
      limit: Math.min(pageSize, maxSignatures - signatures.length),
    });
    if (!page.length) {
      exhausted = true;
      break;
    }
    signatures.push(...page);
    before = page.at(-1).signature;
    if (page.length < pageSize) {
      exhausted = true;
      break;
    }
  }
  return { signatures, exhausted, stopped_at_limit: signatures.length >= maxSignatures && !exhausted };
}

export async function fetchPumpFeeConfigHistory({
  rpc,
  initialSnapshotRecord = null,
  maxSignatures = 20_000,
  pageSize = 1000,
  concurrency = 5,
  commitment = "confirmed",
  network = "mainnet",
} = {}) {
  if (!rpc) throw new TypeError("Solana RPC client is required");
  const [accountInfo, collection] = await Promise.all([
    rpc.getAccountInfo(PUMP_FEE_CONFIG_PDA, { commitment }),
    collectSignatures(rpc, PUMP_FEE_CONFIG_PDA, { maxSignatures, pageSize, commitment }),
  ]);
  if (!accountInfo?.value) throw new Error("Pump FeeConfig PDA is not available from the configured RPC");
  if (accountInfo.value.owner !== PUMP_FEES_PROGRAM_ID) {
    throw new Error("FeeConfig PDA is not owned by the Pump Fees program");
  }
  const accountBytes = Buffer.from(accountInfo.value.data[0], "base64");
  const decodedAccount = decodeProgramAccount({
    programId: PUMP_FEES_PROGRAM_ID,
    data: accountBytes,
    encoding: "base64",
  });
  const currentSlot = accountInfo.context?.slot;
  if (!Number.isSafeInteger(currentSlot)) throw new Error("FeeConfig account response is missing its context slot");

  const fetched = await mapLimit(collection.signatures, concurrency, async (record) => {
    try {
      const transaction = await rpc.getTransaction(record.signature, { commitment });
      return { signature: record.signature, transaction, status: transaction ? "FETCHED" : "UNAVAILABLE" };
    } catch (error) {
      return { signature: record.signature, transaction: null, status: "RPC_ERROR", error: error.message };
    }
  });
  const slots = [...new Set(fetched.map((item) => item.transaction?.slot).filter(Number.isSafeInteger))];
  const blocks = new Map();
  await mapLimit(slots, 3, async (slot) => {
    try {
      blocks.set(slot, await rpc.getBlock(slot, { commitment }));
    } catch {
      blocks.set(slot, null);
    }
  });

  const records = [];
  if (initialSnapshotRecord) records.push(initialSnapshotRecord);
  const gaps = [];
  let decodedUpdateEvents = 0;
  for (const item of fetched) {
    if (!item.transaction) {
      gaps.push({ signature: item.signature, status: item.status, error: item.error ?? null });
      continue;
    }
    if (item.transaction.meta?.err !== null && item.transaction.meta?.err !== undefined) continue;
    const block = blocks.get(item.transaction.slot);
    const transactionIndex = findTransactionIndexInBlock(block, item.signature);
    if (transactionIndex === null) {
      gaps.push({ signature: item.signature, slot: item.transaction.slot, status: "TRANSACTION_INDEX_UNAVAILABLE" });
      continue;
    }
    const parsed = decodePumpTransaction({
      transaction: item.transaction,
      signature: item.signature,
      transactionIndex,
      network,
      sourceType: "rpc",
    });
    for (const event of parsed.decoded_events) {
      if (event.program_id !== PUMP_FEES_PROGRAM_ID) continue;
      const record = feeConfigChangeRecordFromDecodedEvent({
        decodedEvent: event,
        eventId: `${item.signature}:fee-event:${event.event_sequence}`,
        ordering: {
          slot: item.transaction.slot,
          transaction_index: transactionIndex,
          instruction_index: event.outer_instruction_index ?? 0,
          inner_instruction_index: event.inner_instruction_index ?? null,
          event_sequence: event.event_sequence,
        },
      });
      if (record) {
        records.push(record);
        decodedUpdateEvents += 1;
      }
    }
  }

  const currentSnapshot = feeConfigSnapshotRecordFromDecodedAccount({
    decodedAccount,
    eventId: `fee-config-account-snapshot:${currentSlot}`,
    ordering: {
      slot: currentSlot,
      transaction_index: Number.MAX_SAFE_INTEGER,
      instruction_index: Number.MAX_SAFE_INTEGER,
      inner_instruction_index: null,
      event_sequence: Number.MAX_SAFE_INTEGER,
    },
  });
  records.push(currentSnapshot);
  const coverageComplete = Boolean(initialSnapshotRecord) && collection.exhausted && gaps.length === 0;
  const timeline = buildFeeConfigTimeline(records, { coverageComplete });

  return {
    status: coverageComplete ? "HISTORICAL_FEE_CONFIG_COVERAGE_COMPLETE" : "CURRENT_SNAPSHOT_WITH_HISTORICAL_GAPS",
    fee_config_address: PUMP_FEE_CONFIG_PDA,
    current_snapshot_slot: currentSlot,
    current_snapshot_status: decodedAccount.status,
    current_snapshot_missing_fields: decodedAccount.missing_fields ?? [],
    signature_coverage: {
      signatures_seen: collection.signatures.length,
      exhausted: collection.exhausted,
      stopped_at_limit: collection.stopped_at_limit,
      transactions_fetched: fetched.filter((item) => item.transaction).length,
      data_gaps: gaps.length,
    },
    decoded_update_events: decodedUpdateEvents,
    timeline,
    data_gaps: gaps,
    limitation: initialSnapshotRecord
      ? null
      : "No historical baseline FeeConfig snapshot was supplied. The current account snapshot cannot be backdated; trades before it remain unavailable or stale after an update event.",
  };
}
