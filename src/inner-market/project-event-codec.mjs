import {createHash} from "node:crypto";
import {canonicalJson} from "../core/canonical-json.mjs";
const hash=value=>createHash("sha256").update(value,"utf8").digest("hex");
/** Stable v1 event serialization; extracted without changing persisted hashes. */
function eventCore(event) {
  return {
    event_id: event.event_id, project_id: event.project_id, revision: event.revision,
    event_type: event.event_type, occurred_at_ms: event.occurred_at_ms,
    actor_id: event.actor_id, source: event.source, payload: event.payload,
    request_digest: event.request_digest, previous_hash: event.previous_hash
  };
}
export function eventHash(event) { return hash(canonicalJson(eventCore(event))); }
export function decodeEvent(row) {
  let payload;
  try { payload = JSON.parse(row.payload_json); } catch { throw Error("PROJECT_EVENT_PAYLOAD_CORRUPT"); }
  return {
    event_id: row.event_id, project_id: row.project_id, revision: row.revision,
    event_type: row.event_type, occurred_at_ms: row.occurred_at_ms,
    actor_id: row.actor_id, source: row.source, payload,
    request_digest: row.request_digest, previous_hash: row.previous_hash, event_hash: row.event_hash
  };
}
