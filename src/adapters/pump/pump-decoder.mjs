import snapshot from "./pump-idl.snapshot.json" with { type: "json" };
import {
  BorshDecodeError,
  BorshReader,
  createTypeMap,
  decodeBase58,
  decodeBase64,
  readIdlDefinition,
  readIdlType,
} from "./borsh.mjs";

export const PUMP_PROGRAM_ID = snapshot.source.pump_program_id;
export const PUMP_FEES_PROGRAM_ID = snapshot.source.fees_program_id;
export const PUMP_FEE_CONFIG_PDA = snapshot.source.fees_config_pda;
export const PUMP_IDL_SNAPSHOT_VERSION = snapshot.snapshot_version;

const PROGRAMS = new Map([
  [PUMP_PROGRAM_ID, "pump"],
  [PUMP_FEES_PROGRAM_ID, "fees"],
]);

const TYPE_MAPS = {
  pump: createTypeMap(snapshot, "pump"),
  fees: createTypeMap(snapshot, "fees"),
};

const ACCOUNT_MAPS = {
  pump: new Map((snapshot.pump.accounts ?? []).map((account) => [
    Buffer.from(account.discriminator).toString("hex"),
    account,
  ])),
  fees: new Map((snapshot.fees.accounts ?? []).map((account) => [
    Buffer.from(account.discriminator).toString("hex"),
    account,
  ])),
};

const INSTRUCTION_MAP = new Map((snapshot.pump.instructions ?? []).map((instruction) => [
  Buffer.from(instruction.discriminator).toString("hex"),
  instruction,
]));

const EVENT_MAPS = {
  pump: new Map((snapshot.pump.events ?? []).map((event) => [
    Buffer.from(event.discriminator).toString("hex"),
    event,
  ])),
  fees: new Map((snapshot.fees.events ?? []).map((event) => [
    Buffer.from(event.discriminator).toString("hex"),
    event,
  ])),
};

function toBuffer(data, encoding = "base58") {
  if (Buffer.isBuffer(data) || data instanceof Uint8Array) return Buffer.from(data);
  if (typeof data !== "string") throw new TypeError("data must be a Buffer, Uint8Array, or encoded string");
  if (encoding === "base58") return decodeBase58(data);
  if (encoding === "base64") return decodeBase64(data);
  throw new TypeError(`unsupported input encoding: ${encoding}`);
}

function getProgramNamespace(programId) {
  return PROGRAMS.get(programId) ?? null;
}

function decodeEventBuffer(programNamespace, bytes) {
  if (bytes.length < 8) {
    return { status: "TRUNCATED_EVENT_DISCRIMINATOR", program: programNamespace };
  }
  const discriminator = bytes.subarray(0, 8);
  const event = EVENT_MAPS[programNamespace].get(discriminator.toString("hex"));
  if (!event) {
    return {
      status: "UNKNOWN_EVENT_DISCRIMINATOR",
      program: programNamespace,
      discriminator_hex: discriminator.toString("hex"),
    };
  }
  const typeMap = TYPE_MAPS[programNamespace];
  const definition = typeMap.get(event.name);
  if (!definition) {
    return { status: "MISSING_EVENT_TYPE_DEFINITION", program: programNamespace, event_name: event.name };
  }
  const reader = new BorshReader(bytes.subarray(8));
  const result = readIdlDefinition(reader, definition, typeMap, 0, { allowMissingTrailingFields: true });
  const status = result.missingFields.length > 0
    ? "PARTIAL_EVENT_LAYOUT"
    : reader.remaining > 0
      ? "TRAILING_EVENT_BYTES"
      : "DECODED";
  return {
    status,
    program: programNamespace,
    event_name: event.name,
    discriminator_hex: discriminator.toString("hex"),
    data: result.value,
    missing_fields: result.missingFields,
    bytes_consumed: reader.offset + 8,
    trailing_bytes: reader.remaining,
    idl_snapshot_version: snapshot.snapshot_version,
  };
}

export function decodePumpInstruction({ programId = PUMP_PROGRAM_ID, data, encoding = "base58" }) {
  if (programId !== PUMP_PROGRAM_ID) {
    return { status: "UNSUPPORTED_PROGRAM", program_id: programId };
  }
  const bytes = toBuffer(data, encoding);
  if (bytes.length < 8) {
    return { status: "TRUNCATED_INSTRUCTION_DISCRIMINATOR", program_id: programId };
  }
  const discriminator = bytes.subarray(0, 8);
  const instruction = INSTRUCTION_MAP.get(discriminator.toString("hex"));
  if (!instruction) {
    return {
      status: "UNKNOWN_INSTRUCTION_DISCRIMINATOR",
      program_id: programId,
      discriminator_hex: discriminator.toString("hex"),
    };
  }

  const reader = new BorshReader(bytes.subarray(8));
  const typeMap = TYPE_MAPS.pump;
  const args = {};
  const missingArguments = [];

  for (let index = 0; index < instruction.args.length; index += 1) {
    const argument = instruction.args[index];
    if (reader.remaining === 0) {
      const optionalTail = instruction.args.slice(index).every((item) => {
        const name = typeof item.type?.defined === "string" ? item.type.defined : item.type?.defined?.name;
        return name === "OptionBool";
      });
      if (!optionalTail) {
        throw new BorshDecodeError(`missing required argument ${argument.name}`, reader.offset + 8);
      }
      for (const omitted of instruction.args.slice(index)) {
        args[omitted.name] = null;
        missingArguments.push(omitted.name);
      }
      break;
    }
    args[argument.name] = readIdlType(reader, argument.type, typeMap);
  }

  if (reader.remaining > 0) {
    return {
      status: "TRAILING_INSTRUCTION_BYTES",
      program_id: programId,
      instruction_name: instruction.name,
      args,
      missing_arguments: missingArguments,
      trailing_bytes: reader.remaining,
    };
  }

  return {
    status: missingArguments.length > 0 ? "DECODED_WITH_OMITTED_OPTIONAL_ARGS" : "DECODED",
    program_id: programId,
    instruction_name: instruction.name,
    discriminator_hex: discriminator.toString("hex"),
    args,
    missing_arguments: missingArguments,
    idl_snapshot_version: snapshot.snapshot_version,
  };
}

export function decodeProgramEvent({ programId, data, encoding = "base64" }) {
  const programNamespace = getProgramNamespace(programId);
  if (!programNamespace) return { status: "UNSUPPORTED_PROGRAM", program_id: programId };
  const bytes = toBuffer(data, encoding);
  return { program_id: programId, ...decodeEventBuffer(programNamespace, bytes) };
}

export function decodeProgramAccount({ programId, data, encoding = "base64" }) {
  const programNamespace = getProgramNamespace(programId);
  if (!programNamespace) return { status: "UNSUPPORTED_PROGRAM", program_id: programId };
  const bytes = toBuffer(data, encoding);
  if (bytes.length < 8) {
    return { status: "TRUNCATED_ACCOUNT_DISCRIMINATOR", program_id: programId };
  }
  const discriminator = bytes.subarray(0, 8);
  const account = ACCOUNT_MAPS[programNamespace].get(discriminator.toString("hex"));
  if (!account) {
    return {
      status: "UNKNOWN_ACCOUNT_DISCRIMINATOR",
      program_id: programId,
      discriminator_hex: discriminator.toString("hex"),
    };
  }
  const typeMap = TYPE_MAPS[programNamespace];
  const definition = typeMap.get(account.name);
  if (!definition) {
    return { status: "MISSING_ACCOUNT_TYPE_DEFINITION", program_id: programId, account_name: account.name };
  }
  const reader = new BorshReader(bytes.subarray(8));
  const decoded = readIdlDefinition(reader, definition, typeMap, 0, {
    allowMissingTrailingFields: ["BondingCurve", "Global", "FeeConfig"].includes(account.name),
  });
  if (reader.remaining > 0) {
    return {
      status: "TRAILING_ACCOUNT_BYTES",
      program_id: programId,
      account_name: account.name,
      data: decoded.value,
      missing_fields: decoded.missingFields,
      trailing_bytes: reader.remaining,
    };
  }
  return {
    status: decoded.missingFields.length > 0 ? "PARTIAL_ACCOUNT_LAYOUT" : "DECODED",
    program_id: programId,
    account_name: account.name,
    discriminator_hex: discriminator.toString("hex"),
    data: decoded.value,
    missing_fields: decoded.missingFields,
    idl_snapshot_version: snapshot.snapshot_version,
  };
}

export function decodeProgramDataLogs(logs, programId) {
  if (!Array.isArray(logs)) throw new TypeError("logs must be an array");
  const programNamespace = getProgramNamespace(programId);
  if (!programNamespace) return [{ status: "UNSUPPORTED_PROGRAM", program_id: programId }];

  const stack = [];
  const decodedEvents = [];
  let eventSequence = 0;

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
    const encoded = line.slice("Program data: ".length).trim();
    try {
      const bytes = decodeBase64(encoded);
      const decoded = decodeEventBuffer(programNamespace, bytes);
      decodedEvents.push({
        ...decoded,
        program_id: programId,
        log_index: logIndex,
        event_sequence: eventSequence,
      });
      eventSequence += 1;
    } catch (error) {
      decodedEvents.push({
        status: "EVENT_DECODE_ERROR",
        program_id: programId,
        log_index: logIndex,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return decodedEvents;
}

export function getPumpInstructionAccountNames(instructionName) {
  const definition = (snapshot.pump.instructions ?? []).find((instruction) => instruction.name === instructionName);
  if (!definition) return null;
  return (definition.accounts ?? []).map((account) => account.name);
}

export function getPumpIdlSnapshotMetadata() {
  return structuredClone(snapshot.source);
}
