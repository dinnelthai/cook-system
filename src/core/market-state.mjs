import { parseBaseUnits, formatBaseUnits, checkedAddU128, U64_MAX, U128_MAX } from "./integer.mjs";
import { sortForReplay } from "./event-order.mjs";

const RESERVE_FIELDS = [
  "virtual_token_reserves_base_units",
  "virtual_quote_reserves_base_units",
  "real_token_reserves_base_units",
  "real_quote_reserves_base_units",
  "token_total_supply_base_units",
  "protocol_fees_base_units",
  "creator_fees_base_units",
];

const NON_CURVE_EVENT_KINDS = new Set([
  "TOKEN_TRANSFER",
  "FEE_MOVEMENT",
  "AUTHORITY_CHANGE",
  "PUBLIC_INFORMATION",
  "ORDERING_METADATA",
  "ACCOUNT_BALANCE_SNAPSHOT",
  "DATA_GAP",
  "SIMULATION_INTENT",
  "SIMULATION_REJECTED_INTENT",
  "POST_COMPLETE_POOL_LEG",
  "FEE_CONFIG_CHANGE",
  "FEE_CONFIG_SNAPSHOT",
  "MARKET_CREATED",
  "POOL_CREATED",
  "POOL_BUY_EXECUTED",
  "POOL_SELL_EXECUTED",
  "POOL_LIQUIDITY_ADDED",
  "POOL_LIQUIDITY_REMOVED",
  "POOL_FEE_MOVEMENT",
]);

export class CurveStateTransitionError extends Error {
  constructor(eventId, reason) {
    super(`Invalid curve state transition at ${eventId}: ${reason}`);
    this.name = "CurveStateTransitionError";
  }
}

function normalizeReserveState(input, previous = null) {
  const output = {};
  for (const field of RESERVE_FIELDS) {
    const value = input[field] ?? previous?.[field] ?? "0";
    output[field] = formatBaseUnits(parseBaseUnits(value, { name: field }), { max: U64_MAX });
  }
  if (typeof (input.complete ?? previous?.complete ?? false) !== "boolean") {
    throw new TypeError("complete must be a boolean");
  }
  output.complete = input.complete ?? previous?.complete ?? false;
  return output;
}

function sameMarket(a, b) {
  return ["chain_id", "network", "token_mint", "quote_mint", "curve_program_id"]
    .every((key) => a?.[key] === b?.[key]);
}

function addVolume(current, amount, field) {
  const sum = checkedAddU128(
    parseBaseUnits(current, { name: field, max: U128_MAX }),
    parseBaseUnits(amount, { name: `${field} delta` }),
  );
  return formatBaseUnits(sum, { max: U128_MAX });
}

export function createInitialCurveStateFromMarketCreated({ marketCreatedEvent }) {
  if (!marketCreatedEvent || marketCreatedEvent.event_kind !== "MARKET_CREATED") {
    throw new TypeError("a normalized MARKET_CREATED event is required");
  }
  const reserves = marketCreatedEvent.payload?.initial_curve_state;
  if (!reserves) throw new TypeError("MARKET_CREATED event is missing initial_curve_state");
  return createInitialCurveState({
    market: marketCreatedEvent.market,
    reserves,
    asOfEventId: marketCreatedEvent.event_id,
  });
}

export function createInitialCurveState({ market, reserves, asOfEventId = null }) {
  if (!market || typeof market.token_mint !== "string") throw new TypeError("market identity is required");
  const normalized = normalizeReserveState(reserves);
  return {
    schema_version: "1.0.0",
    market: structuredClone(market),
    ...normalized,
    lifecycle: normalized.complete ? "complete_pending_migration" : "bonding_curve",
    as_of_event_id: asOfEventId,
    curve_buy_quote_volume_base_units: "0",
    curve_sell_quote_volume_base_units: "0",
    curve_token_volume_base_units: "0",
    execution_count: 0,
    ignored_non_curve_event_count: 0,
  };
}

function applyFeeBalanceDelta(state, event) {
  const delta = event.payload?.fee_balances_delta ?? {};
  const protocol = parseBaseUnits(delta.protocol_fees_base_units ?? "0", { name: "fee_balances_delta.protocol_fees_base_units" });
  const creator = parseBaseUnits(delta.creator_fees_base_units ?? "0", { name: "fee_balances_delta.creator_fees_base_units" });
  return {
    ...state,
    protocol_fees_base_units: formatBaseUnits(checkedAddU128(parseBaseUnits(state.protocol_fees_base_units, { name: "protocol_fees_base_units" }), protocol, "protocol_fees_base_units")),
    creator_fees_base_units: formatBaseUnits(checkedAddU128(parseBaseUnits(state.creator_fees_base_units, { name: "creator_fees_base_units" }), creator, "creator_fees_base_units")),
  };
}

function applyFeeMovement(state, event) {
  const amount = parseBaseUnits(event.payload?.amount_base_units, { name: "fee movement amount" });
  const bucket = Number(event.payload?.fee_bucket);
  const field = bucket === 0 ? "protocol_fees_base_units" : bucket === 1 ? "creator_fees_base_units" : null;
  if (!field) throw new CurveStateTransitionError(event.event_id, "unknown bonding-curve fee bucket");
  const current = parseBaseUnits(state[field], { name: field });
  if (amount > current) throw new CurveStateTransitionError(event.event_id, "fee sweep exceeds accrued fee balance");
  return {
    ...state,
    [field]: formatBaseUnits(current - amount),
    fee_movement_count: (state.fee_movement_count ?? 0) + 1,
    as_of_event_id: event.event_id,
  };
}

function applyCurveExecution(state, event) {
  if (state.complete || state.lifecycle !== "bonding_curve") {
    throw new CurveStateTransitionError(event.event_id, "curve execution received after completion");
  }
  const payload = event.payload ?? {};
  const post = payload.post_curve_state;
  if (!post || typeof post !== "object") {
    throw new CurveStateTransitionError(event.event_id, "missing authoritative post_curve_state");
  }
  for (const field of ["virtual_token_reserves_base_units", "virtual_quote_reserves_base_units", "real_token_reserves_base_units", "real_quote_reserves_base_units", "complete"]) {
    if (!Object.hasOwn(post, field)) {
      throw new CurveStateTransitionError(event.event_id, `post_curve_state is missing ${field}`);
    }
  }
  const nextReserves = normalizeReserveState(post, state);
  const quoteAmount = parseBaseUnits(payload.quote_amount_base_units, { name: "quote_amount_base_units" });
  const tokenAmount = parseBaseUnits(payload.token_amount_base_units, { name: "token_amount_base_units" });
  if (quoteAmount === 0n || tokenAmount === 0n) {
    throw new CurveStateTransitionError(event.event_id, "confirmed execution amounts must be positive");
  }

  const isBuy = event.event_kind === "CURVE_BUY_EXECUTED";
  const next = {
    ...state,
    ...nextReserves,
    as_of_event_id: event.event_id,
    execution_count: state.execution_count + 1,
    curve_token_volume_base_units: addVolume(state.curve_token_volume_base_units, payload.token_amount_base_units, "curve_token_volume_base_units"),
  };
  if (isBuy) {
    next.curve_buy_quote_volume_base_units = addVolume(state.curve_buy_quote_volume_base_units, payload.quote_amount_base_units, "curve_buy_quote_volume_base_units");
  } else {
    next.curve_sell_quote_volume_base_units = addVolume(state.curve_sell_quote_volume_base_units, payload.quote_amount_base_units, "curve_sell_quote_volume_base_units");
  }
  if (next.complete) next.lifecycle = "complete_pending_migration";
  return applyFeeBalanceDelta(next, event);
}

function compareSnapshot(state, snapshot, eventId) {
  const requiredFields = [...RESERVE_FIELDS, "complete"];
  const missingFields = requiredFields.filter((field) => !Object.hasOwn(snapshot, field));
  if (missingFields.length > 0) {
    return { event_id: eventId, status: "UNKNOWN", mismatches: [], missing_fields: missingFields };
  }
  const expected = normalizeReserveState(snapshot, state);
  const mismatches = [];
  for (const field of requiredFields) {
    if (expected[field] !== state[field]) {
      mismatches.push({ field, replayed: state[field], observed: expected[field] });
    }
  }
  return {
    event_id: eventId,
    status: mismatches.length === 0 ? "PASS" : "FAIL",
    mismatches,
    missing_fields: [],
  };
}

export function replayCurveEvents(initialState, events) {
  if (!initialState || !Array.isArray(events)) throw new TypeError("initialState and events are required");
  const ordered = sortForReplay(events);
  let state = structuredClone(initialState);
  const reconciliations = [];
  const processedEventIds = [];

  for (const event of ordered) {
    if (!sameMarket(state.market, event.market)) {
      throw new CurveStateTransitionError(event.event_id, "event belongs to a different market");
    }
    switch (event.event_kind) {
      case "CURVE_BUY_EXECUTED":
      case "CURVE_SELL_EXECUTED":
        state = applyCurveExecution(state, event);
        break;
      case "CURVE_STATE_SNAPSHOT":
        reconciliations.push(compareSnapshot(state, event.payload?.state ?? {}, event.event_id));
        break;
      case "POST_COMPLETE_POOL_LEG":
        state = applyFeeBalanceDelta(state, event);
        state = { ...state, post_complete_pool_leg_count: (state.post_complete_pool_leg_count ?? 0) + 1, as_of_event_id: event.event_id };
        break;
      case "FEE_MOVEMENT":
        state = applyFeeMovement(state, event);
        break;
      case "CURVE_COMPLETE":
        if (!state.complete) {
          if (state.real_token_reserves_base_units !== "0") {
            throw new CurveStateTransitionError(event.event_id, "completion event conflicts with non-zero real token reserves");
          }
          state = { ...state, complete: true, lifecycle: "complete_pending_migration", as_of_event_id: event.event_id };
        }
        break;
      case "CURVE_MIGRATED":
        if (!state.complete) {
          throw new CurveStateTransitionError(event.event_id, "migration event received before curve completion");
        }
        state = { ...state, lifecycle: "graduated", as_of_event_id: event.event_id };
        break;
      default:
        if (!NON_CURVE_EVENT_KINDS.has(event.event_kind)) {
          throw new CurveStateTransitionError(event.event_id, `unsupported event kind ${event.event_kind}`);
        }
        state = { ...state, ignored_non_curve_event_count: state.ignored_non_curve_event_count + 1 };
    }
    processedEventIds.push(event.event_id);
  }

  return { state, reconciliations, processed_event_ids: processedEventIds };
}
