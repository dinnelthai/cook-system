const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map([...BASE58_ALPHABET].map((char, index) => [char, BigInt(index)]));

export function decodeBase58(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("base58 value must be a non-empty string");
  }
  let integer = 0n;
  for (const char of value) {
    const digit = BASE58_INDEX.get(char);
    if (digit === undefined) throw new TypeError(`invalid base58 character: ${char}`);
    integer = integer * 58n + digit;
  }
  const bytes = [];
  while (integer > 0n) {
    bytes.push(Number(integer & 0xffn));
    integer >>= 8n;
  }
  bytes.reverse();
  let leadingZeroes = 0;
  while (leadingZeroes < value.length && value[leadingZeroes] === "1") leadingZeroes += 1;
  return Buffer.concat([Buffer.alloc(leadingZeroes), Buffer.from(bytes)]);
}

export function encodeBase58(input) {
  const bytes = Buffer.from(input);
  let integer = 0n;
  for (const byte of bytes) integer = (integer << 8n) | BigInt(byte);
  let encoded = "";
  while (integer > 0n) {
    const remainder = Number(integer % 58n);
    encoded = BASE58_ALPHABET[remainder] + encoded;
    integer /= 58n;
  }
  let leadingZeroes = 0;
  while (leadingZeroes < bytes.length && bytes[leadingZeroes] === 0) leadingZeroes += 1;
  return "1".repeat(leadingZeroes) + encoded;
}

export class BorshDecodeError extends Error {
  constructor(message, offset = null) {
    super(offset === null ? message : `${message} at byte offset ${offset}`);
    this.name = "BorshDecodeError";
    this.offset = offset;
  }
}

export class BorshReader {
  constructor(input) {
    this.buffer = Buffer.from(input);
    this.offset = 0;
  }

  get remaining() {
    return this.buffer.length - this.offset;
  }

  readBytes(length) {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new BorshDecodeError("invalid byte length", this.offset);
    }
    if (this.remaining < length) {
      throw new BorshDecodeError(`expected ${length} bytes but only ${this.remaining} remain`, this.offset);
    }
    const result = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  readU8() {
    return this.readBytes(1).readUInt8(0);
  }

  readU16() {
    return this.readBytes(2).readUInt16LE(0);
  }

  readU32() {
    return this.readBytes(4).readUInt32LE(0);
  }

  readU64() {
    return this.readBytes(8).readBigUInt64LE(0);
  }

  readU128() {
    const bytes = this.readBytes(16);
    return bytes.readBigUInt64LE(0) | (bytes.readBigUInt64LE(8) << 64n);
  }

  readI64() {
    return this.readBytes(8).readBigInt64LE(0);
  }

  readBool() {
    const value = this.readU8();
    if (value !== 0 && value !== 1) {
      throw new BorshDecodeError(`invalid bool byte ${value}`, this.offset - 1);
    }
    return value === 1;
  }

  readPubkey() {
    return encodeBase58(this.readBytes(32));
  }

  readString() {
    const length = this.readU32();
    const bytes = this.readBytes(length);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new BorshDecodeError("invalid UTF-8 string", this.offset - length);
    }
  }
}

function resolveDefinedName(type) {
  if (typeof type?.defined === "string") return type.defined;
  if (typeof type?.defined?.name === "string") return type.defined.name;
  return null;
}

function defaultForType(type, typeMap, depth = 0) {
  if (depth > 32) throw new BorshDecodeError("IDL type recursion limit exceeded");
  if (typeof type === "string") {
    if (["u8", "u16", "u32", "u64", "u128", "i64"].includes(type)) return 0n;
    if (type === "bool") return false;
    if (type === "pubkey") return "11111111111111111111111111111111";
    if (type === "string") return "";
    throw new BorshDecodeError(`no default defined for IDL type ${type}`);
  }
  if (Array.isArray(type)) {
    const [inner, length] = type;
    return Array.from({ length }, () => defaultForType(inner, typeMap, depth + 1));
  }
  if (type && typeof type === "object") {
    if (Object.hasOwn(type, "vec")) return [];
    if (Object.hasOwn(type, "option")) return null;
    if (Object.hasOwn(type, "array")) {
      const [inner, length] = type.array;
      return Array.from({ length }, () => defaultForType(inner, typeMap, depth + 1));
    }
    if (Object.hasOwn(type, "defined")) {
      const name = resolveDefinedName(type);
      const definition = typeMap.get(name);
      if (!definition) throw new BorshDecodeError(`unknown IDL type ${name}`);
      return defaultForDefinition(definition, typeMap, depth + 1);
    }
  }
  throw new BorshDecodeError("unsupported IDL default type");
}

function defaultForDefinition(definition, typeMap, depth = 0) {
  const shape = definition.type ?? definition;
  if (shape.kind === "struct") {
    const fields = shape.fields ?? [];
    if (fields.every((field) => typeof field === "string")) {
      return fields.map((field) => defaultForType(field, typeMap, depth + 1));
    }
    return Object.fromEntries(fields.map((field) => [
      field.name,
      defaultForType(field.type, typeMap, depth + 1),
    ]));
  }
  throw new BorshDecodeError("no default defined for non-struct IDL type");
}

export function readIdlType(reader, type, typeMap, depth = 0) {
  if (depth > 32) throw new BorshDecodeError("IDL type recursion limit exceeded", reader.offset);
  if (typeof type === "string") {
    switch (type) {
      case "u8": return BigInt(reader.readU8());
      case "u16": return BigInt(reader.readU16());
      case "u32": return BigInt(reader.readU32());
      case "u64": return reader.readU64();
      case "u128": return reader.readU128();
      case "i64": return reader.readI64();
      case "bool": return reader.readBool();
      case "pubkey": return reader.readPubkey();
      case "string": return reader.readString();
      default: throw new BorshDecodeError(`unsupported IDL primitive: ${type}`, reader.offset);
    }
  }

  if (Array.isArray(type)) {
    const [inner, length] = type;
    return Array.from({ length }, () => readIdlType(reader, inner, typeMap, depth + 1));
  }

  if (!type || typeof type !== "object") {
    throw new BorshDecodeError("invalid IDL type", reader.offset);
  }

  if (Object.hasOwn(type, "vec")) {
    const length = reader.readU32();
    if (length > 1_000_000) throw new BorshDecodeError("IDL vector exceeds safety limit", reader.offset - 4);
    return Array.from({ length }, () => readIdlType(reader, type.vec, typeMap, depth + 1));
  }

  if (Object.hasOwn(type, "option")) {
    const tag = reader.readU8();
    if (tag === 0) return null;
    if (tag !== 1) throw new BorshDecodeError(`invalid option tag ${tag}`, reader.offset - 1);
    return readIdlType(reader, type.option, typeMap, depth + 1);
  }

  if (Object.hasOwn(type, "array")) {
    const [inner, length] = type.array;
    if (!Number.isSafeInteger(length) || length < 0 || length > 1_000_000) {
      throw new BorshDecodeError("invalid fixed array length", reader.offset);
    }
    return Array.from({ length }, () => readIdlType(reader, inner, typeMap, depth + 1));
  }

  if (Object.hasOwn(type, "defined")) {
    const name = resolveDefinedName(type);
    const definition = typeMap.get(name);
    if (!definition) throw new BorshDecodeError(`unknown IDL type ${name}`, reader.offset);
    return readIdlDefinition(reader, definition, typeMap, depth + 1);
  }

  throw new BorshDecodeError("unsupported compound IDL type", reader.offset);
}

export function readIdlDefinition(reader, definition, typeMap, depth = 0, options = {}) {
  if (depth > 32) throw new BorshDecodeError("IDL definition recursion limit exceeded", reader.offset);
  const shape = definition.type ?? definition;
  if (shape.kind !== "struct") {
    throw new BorshDecodeError(`unsupported IDL definition kind: ${shape.kind}`, reader.offset);
  }

  const fields = shape.fields ?? [];
  const tuple = fields.every((field) => typeof field === "string");
  const value = tuple ? [] : {};
  const missingFields = [];

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const name = tuple ? String(index) : field.name;
    const fieldType = tuple ? field : field.type;

    if (reader.remaining === 0 && options.allowMissingTrailingFields === true) {
      const defaultValue = defaultForType(fieldType, typeMap, depth + 1);
      if (tuple) value.push(defaultValue);
      else value[name] = defaultValue;
      missingFields.push(name);
      continue;
    }

    const fieldValue = readIdlType(reader, fieldType, typeMap, depth + 1);
    if (tuple) value.push(fieldValue);
    else value[name] = fieldValue;
  }

  return { value, missingFields };
}

export function createTypeMap(snapshot, program = "pump") {
  const types = snapshot?.[program]?.types;
  if (!Array.isArray(types)) throw new TypeError(`snapshot is missing ${program}.types`);
  return new Map(types.map((definition) => [definition.name, definition]));
}

export function decodeBase64(input) {
  if (typeof input !== "string" || input.length === 0) throw new TypeError("base64 input must be non-empty");
  const compact = input.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 !== 0) {
    throw new TypeError("invalid base64 input");
  }
  return Buffer.from(compact, "base64");
}

export function decodeIdlStructBytes(bytes, definition, typeMap, { allowMissingTrailingFields = false } = {}) {
  const reader = new BorshReader(bytes);
  const decoded = readIdlDefinition(reader, definition, typeMap, 0, { allowMissingTrailingFields });
  return {
    value: decoded.value,
    missing_fields: decoded.missingFields,
    bytes_consumed: reader.offset,
    trailing_bytes: reader.remaining,
  };
}
