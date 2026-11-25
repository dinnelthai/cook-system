import { sortForReplay } from "./event-order.mjs";

function toBigInt(value, name) {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^-?(0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  throw new TypeError(`${name} must be an integer`);
}

function nonNegative(value, name) {
  const result = toBigInt(value, name);
  if (result < 0n) throw new RangeError(`${name} cannot be negative`);
  return result;
}

function addNonNegative(current, delta, name) {
  const result = toBigInt(current, name) + toBigInt(delta, `${name} delta`);
  if (result < 0n) throw new Error(`${name} would become negative`);
  return result.toString();
}

function assertPoolReserveInvariants(state, eventId = "unknown") {
  const virtual = toBigInt(state.virtual_quote_reserves_base_units, "virtual quote reserves");
  const protocol = nonNegative(state.protocol_fees_base_units, "protocol fees");
  const creator = nonNegative(state.creator_fees_base_units, "creator fees");
  const boost = nonNegative(state.boost_reserves_base_units, "boost reserves");
  if (virtual + protocol + creator !== boost) {
    throw new Error(`PumpSwap boost reserve invariant failed at ${eventId}`);
  }
  const effectiveQuote = nonNegative(state.pool_quote_reserves_base_units, "raw quote reserves") + virtual;
  if (effectiveQuote < 0n || effectiveQuote > ((1n << 64n) - 1n)) {
    throw new Error(`PumpSwap effective quote reserves are outside u64 range at ${eventId}`);
  }
}

function samePool(a, b) {
  return a?.pool_address === b?.pool_address &&
    a?.market?.token_mint === b?.market?.token_mint &&
    a?.market?.quote_mint === b?.market?.quote_mint;
}

export function createInitialPumpSwapPoolState({ poolCreatedEvent, decodedPool = null }) {
  if (!poolCreatedEvent || poolCreatedEvent.event_kind !== "POOL_CREATED") {
    throw new TypeError("a normalized POOL_CREATED event is required");
  }
  const payload = poolCreatedEvent.payload ?? {};
  const base = nonNegative(payload.pool_base_reserves_base_units, "initial pool base reserves");
  const quote = nonNegative(payload.pool_quote_reserves_base_units, "initial pool quote reserves");
  if (base === 0n || quote === 0n) throw new RangeError("initial PumpSwap pool reserves must be positive");
  const currentVirtual = toBigInt(decodedPool?.data?.virtual_quote_reserves_base_units ?? "0", "current virtual quote reserves");
  const currentProtocol = nonNegative(decodedPool?.data?.protocol_fees_base_units ?? "0", "current protocol fees");
  const currentCreator = nonNegative(decodedPool?.data?.creator_fees_base_units ?? "0", "current creator fees");
  const boostReserves = currentVirtual + currentProtocol + currentCreator;
  if (boostReserves < 0n) throw new RangeError("derived PumpSwap boost reserves cannot be negative");
  return {
    schema_version: "1.0.0",
    pool_address: payload.pool_address,
    market: structuredClone(poolCreatedEvent.market),
    base_mint: payload.base_mint,
    quote_mint: payload.quote_mint,
    pool_base_reserves_base_units: base.toString(),
    pool_quote_reserves_base_units: quote.toString(),
    virtual_quote_reserves_base_units: boostReserves.toString(),
    boost_reserves_base_units: boostReserves.toString(),
    boost_reserves_baseline_status: decodedPool ? "DERIVED_FROM_POOL_ACCOUNT_INVARIANT" : "UNKNOWN",
    protocol_fees_base_units: "0",
    creator_fees_base_units: "0",
    pool_buy_quote_volume_base_units: "0",
    pool_sell_quote_volume_base_units: "0",
    pool_token_volume_base_units: "0",
    trade_count: 0,
    liquidity_add_count: 0,
    liquidity_remove_count: 0,
    fee_sweep_count: 0,
    boost_transition_count: 0,
    as_of_event_id: poolCreatedEvent.event_id,
  };
}

function applyFeeDelta(state, event) {
  const delta = event.payload?.fee_balances_delta ?? {};
  const protocolDelta = toBigInt(delta.protocol_fees_base_units ?? "0", "protocol fee delta");
  const creatorDelta = toBigInt(delta.creator_fees_base_units ?? "0", "creator fee delta");
  const next = {
    ...state,
    protocol_fees_base_units: addNonNegative(
      state.protocol_fees_base_units,
      protocolDelta,
      "protocol_fees_base_units",
    ),
    creator_fees_base_units: addNonNegative(
      state.creator_fees_base_units,
      creatorDelta,
      "creator_fees_base_units",
    ),
    virtual_quote_reserves_base_units: (
      toBigInt(state.virtual_quote_reserves_base_units, "virtual quote reserves") -
      protocolDelta - creatorDelta
    ).toString(),
  };
  assertPoolReserveInvariants(next, event.event_id);
  return next;
}

function applyPoolFeeMovement(state, event) {
  const payload = event.payload ?? {};
  const amount = nonNegative(payload.amount_base_units, "pool fee sweep amount");
  const bucket = Number(payload.fee_bucket);
  const field = bucket === 0 ? "protocol_fees_base_units" : bucket === 1 ? "creator_fees_base_units" : null;
  if (!field) throw new Error(`unknown PumpSwap fee bucket: ${payload.fee_bucket}`);
  const current = nonNegative(state[field], field);
  if (amount > current) throw new Error(`PumpSwap fee sweep exceeds accrued ${field}`);
  const next = {
    ...state,
    [field]: (current - amount).toString(),
    virtual_quote_reserves_base_units: (
      toBigInt(state.virtual_quote_reserves_base_units, "virtual quote reserves") + amount
    ).toString(),
    fee_sweep_count: state.fee_sweep_count + 1,
  };
  assertPoolReserveInvariants(next, event.event_id);
  return next;
}

function applyVaultDeltas(state, event) {
  const delta = event.payload?.pool_vault_deltas;
  if (!delta || delta.base_delta_base_units == null || delta.quote_delta_base_units == null) {
    return { state, status: "UNKNOWN", reason: "pool_vault_token_account_deltas_unavailable" };
  }
  const base = addNonNegative(
    state.pool_base_reserves_base_units,
    delta.base_delta_base_units,
    "pool_base_reserves_base_units",
  );
  const quote = addNonNegative(
    state.pool_quote_reserves_base_units,
    delta.quote_delta_base_units,
    "pool_quote_reserves_base_units",
  );
  const next = {
    ...state,
    pool_base_reserves_base_units: base,
    pool_quote_reserves_base_units: quote,
  };
  assertPoolReserveInvariants(next, event.event_id);
  return {
    state: next,
    status: "PASS",
    reason: "pool_vault_token_account_deltas_applied",
  };
}

export function replayPumpSwapPoolEvents(initialState, events) {
  if (!initialState || !Array.isArray(events)) throw new TypeError("initialState and events are required");
  const ordered = sortForReplay(events);
  let state = structuredClone(initialState);
  const reconciliations = [];
  const processedEventIds = [];
  const transactionGroups = [];

  for (const event of ordered) {
    if (!samePool(state, {
      pool_address: event.payload?.pool_address,
      market: event.market,
    })) {
      throw new Error(`event ${event.event_id} belongs to a different PumpSwap pool`);
    }
    const signature = event.source?.signature ?? event.payload?.signature;
    let group = transactionGroups.at(-1);
    if (!group || group.signature !== signature) {
      group = { signature, events: [] };
      transactionGroups.push(group);
    }
    group.events.push(event);
  }

  for (const group of transactionGroups) {
    const firstObserved = group.events.find((event) => event.payload?.pool_reserves_before);
    if (firstObserved) {
      const before = firstObserved.payload.pool_reserves_before;
      const mismatches = [];
      if (String(before.pool_base_reserves_base_units) !== state.pool_base_reserves_base_units) {
        mismatches.push({
          field: "pool_base_reserves_base_units",
          replayed: state.pool_base_reserves_base_units,
          observed_before: String(before.pool_base_reserves_base_units),
        });
      }
      if (String(before.pool_quote_reserves_base_units) !== state.pool_quote_reserves_base_units) {
        mismatches.push({
          field: "pool_quote_reserves_base_units",
          replayed: state.pool_quote_reserves_base_units,
          observed_before: String(before.pool_quote_reserves_base_units),
        });
      }
      reconciliations.push({
        signature: group.signature,
        event_id: firstObserved.event_id,
        status: mismatches.length ? "FAIL" : "PASS",
        mismatches,
        observation: "pre_operation_pool_reserves",
      });
      if (state.boost_reserves_baseline_status === "UNKNOWN") {
        reconciliations.push({
          signature: group.signature,
          event_id: firstObserved.event_id,
          status: "UNKNOWN",
          reason: "current Pool account is required to derive immutable boost reserve baseline",
        });
      }
    }

    const deltaEvents = group.events.filter((event) => event.payload?.pool_vault_deltas);
    const deltaEvent = deltaEvents[0];
    const deltaFields=["base_delta_base_units","quote_delta_base_units"];
    const deltaConflict=deltaEvents.some(e=>deltaFields.some(f=>e.payload.pool_vault_deltas[f]!==deltaEvent.payload.pool_vault_deltas[f])||
      (e.payload.pool_vault_deltas.source_signature!=null&&e.payload.pool_vault_deltas.source_signature!==group.signature));
    if(deltaConflict)reconciliations.push({signature:group.signature,status:"FAIL",reason:"conflicting_transaction_vault_delta_evidence"});
    let deltaResult = { state, status: "UNKNOWN", reason: "pool_vault_token_account_deltas_unavailable" };
    if (deltaEvent && !deltaConflict) deltaResult = applyVaultDeltas(state, deltaEvent);
    state = deltaResult.state;

    for (const event of group.events) {
      const payload = event.payload ?? {};
      switch (event.event_kind) {
        case "POOL_BUY_EXECUTED":
        case "POOL_SELL_EXECUTED": {
          const amount = nonNegative(payload.token_amount_base_units, "pool trade token amount");
          const quote = nonNegative(payload.quote_amount_base_units, "pool trade quote amount");
          state = {
            ...state,
            trade_count: state.trade_count + 1,
            pool_token_volume_base_units: (nonNegative(state.pool_token_volume_base_units, "pool_token_volume_base_units") + amount).toString(),
            pool_buy_quote_volume_base_units: event.event_kind === "POOL_BUY_EXECUTED"
              ? (nonNegative(state.pool_buy_quote_volume_base_units, "pool_buy_quote_volume_base_units") + quote).toString()
              : state.pool_buy_quote_volume_base_units,
            pool_sell_quote_volume_base_units: event.event_kind === "POOL_SELL_EXECUTED"
              ? (nonNegative(state.pool_sell_quote_volume_base_units, "pool_sell_quote_volume_base_units") + quote).toString()
              : state.pool_sell_quote_volume_base_units,
            as_of_event_id: event.event_id,
          };
          const virtualBefore = state.virtual_quote_reserves_base_units;
          state = applyFeeDelta(state, event);
          const reportedVirtual = payload.virtual_quote_reserves_reported_base_units;
          if (reportedVirtual !== undefined && String(reportedVirtual) !== state.virtual_quote_reserves_base_units &&
              String(reportedVirtual) !== virtualBefore) {
            reconciliations.push({
              signature: group.signature,
              event_id: event.event_id,
              status: "FAIL",
              reason: "reported virtual_quote_reserves matches neither pre- nor post-trade replay state",
              virtual_before: virtualBefore,
              virtual_after: state.virtual_quote_reserves_base_units,
              virtual_reported: String(reportedVirtual),
            });
          } else if (reportedVirtual !== undefined) {
            reconciliations.push({
              signature: group.signature,
              event_id: event.event_id,
              status: "PASS",
              virtual_observation: String(reportedVirtual) === state.virtual_quote_reserves_base_units ? "post_operation" : "pre_operation",
            });
          }
          break;
        }
        case "POOL_LIQUIDITY_ADDED":
          state = { ...state, liquidity_add_count: state.liquidity_add_count + 1, as_of_event_id: event.event_id };
          break;
        case "POOL_LIQUIDITY_REMOVED":
          state = { ...state, liquidity_remove_count: state.liquidity_remove_count + 1, as_of_event_id: event.event_id };
          break;
        case "POOL_FEE_MOVEMENT":
          state = applyPoolFeeMovement(state, event);
          state = { ...state, as_of_event_id: event.event_id };
          break;
        case "POOL_BOOST_BUY_BURN": {
          const after = payload.pool_reserves_after ?? {};
          const mismatches = [];
          if (String(after.pool_base_reserves_base_units) !== state.pool_base_reserves_base_units) {
            mismatches.push({
              field: "pool_base_reserves_base_units",
              replayed: state.pool_base_reserves_base_units,
              observed_after: String(after.pool_base_reserves_base_units),
            });
          }
          if (String(after.pool_quote_reserves_base_units) !== state.pool_quote_reserves_base_units) {
            mismatches.push({
              field: "pool_quote_reserves_base_units",
              replayed: state.pool_quote_reserves_base_units,
              observed_after: String(after.pool_quote_reserves_base_units),
            });
          }
          const reportedVirtual = toBigInt(payload.virtual_quote_reserves_reported_base_units, "reported virtual quote reserves");
          const nextBoost = reportedVirtual +
            nonNegative(state.protocol_fees_base_units, "protocol fees") +
            nonNegative(state.creator_fees_base_units, "creator fees");
          if (nextBoost < 0n) mismatches.push({
            field: "boost_reserves_base_units",
            replayed: "non-negative",
            observed_after: nextBoost.toString(),
          });
          if (mismatches.length) {
            reconciliations.push({
              signature: group.signature,
              event_id: event.event_id,
              status: "FAIL",
              reason: "boost buy-and-burn post-state does not match pool vault replay",
              mismatches,
            });
          } else {
            state = {
              ...state,
              virtual_quote_reserves_base_units: reportedVirtual.toString(),
              boost_reserves_base_units: nextBoost.toString(),
              boost_transition_count: state.boost_transition_count + 1,
              as_of_event_id: event.event_id,
            };
            reconciliations.push({
              signature: group.signature,
              event_id: event.event_id,
              status: "PASS",
              observation: "boost_buy_and_burn_post_state",
            });
          }
          break;
        }
        default:
          throw new Error(`unsupported PumpSwap pool event kind: ${event.event_kind}`);
      }
      processedEventIds.push(event.event_id);
    }

    assertPoolReserveInvariants(state, group.events.at(-1)?.event_id ?? group.signature);
    reconciliations.push({
      signature: group.signature,
      status: deltaResult.status,
      reason: deltaResult.reason,
      pool_vault_deltas: deltaEvent?.payload?.pool_vault_deltas ?? null,
    });
  }

  return {
    state,
    reconciliations,
    processed_event_ids: processedEventIds,
    status: reconciliations.some((item) => item.status === "FAIL")
      ? "FAIL"
      : reconciliations.some((item) => item.status === "UNKNOWN")
        ? "PARTIAL"
        : "PASS",
  };
}

export function reconcilePumpSwapPoolSnapshot({
  replayedState,
  decodedPool,
  baseVault,
  quoteVault,
}) {
  if (!replayedState || !decodedPool?.data) {
    throw new TypeError("replayed PumpSwap state and decoded Pool account are required");
  }
  const data = decodedPool.data;
  const checks = [
    ["pool_base_reserves_base_units", baseVault?.amount_base_units ?? null],
    ["pool_quote_reserves_base_units", quoteVault?.amount_base_units ?? null],
    ["virtual_quote_reserves_base_units", data.virtual_quote_reserves_base_units],
    ["protocol_fees_base_units", data.protocol_fees_base_units],
    ["creator_fees_base_units", data.creator_fees_base_units],
  ];
  const missing = [];
  const mismatches = [];
  for (const [field, observed] of checks) {
    if (observed === null || observed === undefined) {
      missing.push(field);
      continue;
    }
    const expected = String(replayedState[field]);
    const actual = String(observed);
    if (expected !== actual) mismatches.push({ field, replayed: expected, observed: actual });
  }
  const slots=[decodedPool.context_slot,baseVault?.context_slot,quoteVault?.context_slot];
  const invalidSlot=slots.some(v=>v!=null&&(!Number.isSafeInteger(v)||v<0));
  const knownSlots=slots.filter(v=>v!=null);
  const slotConflict=invalidSlot||new Set(knownSlots).size>1;
  const slotStatus=slotConflict?"NOT_COMPARABLE":knownSlots.length===3?"SAME_REPORTED_SLOT":"UNKNOWN";
  const effectiveQuote=slotConflict||quoteVault?.amount_base_units==null||data.virtual_quote_reserves_base_units==null?null:
    nonNegative(quoteVault.amount_base_units,"quote vault amount")+toBigInt(data.virtual_quote_reserves_base_units,"virtual quote reserves");
  if (effectiveQuote!==null&&(effectiveQuote < 0n || effectiveQuote > ((1n << 64n) - 1n))) {
    mismatches.push({
      field: "effective_quote_reserves_base_units",
      replayed: "non-negative u64",
      observed: effectiveQuote.toString(),
    });
  }
  return {
    status: slotConflict ? "UNKNOWN" : mismatches.length ? "FAIL" : missing.length ? "UNKNOWN" : "PASS",
    mismatches,
    missing_fields: missing,
    snapshot_slot: slotStatus==="SAME_REPORTED_SLOT"?knownSlots[0]:null,
    snapshot_slot_status:slotStatus,
    effective_quote_reserves_base_units: effectiveQuote?.toString()??null,
  };
}
