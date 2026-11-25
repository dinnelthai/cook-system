import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, openSync, closeSync, realpathSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { canonicalJson } from "../core/canonical-json.mjs";
import { createOrderReviewJournal } from "./order-review-journal.mjs";
import { describeProjectRiskReview } from "./project-risk-review.mjs";
import { buildProjectAuditBundle } from "./project-audit-bundle.mjs";
import { createProjectAggregate, applyProjectCommand, assertProjectAggregate } from "./project-aggregate.mjs";
import { replayProjectEvents } from "./project-event-replay.mjs";
import { evidenceApplicability } from "./project-evidence-scope.mjs";
import { describeProjectLifecycleEvidence } from "./project-lifecycle-evidence.mjs";
import { buildProjectBusinessReview } from "./project-business-review.mjs";
import { describeRecordedProjectTimeline, describeLifecycleExceptions } from "./project-lifecycle-timeline.mjs";

const MAX_AGGREGATE_BYTES = 1024 * 1024;
const hash = value => createHash("sha256").update(value, "utf8").digest("hex");
const clone = value => structuredClone(value);
const requiredSchemaObjects={
 table:["project_snapshot","project_event","project_archive","order_review_event"],
 index:["project_event_project_revision","project_archive_project","order_review_project"],
 trigger:["project_event_no_update","project_event_no_delete","project_archive_no_update","project_archive_no_delete","order_review_no_update","order_review_no_delete"]
};
function checkRequiredSchema(db){
 const rows=db.prepare("SELECT type,name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all();
 const names=new Set(rows.map(r=>r.type+":"+r.name));
 const missing=Object.entries(requiredSchemaObjects).flatMap(([type,values])=>values.filter(name=>!names.has(type+":"+name)).map(name=>type+":"+name));
 return {status:missing.length?"REVIEW_REQUIRED":"PASS",missing_objects:missing,definition_attestation:"UNKNOWN"};
}
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
  if (aggregate.project_id !== row.project_id || aggregate.revision !== row.revision || aggregate.updated_at_ms !== row.updated_at_ms) throw Error("PROJECT_SNAPSHOT_REVISION_MISMATCH");
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
    db.exec(
      "CREATE TABLE IF NOT EXISTS project_archive (" +
      "archive_id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project_snapshot(project_id), " +
      "project_revision INTEGER NOT NULL, project_head_hash TEXT NOT NULL, kind TEXT NOT NULL, " +
      "content TEXT NOT NULL, recorded_at_ms INTEGER NOT NULL, record_hash TEXT NOT NULL);" +
      "CREATE INDEX IF NOT EXISTS project_archive_project ON project_archive(project_id,recorded_at_ms);" +
      "CREATE TRIGGER IF NOT EXISTS project_archive_no_update BEFORE UPDATE ON project_archive BEGIN SELECT RAISE(ABORT,'PROJECT_ARCHIVE_IMMUTABLE'); END;" +
      "CREATE TRIGGER IF NOT EXISTS project_archive_no_delete BEFORE DELETE ON project_archive BEGIN SELECT RAISE(ABORT,'PROJECT_ARCHIVE_IMMUTABLE'); END;"
    );
    const archiveById = db.prepare("SELECT * FROM project_archive WHERE archive_id=?");
    const archiveRows = db.prepare("SELECT * FROM project_archive WHERE project_id=? ORDER BY recorded_at_ms DESC,archive_id");
    const archiveInsert = db.prepare("INSERT INTO project_archive VALUES(?,?,?,?,?,?,?,?)");
    const archiveCount = db.prepare("SELECT COUNT(*) AS count FROM project_archive WHERE project_id=?");
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
    // SAVEPOINT also works within an existing write or composite read transaction.
    // All callbacks are synchronous; no transaction survives an await.
    let readSequence=0;
    function readSnapshot(read) {
      const name="project_read_"+(++readSequence);
      db.exec("SAVEPOINT "+name);
      try {
        const result=read();
        db.exec("RELEASE "+name);
        return result;
      } catch(error) {
        try { db.exec("ROLLBACK TO "+name);db.exec("RELEASE "+name); } catch {}
        throw error;
      }
    }
    function current(projectId) {
      return readSnapshot(()=>currentInSnapshot(projectId));
    }
    function currentInSnapshot(projectId) {
      const snapshot = snapshotGet.get(projectId);
      if (!snapshot) throw Error("PROJECT_NOT_FOUND");
      const aggregate = parseSnapshot(snapshot);
      const chain = verifyRows(projectId, aggregate);
      const replay = replayProjectEvents(chain.events);
      if (canonicalJson(replay.aggregate) !== canonicalJson(aggregate)) throw Error("PROJECT_SNAPSHOT_REPLAY_MISMATCH");
      return { aggregate, events: chain.events, head_hash: chain.head_hash, aggregate_hash: snapshot.aggregate_hash, metadata_compatible_since_revision:replay.metadata_compatible_since_revision };
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
    function list() { return readSnapshot(()=>snapshotList.all().map(row => get(row.project_id))); }
    // Separate diagnostic interface: normal list/get remain fail-closed.
    function inspectIntegrity() {
      return readSnapshot(()=>{
        const projects=snapshotList.all().map(({project_id})=>{
          try {
            const v=verify(project_id);
            return {project_id,revision:v.revision,status:"INTERNALLY_CONSISTENT",semantic_replay:v.semantic_replay};
          } catch(error) {
            const code=typeof error?.message==="string"&&/^[A-Z][A-Z0-9_]{2,100}$/.test(error.message)?error.message:"PROJECT_READ_FAILED";
            return {project_id,revision:null,status:"REVIEW_REQUIRED",reason:code};
          }
        });
        return {status:projects.every(p=>p.status==="INTERNALLY_CONSISTENT")?"INTERNALLY_CONSISTENT":"REVIEW_REQUIRED",
          project_count:projects.length,projects,source_attestation:"UNKNOWN",execution_enabled:false};
      });
    }
    function events(projectId) { return clone(current(projectId).events); }
    function verify(projectId) {return describeVerified(projectId,current(projectId));}
    function describeVerified(projectId,latest) {
      return {
        status: "VERIFIED", project_id: projectId, revision: latest.aggregate.revision,
        event_count: latest.events.length, aggregate_hash: latest.aggregate_hash,
        head_hash: latest.head_hash, semantic_replay: "MATCHED", original_request_attestation: "UNKNOWN", source_attestation: "UNKNOWN"
      };
    }
    // Only server-generated observations and server-resolved report links enter this journal.
    // They never change a Project aggregate or constitute verified chain provenance.
    function archiveCore(row) {
      return {archive_id:row.archive_id,project_id:row.project_id,project_revision:row.project_revision,
        project_head_hash:row.project_head_hash,kind:row.kind,content:row.content,recorded_at_ms:row.recorded_at_ms};
    }
    function decodeArchive(row, latest) {
      if (row.record_hash !== hash(canonicalJson(archiveCore(row))) ||
          latest.events[row.project_revision-1]?.event_hash !== row.project_head_hash ||
          row.archive_id !== hash(canonicalJson({project_id:row.project_id,revision:row.project_revision,kind:row.kind,content:row.content}))) throw Error("PROJECT_ARCHIVE_INTEGRITY_FAILURE");
      return {archive_id:row.archive_id,project_id:row.project_id,project_revision:row.project_revision,
        project_head_hash:row.project_head_hash,kind:row.kind,recorded_at_ms:row.recorded_at_ms,record_hash:row.record_hash,
        payload:JSON.parse(row.content),current_revision:latest.aggregate.revision,stale:row.project_revision!==latest.aggregate.revision,
        evidence_applicability:evidenceApplicability(latest,row.project_revision,row.kind),
        source_attestation:"UNKNOWN",execution_enabled:false};
    }
    function evidenceSnapshotInTransaction(projectId,latest){
      const archives=archiveRows.all(projectId).map(row=>decodeArchive(row,latest));
      const journal=rawOrderReview.readVerifiedJournal(projectId,latest),orders=journal.map(x=>x.order);
      const orderHeads=orders.map(o=>[o.order_id,o.revision,o.head_hash]).sort((a,b)=>a[0].localeCompare(b[0],"en"));
      const snapshotDigest=predicate=>hash(canonicalJson({project_head_hash:latest.head_hash,
        archive_hashes:archives.filter(predicate).map(a=>a.record_hash).sort(),orders:orderHeads}));
      const digest=snapshotDigest(a=>a.kind!=="PROJECT_CLOSE_REVIEW");
      const receiptDigest=snapshotDigest(a=>a.kind==="HISTORICAL_REPORT_LINK");
      return {project:latest.aggregate,archives:archives.map(a=>a.kind==="PROJECT_CLOSE_REVIEW"?{...a,
        evidence_snapshot_status:!a.payload.evidence_snapshot_digest?"UNKNOWN_LEGACY":a.payload.evidence_snapshot_digest===digest?"MATCHED":"STALE"}:a),orders,journal,evidence_snapshot_digest:digest,receipt_snapshot_digest:receiptDigest};
    }
    function getEvidenceSnapshot(projectId){
      return readSnapshot(()=>{const {journal,...snapshot}=evidenceSnapshotInTransaction(projectId,current(projectId));return snapshot;});
    }
    function recordArchive(projectId, kind, payload, expectedRevision, expectedEvidenceDigest=null) {
      if (!["ISSUANCE_OBSERVATION","MARKET_OBSERVATION","HISTORICAL_REPORT_LINK","ORDER_RECEIPT_REVIEW","GRADUATION_HISTORY_REVIEW","PROJECT_CLOSE_REVIEW","TREASURY_REVIEW","MARKET_EVIDENCE_REVIEW"].includes(kind) ||
          !payload || payload.project_id!==projectId || payload.project_revision!==expectedRevision ||
          payload.source_attestation!=="UNKNOWN" || payload.execution_enabled!==false) throw Error("INVALID_PROJECT_ARCHIVE");
      const guarded=["PROJECT_CLOSE_REVIEW","ORDER_RECEIPT_REVIEW"].includes(kind);
      if(guarded&&(!/^[a-f0-9]{64}$/.test(expectedEvidenceDigest??"")||payload.evidence_snapshot_digest!==expectedEvidenceDigest))throw Error("PROJECT_EVIDENCE_SNAPSHOT_REQUIRED");
      const content=canonicalJson(payload);
      if (Buffer.byteLength(content)>64*1024) throw Error("PROJECT_ARCHIVE_SIZE_LIMIT");
      db.exec("BEGIN IMMEDIATE");
      try {
        const latest=current(projectId);
        if(latest.aggregate.revision!==expectedRevision) throw Error("PROJECT_REVISION_CONFLICT");
        if(guarded){
          const snapshot=evidenceSnapshotInTransaction(projectId,latest);
          const actual=kind==="ORDER_RECEIPT_REVIEW"?snapshot.receipt_snapshot_digest:snapshot.evidence_snapshot_digest;
          if(actual!==expectedEvidenceDigest)throw Error("PROJECT_EVIDENCE_SNAPSHOT_CONFLICT");
        }
        const archive_id=hash(canonicalJson({project_id:projectId,revision:expectedRevision,kind,content}));
        const prior=archiveById.get(archive_id);
        if(prior){const result=decodeArchive(prior,latest);db.exec("COMMIT");return kind==="PROJECT_CLOSE_REVIEW"?{...result,evidence_snapshot_status:"MATCHED"}:result;}
        if(archiveCount.get(projectId).count>=256)throw Error("PROJECT_ARCHIVE_CAPACITY");
        const at=now();
        if(!Number.isSafeInteger(at)||at<latest.aggregate.updated_at_ms)throw Error("INVALID_PROJECT_STORE_CLOCK");
        const row={archive_id,project_id:projectId,project_revision:expectedRevision,project_head_hash:latest.head_hash,kind,content,recorded_at_ms:at};
        const record_hash=hash(canonicalJson(archiveCore(row)));
        archiveInsert.run(archive_id,projectId,expectedRevision,latest.head_hash,kind,content,at,record_hash);
        const result=decodeArchive({...row,record_hash},latest);
        db.exec("COMMIT");return kind==="PROJECT_CLOSE_REVIEW"?{...result,evidence_snapshot_status:"MATCHED"}:result;
      }catch(error){try{db.exec("ROLLBACK");}catch{}throw error;}
    }
    function listArchive(projectId){
      return getEvidenceSnapshot(projectId).archives;
    }
    const rawOrderReview=createOrderReviewJournal(db,{current,now});
    const orderReview={append:rawOrderReview.append,importReceipts:rawOrderReview.importReceipts,
      list:projectId=>readSnapshot(()=>rawOrderReview.list(projectId)),
      events:(projectId,orderId)=>readSnapshot(()=>rawOrderReview.events(projectId,orderId))
    };
    function exportAuditBundle(projectId,expectedRevision){
      db.exec("BEGIN");
      try{
        const latest=current(projectId);
        if(latest.aggregate.revision!==expectedRevision)throw Error("PROJECT_REVISION_CONFLICT");
        const integrity=describeVerified(projectId,latest),snapshot=evidenceSnapshotInTransaction(projectId,latest);
        const archives=snapshot.archives,orders=snapshot.journal;
        const bundle=buildProjectAuditBundle({project:latest.aggregate,integrity,events:latest.events,archives,orders});
        db.exec("COMMIT");return bundle;
      }catch(error){try{db.exec("ROLLBACK");}catch{}throw error;}
    }
    // Include close-review archives, unlike the close-review guard digest.
    // Selection is read-only and pinned to all evidence, not just project revision.
    function runtimeContextId(snapshot){
      return hash(canonicalJson({project:snapshot.project,
        archives:snapshot.archives.map(a=>a.record_hash).sort(),
        orders:snapshot.orders.map(o=>[o.order_id,o.revision,o.head_hash]).sort((a,b)=>a[0].localeCompare(b[0],"en"))}));
    }
    function getBusinessReview(projectId){
      const snapshot=getEvidenceSnapshot(projectId);
      return {...buildProjectBusinessReview(snapshot.project,snapshot.archives,snapshot.orders),runtime_context_id:runtimeContextId(snapshot)};
    }
    function getRuntimeContext(projectId,selection=null){
      const snapshot=getEvidenceSnapshot(projectId),context=runtimeContextId(snapshot);
      if(selection){
        if(snapshot.project.revision!==selection.expected_revision)throw Error("PROJECT_REVISION_CONFLICT");
        if(context!==selection.expected_context_id)throw Error("PROJECT_EVIDENCE_SNAPSHOT_CONFLICT");
      }
      const review=buildProjectBusinessReview(snapshot.project,snapshot.archives,snapshot.orders);
      const interval=selection?review.runtime.asset_intervals.find(r=>r.report_link_archive_id===selection.report_link_archive_id):null;
      if(selection&&!interval)throw Error("PROJECT_ARCHIVE_NOT_FOUND");
      return {...review.runtime,runtime_context_id:context,selected_interval:interval??null};
    }
    function getLifecycleReview(projectId){
      return readSnapshot(()=>{
        const latest=current(projectId),{project,archives,orders}=evidenceSnapshotInTransaction(projectId,latest);
        const lifecycle=describeProjectLifecycleEvidence(project,archives,orders);
        const risk=describeProjectRiskReview(project,archives,orders);
        return {...lifecycle,recorded_timeline:describeRecordedProjectTimeline(project,latest.events),
          exception_review:describeLifecycleExceptions(project,lifecycle,risk)};
      });
    }
    function getRiskReview(projectId){
      db.exec("BEGIN");
      try{
        const {project,archives,orders}=evidenceSnapshotInTransaction(projectId,current(projectId));
        const result=describeProjectRiskReview(project,archives,orders);
        db.exec("COMMIT");return result;
      }catch(error){try{db.exec("ROLLBACK");}catch{}throw error;}
    }
    function inspectDatabaseIntegrity() {
      return readSnapshot(()=>{
        const schema=checkRequiredSchema(db);
        if(schema.status!=="PASS")return {status:"REVIEW_REQUIRED",schema_check:schema,sqlite_quick_check:"NOT_RUN",foreign_key_violation_count:null,projects:[],source_attestation:"UNKNOWN",execution_enabled:false};
        const physical=db.prepare("PRAGMA quick_check").all();
        const foreign=db.prepare("PRAGMA foreign_key_check").all();
        const physicalPass=physical.length===1&&Object.values(physical[0])[0]==="ok";
        const health=inspectIntegrity();
        const projects=health.projects.map(row=>{
          if(row.status!=="INTERNALLY_CONSISTENT")return row;
          try{
            const {archives,orders}=getEvidenceSnapshot(row.project_id);
            return {...row,archive_count:archives.length,order_count:orders.length};
          }catch(error){
            return {...row,status:"REVIEW_REQUIRED",reason:typeof error?.message==="string"&&/^[A-Z][A-Z0-9_]{2,100}$/.test(error.message)?error.message:"PROJECT_JOURNAL_READ_FAILED"};
          }
        });
        return {status:physicalPass&&foreign.length===0&&projects.every(x=>x.status==="INTERNALLY_CONSISTENT")?"INTERNALLY_CONSISTENT":"REVIEW_REQUIRED",
          schema_check:schema,sqlite_quick_check:physicalPass?"PASS":"REVIEW_REQUIRED",foreign_key_violation_count:foreign.length,projects,source_attestation:"UNKNOWN",execution_enabled:false};
      });
    }
    // SQLite creates a consistent independent copy; never overwrite an existing
    // destination or restore automatically. Parent directory must be private.
    function createVerifiedBackup(destination) {
      if(typeof destination!=="string"||!destination)throw Error("INVALID_PROJECT_BACKUP_PATH");
      const target=resolve(destination),parent=dirname(target);
      const dir=lstatSync(parent);
      if(!dir.isDirectory()||dir.isSymbolicLink()||realpathSync(parent)!==parent||
         (process.platform!=="win32"&&(dir.mode&0o077)!==0))throw Error("UNSAFE_PROJECT_BACKUP_DIRECTORY");
      try{closeSync(openSync(target,"wx",0o600));}catch(error){if(error.code==="EEXIST")throw Error("PROJECT_BACKUP_DESTINATION_EXISTS");throw error;}
      // Failure leaves the reserved destination for diagnosis, never silently
      // removes or replaces any file. Use a fresh path for another attempt.
      db.prepare("VACUUM INTO ?").run(target);
      // Check the untouched copy before any CREATE IF NOT EXISTS or migration.
      // Read-only inspection checks named objects, not full schema authenticity.
      const rawCopy=new DatabaseSync(target,{readOnly:true});
      try{
        if(checkRequiredSchema(rawCopy).status!=="PASS")throw Error("PROJECT_BACKUP_SCHEMA_REVIEW_REQUIRED");
      }finally{rawCopy.close();}
      const copy=openProjectStore(target);
      try{
        const integrity=copy.inspectDatabaseIntegrity();
        if(integrity.status!=="INTERNALLY_CONSISTENT")throw Error("PROJECT_BACKUP_REVIEW_REQUIRED");
        return {status:"VERIFIED_INDEPENDENT_COPY",project_count:integrity.projects.length,integrity,
          original_database_replaced:false,source_attestation:"UNKNOWN",execution_enabled:false};
      }finally{copy.close();}
    }
    return { create, append, get, list, events, verify, inspectIntegrity, inspectDatabaseIntegrity, createVerifiedBackup, recordArchive, listArchive, orderReview, exportAuditBundle, getRiskReview, getLifecycleReview, getBusinessReview, getRuntimeContext, getEvidenceSnapshot, close: () => db.close() };
  } catch (error) {
    db.close();
    throw error;
  }
}
