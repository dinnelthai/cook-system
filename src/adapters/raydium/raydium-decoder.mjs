import launchpadIdl from "./idl/raydium_launchpad.json" with { type: "json" };
import cpmmIdl from "./idl/raydium_cp_swap.json" with { type: "json" };
import {
  BorshDecodeError,
  BorshReader,
  createTypeMap,
  decodeBase58,
  decodeBase64,
  readIdlDefinition,
  readIdlType,
} from "../pump/borsh.mjs";

export const RAYDIUM_LAUNCHLAB_PROGRAM_ID = launchpadIdl.address;
export const RAYDIUM_CPMM_PROGRAM_ID = cpmmIdl.address;
export const ANCHOR_EVENT_IX_TAG = Buffer.from("e445a52e51cb9a1d", "hex");

const PROGRAMS = new Map([
  [RAYDIUM_LAUNCHLAB_PROGRAM_ID, { namespace: "launchlab", idl: launchpadIdl }],
  [RAYDIUM_CPMM_PROGRAM_ID, { namespace: "cpmm", idl: cpmmIdl }],
]);

const REGISTRY = new Map([...PROGRAMS].map(([programId, entry]) => {
  const idl = entry.idl;
  return [programId, {
    ...entry,
    types: createTypeMap({ [entry.namespace]: idl }, entry.namespace),
    accounts: new Map((idl.accounts ?? []).map((item) => [
      Buffer.from(item.discriminator).toString("hex"), item,
    ])),
    instructions: new Map((idl.instructions ?? []).map((item) => [
      Buffer.from(item.discriminator).toString("hex"), item,
    ])),
    events: new Map((idl.events ?? []).map((item) => [
      Buffer.from(item.discriminator).toString("hex"), item,
    ])),
  }];
}));

function asBuffer(data, encoding = "base58") {
  if (Buffer.isBuffer(data) || data instanceof Uint8Array) return Buffer.from(data);
  if (typeof data !== "string") throw new TypeError("encoded data must be a string or byte array");
  if (encoding === "base58") return decodeBase58(data);
  if (encoding === "base64") return decodeBase64(data);
  throw new TypeError(`unsupported encoding: ${encoding}`);
}

function encodeBigInt(value) {
  return JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item);
}

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

function accountNameMap(instruction, compiled, keys) {
  const result = {};
  const names = instruction.accounts ?? [];
  for (let index = 0; index < names.length; index += 1) {
    const accountIndex = compiled.accounts?.[index];
    result[names[index].name] = Number.isSafeInteger(accountIndex) ? keys[accountIndex] ?? null : null;
  }
  return result;
}

export function decodeRaydiumInstruction({ programId, data, encoding = "base58" }) {
  const entry = REGISTRY.get(programId);
  if (!entry) return { status: "UNSUPPORTED_PROGRAM", program_id: programId };
  const bytes = asBuffer(data, encoding);
  if (bytes.length < 8) return { status: "TRUNCATED_INSTRUCTION_DISCRIMINATOR", program_id: programId };
  const discriminator = bytes.subarray(0, 8);
  const instruction = entry.instructions.get(discriminator.toString("hex"));
  if (!instruction) {
    return {
      status: "UNKNOWN_INSTRUCTION_DISCRIMINATOR",
      program_id: programId,
      discriminator_hex: discriminator.toString("hex"),
    };
  }
  const reader = new BorshReader(bytes.subarray(8));
  const args = {};
  for (const argument of instruction.args ?? []) {
    args[argument.name] = readIdlType(reader, argument.type, entry.types);
  }
  return {
    status: reader.remaining === 0 ? "DECODED" : "TRAILING_INSTRUCTION_BYTES",
    program_id: programId,
    namespace: entry.namespace,
    instruction_name: instruction.name,
    discriminator_hex: discriminator.toString("hex"),
    args,
    trailing_bytes: reader.remaining,
    account_names: (instruction.accounts ?? []).map((account) => account.name),
  };
}

export function decodeRaydiumEvent({ programId, data, encoding = "base64" }) {
  const entry = REGISTRY.get(programId);
  if (!entry) return { status: "UNSUPPORTED_PROGRAM", program_id: programId };
  let bytes = asBuffer(data, encoding);
  let eventCpi = false;
  if (bytes.length >= 16 && bytes.subarray(0, 8).equals(ANCHOR_EVENT_IX_TAG)) {
    bytes = bytes.subarray(8);
    eventCpi = true;
  }
  if (bytes.length < 8) return { status: "TRUNCATED_EVENT_DISCRIMINATOR", program_id: programId };
  const discriminator = bytes.subarray(0, 8);
  const event = entry.events.get(discriminator.toString("hex"));
  if (!event) {
    return {
      status: "UNKNOWN_EVENT_DISCRIMINATOR",
      program_id: programId,
      namespace: entry.namespace,
      discriminator_hex: discriminator.toString("hex"),
      event_cpi: eventCpi,
    };
  }
  const definition = entry.types.get(event.name);
  if (!definition) return { status: "MISSING_EVENT_TYPE_DEFINITION", program_id: programId, event_name: event.name };
  const reader = new BorshReader(bytes.subarray(8));
  const decoded = readIdlDefinition(reader, definition, entry.types);
  return {
    status: reader.remaining === 0 ? "DECODED" : "TRAILING_EVENT_BYTES",
    program_id: programId,
    namespace: entry.namespace,
    event_name: event.name,
    discriminator_hex: discriminator.toString("hex"),
    event_cpi: eventCpi,
    data: decoded.value,
    trailing_bytes: reader.remaining,
  };
}

export function decodeRaydiumAccount({ programId, data, encoding = "base64" }) {
  const entry = REGISTRY.get(programId);
  if (!entry) return { status: "UNSUPPORTED_PROGRAM", program_id: programId };
  const bytes = asBuffer(data, encoding);
  if (bytes.length < 8) return { status: "TRUNCATED_ACCOUNT_DISCRIMINATOR", program_id: programId };
  const discriminator = bytes.subarray(0, 8);
  const account = entry.accounts.get(discriminator.toString("hex"));
  if (!account) {
    return {
      status: "UNKNOWN_ACCOUNT_DISCRIMINATOR",
      program_id: programId,
      discriminator_hex: discriminator.toString("hex"),
    };
  }
  const definition = entry.types.get(account.name);
  if (!definition) return { status: "MISSING_ACCOUNT_TYPE_DEFINITION", program_id: programId, account_name: account.name };
  const reader = new BorshReader(bytes.subarray(8));
  const decoded = readIdlDefinition(reader, definition, entry.types, 0, {
    allowMissingTrailingFields: true,
  });
  return {
    status: decoded.missingFields.length > 0
      ? "PARTIAL_ACCOUNT_LAYOUT"
      : reader.remaining === 0 ? "DECODED" : "TRAILING_ACCOUNT_BYTES",
    program_id: programId,
    namespace: entry.namespace,
    account_name: account.name,
    discriminator_hex: discriminator.toString("hex"),
    data: decoded.value,
    missing_fields: decoded.missingFields,
    trailing_bytes: reader.remaining,
  };
}

export function decodeRaydiumProgramDataLogs(logs, programId) {
  if (!Array.isArray(logs)) throw new TypeError("logs must be an array");
  if (!REGISTRY.has(programId)) return [{ status: "UNSUPPORTED_PROGRAM", program_id: programId }];
  const stack = [];
  const events = [];
  for (let logIndex = 0; logIndex < logs.length; logIndex += 1) {
    const line = logs[logIndex];
    if (typeof line !== "string") continue;
    const invoke = line.match(/^Program ([1-9A-HJ-NP-Za-km-z]+) invoke \[/);
    if (invoke) {
      stack.push(invoke[1]);
      continue;
    }
    const exit = line.match(/^Program ([1-9A-HJ-NP-Za-km-z]+) (?:success|failed:)/);
    if (exit) {
      const index = stack.lastIndexOf(exit[1]);
      if (index >= 0) stack.splice(index);
      continue;
    }
    if (stack.at(-1) !== programId || !line.startsWith("Program data: ")) continue;
    try {
      const decoded = decodeRaydiumEvent({
        programId,
        data: line.slice("Program data: ".length).trim(),
        encoding: "base64",
      });
      events.push({ ...decoded, log_index: logIndex, source: "program_data_log" });
    } catch (error) {
      events.push({
        status: "EVENT_DECODE_ERROR",
        program_id: programId,
        log_index: logIndex,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return events;
}

export function decodeRaydiumTransaction({ transaction, signature = null, transactionIndex = null }) {
  if (!transaction || typeof transaction !== "object") throw new TypeError("transaction is required");
  const keys = getAccountKeys(transaction);
  const message = transaction.transaction?.message ?? transaction.message;
  const topLevel = message?.instructions ?? [];
  const instructions = [];
  const events = [];
  const unresolvedEvents = [];

  const visitInstruction = (compiled, outerIndex, innerIndex = null, innerGroupIndex = null) => {
    const programId = Number.isSafeInteger(compiled.programIdIndex) ? keys[compiled.programIdIndex] : compiled.programId;
    if (!REGISTRY.has(programId)) return;
    try {
      const bytes = asBuffer(compiled.data, "base58");
      const isEventCpi = bytes.length >= 16 && bytes.subarray(0, 8).equals(ANCHOR_EVENT_IX_TAG);
      if (isEventCpi) {
        const event = decodeRaydiumEvent({ programId, data: bytes });
        const record = {
          ...event,
          signature,
          slot: transaction.slot ?? null,
          block_time: transaction.blockTime ?? null,
          transaction_index: transactionIndex,
          outer_instruction_index: outerIndex,
          inner_instruction_index: innerIndex,
          inner_group_index: innerGroupIndex,
          source: "event_cpi_instruction",
        };
        if (event.status === "DECODED") events.push(record);
        else unresolvedEvents.push(record);
        return;
      }

      let decoded;
      try {
        decoded = decodeRaydiumInstruction({ programId, data: bytes });
      } catch (error) {
        decoded = { status: "INSTRUCTION_DECODE_ERROR", program_id: programId, error: error instanceof Error ? error.message : String(error) };
      }
      const entry = REGISTRY.get(programId);
      const instructionDefinition = entry.instructions.get(bytes.subarray(0, 8).toString("hex"));
      const record = {
        ...decoded,
        signature,
        slot: transaction.slot ?? null,
        transaction_index: transactionIndex,
        outer_instruction_index: outerIndex,
        inner_instruction_index: innerIndex,
        inner_group_index: innerGroupIndex,
        accounts: instructionDefinition ? accountNameMap(instructionDefinition, compiled, keys) : {},
      };
      instructions.push(record);
      if (decoded.status !== "DECODED" && decoded.status !== "DECODED_WITH_OMITTED_OPTIONAL_ARGS") {
        unresolvedEvents.push({
          status: "UNRESOLVED_PROGRAM_INSTRUCTION",
          program_id: programId,
          instruction_status: decoded.status,
          signature,
          outer_instruction_index: outerIndex,
          inner_instruction_index: innerIndex,
          discriminator_hex: decoded.discriminator_hex ?? bytes.subarray(0, 8).toString("hex"),
        });
      }
    } catch (error) {
      unresolvedEvents.push({
        status: "INSTRUCTION_OR_EVENT_DECODE_ERROR",
        program_id: programId,
        signature,
        outer_instruction_index: outerIndex,
        inner_instruction_index: innerIndex,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  topLevel.forEach((compiled, index) => visitInstruction(compiled, index));
  for (const group of transaction.meta?.innerInstructions ?? []) {
    (group.instructions ?? []).forEach((compiled, index) => visitInstruction(
      compiled,
      group.index,
      index,
      group.index,
    ));
  }

  const logs = transaction.meta?.logMessages ?? [];
  for (const programId of REGISTRY.keys()) {
    for (const event of decodeRaydiumProgramDataLogs(logs, programId)) {
      const record = {
        ...event,
        signature,
        slot: transaction.slot ?? null,
        block_time: transaction.blockTime ?? null,
        transaction_index: transactionIndex,
        source: "program_data_log",
      };
      if (event.status === "DECODED") events.push(record);
      else unresolvedEvents.push(record);
    }
  }

  const unique = new Map();
  for (const event of events) {
    const key = [
      event.program_id,
      event.event_name,
      event.signature,
      event.outer_instruction_index ?? "",
      encodeBigInt(event.data),
    ].join(":");
    if (!unique.has(key)) unique.set(key, event);
  }
  const orderedEvents = [...unique.values()].sort((a, b) =>
    (a.outer_instruction_index ?? 0) - (b.outer_instruction_index ?? 0) ||
    (a.inner_instruction_index ?? a.log_index ?? 0) - (b.inner_instruction_index ?? b.log_index ?? 0)
  );

  const failed = transaction.meta?.err !== null && transaction.meta?.err !== undefined;
  return {
    status: failed ? "FAILED_TRANSACTION" : unresolvedEvents.length > 0 ? "PARTIAL_DECODE" : "DECODED",
    signature,
    slot: transaction.slot ?? null,
    block_time: transaction.blockTime ?? null,
    transaction_index: transactionIndex,
    failed,
    instructions,
    events: failed ? [] : orderedEvents,
    unresolved_events: unresolvedEvents,
  };
}

export function getRaydiumIdlMetadata() {
  return {
    launchlab: {
      program_id: launchpadIdl.address,
      source_repository: "raydium-io/raydium-idl",
      source_path: "raydium_launchpad/raydium_launchpad.json",
      source_blob_sha: "70186e3f02c2bead7e5a9a92453104df853683ed",
    },
    cpmm: {
      program_id: cpmmIdl.address,
      source_repository: "raydium-io/raydium-idl",
      source_path: "raydium_cpmm/raydium_cp_swap.json",
      source_blob_sha: "923d272a4e56643ef7fece05ca137c036b0295de",
    },
  };
}
