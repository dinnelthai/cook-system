export class IncompleteEventOrderError extends Error {
  constructor(eventId, reason) {
    super(`Event ${eventId ?? "<unknown>"} cannot be replayed in exact order: ${reason}`);
    this.name = "IncompleteEventOrderError";
  }
}

export class ConflictingDuplicateEventError extends Error {
  constructor(eventId) {
    super(`Conflicting duplicate event_id: ${eventId}`);
    this.name = "ConflictingDuplicateEventError";
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function deduplicateEvents(events) {
  if (!Array.isArray(events)) throw new TypeError("events must be an array");
  const byId = new Map();
  const output = [];
  for (const event of events) {
    if (!event || typeof event.event_id !== "string" || event.event_id.length === 0) {
      throw new TypeError("every event must have a non-empty event_id");
    }
    const previous = byId.get(event.event_id);
    if (previous) {
      if (stableJson(previous) !== stableJson(event)) {
        throw new ConflictingDuplicateEventError(event.event_id);
      }
      continue;
    }
    byId.set(event.event_id, event);
    output.push(event);
  }
  return output;
}

function observedKey(event) {
  const ordering = event.ordering ?? {};
  if (ordering.ordering_confidence !== "complete") {
    throw new IncompleteEventOrderError(event.event_id, "ordering_confidence is not complete");
  }
  for (const field of ["slot", "transaction_index", "instruction_index", "event_sequence"]) {
    if (!Number.isSafeInteger(ordering[field]) || ordering[field] < 0) {
      throw new IncompleteEventOrderError(event.event_id, `missing or invalid ${field}`);
    }
  }
  const inner = ordering.inner_instruction_index;
  if (inner !== null && inner !== undefined && (!Number.isSafeInteger(inner) || inner < 0)) {
    throw new IncompleteEventOrderError(event.event_id, "invalid inner_instruction_index");
  }
  return [ordering.slot, ordering.transaction_index, ordering.instruction_index, inner ?? -1, ordering.event_sequence];
}

function syntheticKey(event) {
  const ordering = event.ordering ?? {};
  if (ordering.ordering_confidence !== "synthetic") {
    throw new IncompleteEventOrderError(event.event_id, "synthetic event lacks synthetic ordering metadata");
  }
  if (!Number.isSafeInteger(event.event_time_ms) || event.event_time_ms < 0) {
    throw new IncompleteEventOrderError(event.event_id, "missing or invalid event_time_ms");
  }
  if (!Number.isSafeInteger(ordering.event_sequence) || ordering.event_sequence < 0) {
    throw new IncompleteEventOrderError(event.event_id, "missing or invalid event_sequence");
  }
  return [event.event_time_ms, ordering.event_sequence];
}

function compareTuple(a, b) {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const av = a[i] ?? -1;
    const bv = b[i] ?? -1;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

export function sortForReplay(events) {
  const unique = deduplicateEvents(events);
  const provenanceSet = new Set(unique.map((event) => event.provenance));
  if (provenanceSet.size > 1) {
    throw new TypeError("observed-chain and synthetic events must be replayed separately");
  }
  const provenance = unique[0]?.provenance;
  if (provenance !== "observed_chain" && provenance !== "synthetic") {
    if (unique.length === 0) return [];
    throw new TypeError("event provenance must be observed_chain or synthetic");
  }

  const keyed = unique.map((event) => ({
    event,
    key: provenance === "observed_chain" ? observedKey(event) : syntheticKey(event),
  }));
  keyed.sort((a, b) => compareTuple(a.key, b.key));

  for (let i = 1; i < keyed.length; i += 1) {
    if (compareTuple(keyed[i - 1].key, keyed[i].key) === 0) {
      throw new IncompleteEventOrderError(keyed[i].event.event_id, "duplicate total-order key");
    }
  }
  return keyed.map(({ event }) => event);
}
