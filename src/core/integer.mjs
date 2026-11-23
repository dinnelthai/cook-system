export const U64_MAX = (1n << 64n) - 1n;
export const U128_MAX = (1n << 128n) - 1n;

function assertUnsignedBigInt(value, name = "value", max = U128_MAX) {
  if (typeof value !== "bigint") {
    throw new TypeError(`${name} must be a bigint`);
  }
  if (value < 0n || value > max) {
    throw new RangeError(`${name} is outside the supported unsigned range`);
  }
}

export function parseBaseUnits(value, { name = "value", max = U64_MAX } = {}) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new TypeError(`${name} must be a canonical unsigned integer string`);
  }
  const parsed = BigInt(value);
  assertUnsignedBigInt(parsed, name, max);
  return parsed;
}

export function formatBaseUnits(value, { name = "value", max = U64_MAX } = {}) {
  assertUnsignedBigInt(value, name, max);
  return value.toString(10);
}

export function checkedAddU128(a, b) {
  assertUnsignedBigInt(a, "a", U128_MAX);
  assertUnsignedBigInt(b, "b", U128_MAX);
  const result = a + b;
  assertUnsignedBigInt(result, "sum", U128_MAX);
  return result;
}

export function checkedAddU64(a, b) {
  assertUnsignedBigInt(a, "a", U64_MAX);
  assertUnsignedBigInt(b, "b", U64_MAX);
  const result = a + b;
  assertUnsignedBigInt(result, "sum", U64_MAX);
  return result;
}

export function checkedSubU64(a, b) {
  assertUnsignedBigInt(a, "a", U64_MAX);
  assertUnsignedBigInt(b, "b", U64_MAX);
  if (b > a) throw new RangeError("unsigned subtraction underflow");
  return a - b;
}

export function mulDivFloor(a, b, denominator, { max = U128_MAX } = {}) {
  assertUnsignedBigInt(a, "a", U128_MAX);
  assertUnsignedBigInt(b, "b", U128_MAX);
  assertUnsignedBigInt(denominator, "denominator", U128_MAX);
  if (denominator === 0n) throw new RangeError("division by zero");
  const result = (a * b) / denominator;
  assertUnsignedBigInt(result, "mulDivFloor result", max);
  return result;
}

export function mulDivCeil(a, b, denominator, { max = U128_MAX } = {}) {
  assertUnsignedBigInt(a, "a", U128_MAX);
  assertUnsignedBigInt(b, "b", U128_MAX);
  assertUnsignedBigInt(denominator, "denominator", U128_MAX);
  if (denominator === 0n) throw new RangeError("division by zero");
  const product = a * b;
  const result = (product + denominator - 1n) / denominator;
  assertUnsignedBigInt(result, "mulDivCeil result", max);
  return result;
}
