import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, openSync, closeSync, realpathSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { canonicalJson } from "../core/canonical-json.mjs";
import { createProjectAggregate, applyProjectCommand, assertProjectAggregate } from "./project-aggregate.mjs";

const MAX_AGGREGATE_BYTES = 1024 * 1024;
const hash = value => createHash("sha256").update(value, "utf8").digest("hex");
const clone = value => structuredClone(value);
function privateDatabasePath(path) {
  if (typeof path !== "string" || !path) throw Error("INVALID_PROJECT_STORE_PATH");
  const target = resolve(path), parent = dirname(target);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const dir = lstatSync(parent);
  if (!dir.isDirectory() || dir.isSymbolicLink() || realpathSync(parent) !== parent) throw Error("UNSAFE_PROJECT_STORE_DIRECTORY");
  if (process.platform !== "win32" && (dir.mode & 0o077) !== 0) throw Error("PROJECT_STORE_DIRECTORY_NOT_PRIVATE");
  try { closeSync(openSync(target, "wx", 0o600)); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const file = lstatSync(target);
  if (!file.isFile() || file.isSymbolicLink()) throw Error("UNSAFE_PROJECT_STORE_FILE");
  if (process.platform !== "win32" && (file.mode & 0o077) !== 0) throw Error("PROJECT_STORE_FILE_NOT_PRIVATE");
  return target;
}
function eventCore(event) {
  return {
    event_id: event.event_id, project_id: event.project_id, revision: event.revision,
    event_type: event.event_type, occurred_at_ms: event.occurred_at_ms,
    actor_id: event.actor_id, source: event.source, payload: event.payload,
    request_digest: event.request_digest, previous_hash: event.previous_hash
  };
}
function eventHash(event) { return hash(canonicalJson(eventCore(event))); }
function decodeEvent(row) {
  let payload;
  try { payload = JSON.parse(row.payload_json); } catch { throw Error("PROJECT_EVENT_PAYLOAD_CORRUPT"); }
  return {
    event_id: row.event_id, project_id: row.project_id, revision: row.revision,
    event_type: row.event_type, occurred_at_ms: row.occurred_at_ms,
    actor_id: row.actor_id, source: row.source, payload,
    request_digest: row.request_digest, previous_hash: row.previous_hash, event_hash: row.event_hash
  };
}
function actor(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 128) throw Error("INVALID_PROJECT_ACTOR");
  return value.trim();
}
function textId(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 128) throw Error("INVALID_PROJECT_EVENT_ID");
  return value.trim();
}
function parseSnapshot(row) {
  if (!row || typeof row.aggregate_json !== "string" || Buffer.byteLength(row.aggregate_json) > MAX_AGGREGATE_BYTES ||
      hash(row.aggregate_json) !== row.aggregate_hash) throw Error("PROJECT_SNAPSHOT_INTEGRITY_FAILURE");
  let aggregate;
  try { aggregate = JSON.parse(row.aggregate_json); } catch { throw Error("PROJECT_SNAPSHOT_CORRUPT"); }
  aggregate = assertProjectAggregate(aggregate);
  if (aggregate.project_id !== row.project_id || aggregate.revision !== row.revision) throw Error("PROJECT_SNAPSHOT_REVISION_MISMATCH");
  return aggregate;
}

/** Private local SQLite store for the canonical Project aggregate and append-only audit events.
 * This store is not an execution service and never stores wallet secrets. */
export function openProjectStore(path, { idFactory, now = () => Date.now() } = {}) {
  const makeId = idFactory ?? (() => globalThis.crypto?.randomUUID?.() ?? ("event-" + Date.now() + "-" + Math.random().toString(36).slice(2)));
  const db = new DatabaseSync(privateDatabasePath(path));
  try {
    db.exec("PRAGMA busy_timeout=3000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;");
    db.exec(
      "CREATE TABLE IF NOT EXISTS project_snapshot (" +
      "project_id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision > 0), " +
      "aggregate_json TEXT NOT NULL, aggregate_hash TEXT NOT NULL, updated_at_ms INTEGER NOT NULL);" +
      "CREATE TABLE IF NOT EXISTS project_event (" +
      "event_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project_snapshot(project_id), " +
      "revision INTEGER NOT NULL CHECK(revision > 0), event_type TEXT NOT NULL, occurred_at_ms INTEGER NOT NULL, " +
      "actor_id TEXT NOT NULL, source TEXT NOT NULL CHECK(source = 'application'), payload_json TEXT NOT NULL, " +
      "request_digest TEXT NOT NULL, previous_hash TEXT, event_hash TEXT NOT NULL, UNIQUE(project_id, revision));" +
      "CREATE INDEX IF NOT EXISTS project_event_project_revision ON project_event(project_id, revision);" +
      "CREATE TRIGGER IF NOT EXISTS project_event_no_update BEFORE UPDATE ON project_event " +
      "BEGIN SELECT RAISE(ABORT, 'PROJECT_EVENT_IMMUTABLE'); END;" +
      "CREATE TRIGGER IF NOT EXISTS project_event_no_delete BEFORE DELETE ON project_event " +
      "BEGIN SELECT RAISE(ABORT, 'PROJECT_EVENT_IMMUTABLE'); END;"
    );
    const snapshotGet = db.prepare("SELECT project_id,revision,aggregate_json,aggregate_hash,updated_at_ms FROM project_snapshot WHERE project_id=?");
    const snapshotList = db.prepare("SELECT project_id FROM project_snapshot ORDER BY updated_at_ms DESC, project_id");
    const eventGet = db.prepare("SELECT * FROM project_event WHERE project_id=? ORDER BY revision");
    const eventById = db.prepare("SELECT * FROM project_event WHERE event_id=?");
    const insertSnapshot = db.prepare("INSERT INTO project_snapshot(project_id,revision,aggregate_json,aggregate_hash,updated_at_ms) VALUES(?,?,?,?,?)");
    const updateSnapshot = db.prepare("UPDATE project_snapshot SET revision=?,aggregate_json=?,aggregate_hash=?,updated_at_ms=? WHERE project_id=? AND revision=?");
    const insertEvent = db.prepare("INSERT INTO project_event(event_id,project_id,revision,event_type,occurred_at_ms,actor_id,source,payload_json,request_digest,previous_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)");

    function verifyRows(projectId, snapshot) {
      const events = eventGet.all(projectId).map(decodeEvent);
      if (!events.length || events.length !== snapshot.revision) throw Error("PROJECT_EVENT_CHAIN_INCOMPLETE");
      let previous = null;
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        if (event.revision !== i + 1 || event.project_id !== projectId || event.previous_hash !== previous ||
            event.event_hash !== eventHash(event)) throw Error("PROJECT_EVENT_CHAIN_INVALID");
        previous = event.event_hash;
      }
      return { events, head_hash: previous };
    }
    function current(projectId) {
      const snapshot = snapshotGet.get(projectId);
      if (!snapshot) throw Error("PROJECT_NOT_FOUND");
      const aggregate = parseSnapshot(snapshot);
      const chain = verifyRows(projectId, aggregate);
      return { aggregate, events: chain.events, head_hash: chain.head_hash };
    }
    function makeEvent({ eventId, projectId, revision, type, payload, actorId, at, previousHash, requestDigest }) {
      const event = {
        event_id: eventId, project_id: projectId, revision, event_type: type,
        occurred_at_ms: at, actor_id: actorId, source: "application",
        payload: clone(payload), request_digest: requestDigest, previous_hash: previousHash
      };
      return { ...event, event_hash: eventHash(event) };
    }
    function writeEvent(event) {
      const payload = canonicalJson(event.payload);
      insertEvent.run(event.event_id, event.project_id, event.revision, event.event_type,
        event.occurred_at_ms, event.actor_id, event.source, payload, event.request_digest,
        event.previous_hash, event.event_hash);
    }
    function create(input, { actor_id = "operator" } = {}) {
      const aggregate = createProjectAggregate(input, { idFactory: makeId, now });
      const eventId = textId(makeId());
      const actorId = actor(actor_id), at = aggregate.created_at_ms;
      const payload = { aggregate };
      const requestDigest = hash(canonicalJson({ event_type: "PROJECT_CREATED", payload, actor_id: actorId }));
      const event = makeEvent({
        eventId, projectId: aggregate.project_id, revision: 1, type: "PROJECT_CREATED",
        payload, actorId, at, previousHash: null, requestDigest
      });
      const content = canonicalJson(aggregate);
      if (Buffer.byteLength(content) > MAX_AGGREGATE_BYTES) throw Error("PROJECT_AGGREGATE_SIZE_LIMIT");
      db.exec("BEGIN IMMEDIATE");
      try {
        if (snapshotGet.get(aggregate.project_id)) throw Error("PROJECT_ALREADY_EXISTS");
        insertSnapshot.run(aggregate.project_id, aggregate.revision, content, hash(content), aggregate.updated_at_ms);
        writeEvent(event);
        db.exec("COMMIT");
      } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
      return clone(aggregate);
    }
    function append(projectId, command, { expected_revision, actor_id = "operator" } = {}) {
      if (typeof projectId !== "string" || !projectId) throw Error("INVALID_PROJECT_ID");
      if (!Number.isSafeInteger(expected_revision) || expected_revision < 1) throw Error("EXPECTED_PROJECT_REVISION_REQUIRED");
      if (!command || typeof command !== "object" || Array.isArray(command) ||
          Object.keys(command).some(k => !["command_id", "type", "payload"].includes(k)) ||
          typeof command.command_id !== "string" || !command.command_id.trim() || command.command_id.length > 128 ||
          typeof command.type !== "string" || !command.payload || typeof command.payload !== "object" || Array.isArray(command.payload)) {
        throw Error("INVALID_PROJECT_COMMAND");
      }
      const actorId = actor(actor_id);
      const requestDigest = hash(canonicalJson({ project_id: projectId, type: command.type, payload: command.payload, actor_id: actorId }));
      const eventId = command.command_id.trim();
      db.exec("BEGIN IMMEDIATE");
      try {
        const prior = eventById.get(eventId);
        if (prior) {
          if (prior.project_id !== projectId || prior.request_digest !== requestDigest) throw Error("PROJECT_IDEMPOTENCY_KEY_CONFLICT");
          const latest = current(projectId);
          db.exec("COMMIT");
          return { status: "ALREADY_APPLIED", aggregate: clone(latest.aggregate), event: decodeEvent(prior) };
        }
        const latest = current(projectId);
        if (latest.aggregate.revision !== expected_revision) throw Error("PROJECT_REVISION_CONFLICT");
        const at = now();
        if (!Number.isSafeInteger(at) || at < latest.aggregate.updated_at_ms) throw Error("INVALID_PROJECT_STORE_CLOCK");
        const applied = applyProjectCommand(latest.aggregate, { type: command.type, payload: command.payload }, { now: () => at });
        const aggregate = applied.aggregate;
        const event = makeEvent({
          eventId, projectId, revision: aggregate.revision, type: applied.event_type,
          payload: applied.payload, actorId, at, previousHash: latest.head_hash, requestDigest
        });
        const content = canonicalJson(aggregate);
        if (Buffer.byteLength(content) > MAX_AGGREGATE_BYTES) throw Error("PROJECT_AGGREGATE_SIZE_LIMIT");
        writeEvent(event);
        const result = updateSnapshot.run(aggregate.revision, content, hash(content), aggregate.updated_at_ms, projectId, expected_revision);
        if (Number(result.changes) !== 1) throw Error("PROJECT_REVISION_CONFLICT");
        db.exec("COMMIT");
        return { status: "APPLIED", aggregate: clone(aggregate), event: clone(event) };
      } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
    }
    function get(projectId) { return clone(current(projectId).aggregate); }
    function list() { return snapshotList.all().map(row => get(row.project_id)); }
    function events(projectId) { return clone(current(projectId).events); }
    function verify(projectId) {
      const latest = current(projectId);
      const snapshot = snapshotGet.get(projectId);
      return {
        status: "VERIFIED", project_id: projectId, revision: latest.aggregate.revision,
        event_count: latest.events.length, aggregate_hash: snapshot.aggregate_hash,
        head_hash: latest.head_hash
      };
    }
    return { create, append, get, list, events, verify, close: () => db.close() };
  } catch (error) {
    db.close();
    throw error;
  }
}
