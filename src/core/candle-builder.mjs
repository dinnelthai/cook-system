import { parseBaseUnits, formatBaseUnits, checkedAddU128, U128_MAX } from "./integer.mjs";
import { sortForReplay } from "./event-order.mjs";

const EXECUTION_KINDS = new Set(["CURVE_BUY_EXECUTED", "CURVE_SELL_EXECUTED", "POOL_BUY_EXECUTED", "POOL_SELL_EXECUTED"]);

function parseDecimal(value, name = "price") {
  if (typeof value !== "string" || value.length > 160 || !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)) {
    throw new TypeError(`${name} must be a non-negative plain decimal string`);
  }
  const [whole, fraction = ""] = value.split(".");
  const trimmedFraction = fraction.replace(/0+$/, "");
  const scale = trimmedFraction.length;
  const digits = `${whole}${trimmedFraction}`;
  return { coefficient: BigInt(digits), scale };
}

function formatDecimal({ coefficient, scale }) {
  let digits = coefficient.toString(10);
  if (scale === 0) return digits;
  if (digits.length <= scale) digits = `${"0".repeat(scale - digits.length + 1)}${digits}`;
  const splitAt = digits.length - scale;
  const whole = digits.slice(0, splitAt);
  const fraction = digits.slice(splitAt).replace(/0+$/, "");
  return fraction.length ? `${whole}.${fraction}` : whole;
}

function compareDecimal(a, b) {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  const scale = Math.max(left.scale, right.scale);
  const leftValue = left.coefficient * (10n ** BigInt(scale - left.scale));
  const rightValue = right.coefficient * (10n ** BigInt(scale - right.scale));
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function marketKey(market, provenance, scenarioId, poolAddress) {
  return JSON.stringify({
    chain_id: market.chain_id,
    network: market.network,
    token_mint: market.token_mint,
    quote_mint: market.quote_mint,
    curve_program_id: market.curve_program_id,
    market_phase: market.market_phase,
    curve_account: market.curve_account ?? null,
    pool_address: poolAddress,
    provenance,
    scenario_id: scenarioId ?? null,
  });
}

function bucketStart(timestamp, intervalMs) {
  return Math.floor(timestamp / intervalMs) * intervalMs;
}

export function buildRawCandles(events, intervalMs) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
    throw new RangeError("intervalMs must be a positive safe integer");
  }
  if (!Array.isArray(events)) throw new TypeError("events must be an array");

  const executions = events.filter((event) => EXECUTION_KINDS.has(event?.event_kind));
  if (executions.length === 0) return [];

  const ordered = sortForReplay(executions);
  const candles = new Map();

  for (const event of ordered) {
    if (!event.market || typeof event.market.token_mint !== "string") {
      throw new TypeError(`event ${event.event_id} is missing market identity`);
    }
    if (!Number.isSafeInteger(event.event_time_ms) || event.event_time_ms < 0) {
      throw new TypeError(`event ${event.event_id} has invalid event_time_ms`);
    }
    const payload = event.payload ?? {};
    const price = formatDecimal(parseDecimal(payload.execution_price_decimal, "execution_price_decimal"));
    if (compareDecimal(price, "0") <= 0) throw new RangeError("execution price must be greater than zero");
    const quoteAmount = parseBaseUnits(payload.quote_amount_base_units, { name: "quote_amount_base_units" });
    const tokenAmount = parseBaseUnits(payload.token_amount_base_units, { name: "token_amount_base_units" });
    if (quoteAmount === 0n || tokenAmount === 0n) throw new RangeError("confirmed execution amounts must be positive");

    const scenarioId = event.synthetic_metadata?.scenario_id ?? null;
    const poolAddress = event.event_kind.startsWith("POOL_") ? payload.pool_address ?? null : null;
    if (poolAddress !== null && (typeof poolAddress !== "string" || !poolAddress.trim())) throw new TypeError("invalid pool address");
    const start = bucketStart(event.event_time_ms, intervalMs);
    if (!Number.isSafeInteger(start + intervalMs)) throw new RangeError("candle interval end exceeds safe integer range");
    const key = `${marketKey(event.market, event.provenance, scenarioId, poolAddress)}:${start}`;
    const side = event.event_kind === "CURVE_BUY_EXECUTED" || event.event_kind === "POOL_BUY_EXECUTED" ? "buy" : "sell";
    let candle = candles.get(key);

    if (!candle) {
      candle = {
        schema_version: "1.0.0",
        market: event.market,
        ...(poolAddress === null ? {} : {pool_address: poolAddress}),
        interval_start_ms: start,
        interval_end_ms: start + intervalMs,
        open_price: price,
        high_price: price,
        low_price: price,
        close_price: price,
        quote_volume_base_units: 0n,
        token_volume_base_units: 0n,
        buy_quote_volume_base_units: 0n,
        sell_quote_volume_base_units: 0n,
        execution_count: 0,
        first_event_id: event.event_id,
        last_event_id: event.event_id,
        event_order_completeness: "complete",
        provenance: event.provenance,
        scenario_id: scenarioId,
      };
      candles.set(key, candle);
    } else {
      if (compareDecimal(price, candle.high_price) > 0) candle.high_price = price;
      if (compareDecimal(price, candle.low_price) < 0) candle.low_price = price;
      candle.close_price = price;
      candle.last_event_id = event.event_id;
    }

    candle.quote_volume_base_units = checkedAddU128(candle.quote_volume_base_units, quoteAmount);
    candle.token_volume_base_units = checkedAddU128(candle.token_volume_base_units, tokenAmount);
    if (side === "buy") {
      candle.buy_quote_volume_base_units = checkedAddU128(candle.buy_quote_volume_base_units, quoteAmount);
    } else {
      candle.sell_quote_volume_base_units = checkedAddU128(candle.sell_quote_volume_base_units, quoteAmount);
    }
    candle.execution_count += 1;
  }

  return [...candles.values()]
    .sort((a, b) => a.interval_start_ms - b.interval_start_ms || a.market.token_mint.localeCompare(b.market.token_mint) || (a.market.curve_account??"").localeCompare(b.market.curve_account??"") || (a.pool_address??"").localeCompare(b.pool_address??""))
    .map((candle) => ({
      ...candle,
      quote_volume_base_units: formatBaseUnits(candle.quote_volume_base_units, { max: U128_MAX }),
      token_volume_base_units: formatBaseUnits(candle.token_volume_base_units, { max: U128_MAX }),
      buy_quote_volume_base_units: formatBaseUnits(candle.buy_quote_volume_base_units, { max: U128_MAX }),
      sell_quote_volume_base_units: formatBaseUnits(candle.sell_quote_volume_base_units, { max: U128_MAX }),
    }));
}
