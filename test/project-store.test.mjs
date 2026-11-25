import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { canonicalJson } from "../src/core/canonical-json.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openProjectStore } from "../src/inner-market/project-store.mjs";

const wallet = "11111111111111111111111111111111";
const base = {
  project_id: "persisted-alpha",
  profile: { name: "Persisted Alpha", symbol: "ALPHA" },
  network: { cluster: "localnet", genesis_hash: wallet },
  token: { supply_base_units: "1000000000", decimals: 6, creator_wallet_address: wallet }
};
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "cook-project-store-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(realpathSync(dir), "projects.sqlite");
}
function group() {
  return { group_id: "dev-wallets", name: "Dev Wallets", purpose: "DEV",
    members: [{ wallet_address: wallet, role: "DEV", enabled: true, allocation_limit_base_units: null }] };
}
test("project snapshots and append-only events survive close and reopen", t => {
  const path = setup(t);
  let store = openProjectStore(path, { idFactory: () => "event-created", now: () => 1000 });
  const created = store.create(base);
  assert.equal(created.revision, 1);
  assert.equal(store.verify(created.project_id).event_count, 1);
  assert.deepEqual(store.events(created.project_id)[0].payload.aggregate, created);
  const applied = store.append(created.project_id, { command_id: "command-wallets", type: "UPSERT_WALLET_GROUP", payload: { group: group() } }, { expected_revision: 1 });
  assert.equal(applied.aggregate.revision, 2);
  store.close();
  store = openProjectStore(path);
  try {
    assert.equal(store.get(created.project_id).revision, 2);
    assert.equal(store.get(created.project_id).wallet_groups.length, 1);
    assert.equal(store.events(created.project_id).length, 2);
    assert.equal(store.verify(created.project_id).status, "VERIFIED");
  } finally { store.close(); }
});
test("optimistic revision checks and command idempotency prevent duplicate writes", t => {
  const path = setup(t), a = openProjectStore(path, { idFactory: () => "event-created", now: () => 1000 }), b = openProjectStore(path);
  try {
    a.create(base);
    const command = { command_id: "same-command", type: "UPSERT_WALLET_GROUP", payload: { group: group() } };
    const first = a.append(base.project_id, command, { expected_revision: 1 });
    const retry = b.append(base.project_id, command, { expected_revision: 1 });
    assert.equal(first.status, "APPLIED");
    assert.equal(retry.status, "ALREADY_APPLIED");
    assert.equal(retry.aggregate.revision, 2);
    assert.throws(() => b.append(base.project_id, { ...command, payload: { group: { ...group(), name: "Changed" } } }, { expected_revision: 2 }), /PROJECT_IDEMPOTENCY_KEY_CONFLICT/);
    assert.throws(() => b.append(base.project_id, { command_id: "other-command", type: "SET_OPERATIONAL_STATUS", payload: { status: "HALTED" } }, { expected_revision: 1 }), /PROJECT_REVISION_CONFLICT/);
    assert.equal(a.get(base.project_id).revision, 2);
  } finally { b.close(); a.close(); }
});
test("event records reject update and delete; snapshot tampering is detected", t => {
  const path = setup(t), store = openProjectStore(path);
  try { store.create(base); } finally { store.close(); }
  const raw = new DatabaseSync(path);
  try {
    assert.throws(() => raw.exec("UPDATE project_event SET actor_id='tampered' WHERE revision=1"), /PROJECT_EVENT_IMMUTABLE/);
    assert.throws(() => raw.exec("DELETE FROM project_event WHERE revision=1"), /PROJECT_EVENT_IMMUTABLE/);
    raw.exec("UPDATE project_snapshot SET aggregate_hash='invalid' WHERE revision=1");
  } finally { raw.close(); }
  const reopened = openProjectStore(path);
  try { assert.throws(() => reopened.get(base.project_id), /PROJECT_SNAPSHOT_INTEGRITY_FAILURE/); }
  finally { reopened.close(); }
});
test("store rejects duplicate project IDs", t => {
  const path = setup(t), store = openProjectStore(path);
  try {
    store.create(base);
    assert.throws(() => store.create(base), /PROJECT_ALREADY_EXISTS/);
  } finally { store.close(); }
});

test("project archive is immutable, revision-pinned, deduplicated and survives reopening",t=>{
 const path=setup(t);let store=openProjectStore(path,{now:()=>1000});
 const p=store.create(base);
 const payload={project_id:p.project_id,project_revision:1,status:"UNKNOWN",source_attestation:"UNKNOWN",execution_enabled:false};
 const first=store.recordArchive(p.project_id,"ISSUANCE_OBSERVATION",payload,1);
 assert.equal(store.recordArchive(p.project_id,"ISSUANCE_OBSERVATION",payload,1).archive_id,first.archive_id);
 assert.equal(store.listArchive(p.project_id).length,1);
 assert.equal(store.get(p.project_id).revision,1);
 store.append(p.project_id,{command_id:"archive-test-revision",type:"UPSERT_WALLET_GROUP",payload:{group:group()}},{expected_revision:1});
 assert.throws(()=>store.recordArchive(p.project_id,"ISSUANCE_OBSERVATION",payload,1),/PROJECT_REVISION_CONFLICT/);
 store.close();store=openProjectStore(path);
 try{const row=store.listArchive(p.project_id)[0];assert.equal(row.stale,true);assert.equal(row.project_head_hash,first.project_head_hash);assert.equal(row.record_hash,first.record_hash);}
 finally{store.close();}
 const db=new DatabaseSync(path);
 try{assert.throws(()=>db.exec("DELETE FROM project_archive"),/PROJECT_ARCHIVE_IMMUTABLE/);assert.throws(()=>db.exec("UPDATE project_archive SET content='{}'"),/PROJECT_ARCHIVE_IMMUTABLE/);}
 finally{db.close();}
});

test("audit export is a scoped, stable read snapshot and detects digest changes",async t=>{
 const {checkProjectAuditBundleDigest}=await import("../src/inner-market/project-audit-bundle.mjs");
 const path=setup(t),s=openProjectStore(path,{now:()=>1000});
 try{
  const p=s.create(base);s.create({...base,project_id:"other-project"});
  const payload={project_id:p.project_id,project_revision:1,status:"UNKNOWN",source_attestation:"UNKNOWN",execution_enabled:false};
  s.recordArchive(p.project_id,"ISSUANCE_OBSERVATION",payload,1);
  s.recordArchive("other-project","ISSUANCE_OBSERVATION",{...payload,project_id:"other-project"},1);
  const b=s.exportAuditBundle(p.project_id,1);
  assert.equal(b.project_id,p.project_id);assert.equal(b.archives.length,1);assert.equal(b.events.length,1);
  assert.equal(b.settlement_allowed,false);assert.equal(b.lifecycle_mutated,false);assert.equal(b.original_report_bytes_included,false);
  assert.equal(checkProjectAuditBundleDigest(b).status,"DIGEST_MATCH_NOT_AUTHENTICATED");
  assert.equal(s.exportAuditBundle(p.project_id,1).content_sha256,b.content_sha256);
  assert.throws(()=>s.exportAuditBundle(p.project_id,2),/PROJECT_REVISION_CONFLICT/);
  const changed=structuredClone(b);changed.exceptions=[];assert.throws(()=>checkProjectAuditBundleDigest(changed),/PROJECT_AUDIT_BUNDLE_DIGEST_MISMATCH/);
  assert.equal(s.get(p.project_id).revision,1);
 }finally{s.close();}
});

test("valid snapshot digest cannot hide a divergent project state",t=>{
 const path=setup(t),s=openProjectStore(path,{now:()=>1000});let p;
 try{p=s.create(base);s.append(p.project_id,{command_id:"profile-change",type:"UPDATE_PROFILE",payload:{profile:{name:"Correct Name"}}},{expected_revision:1});}
 finally{s.close();}
 const db=new DatabaseSync(path);
 try{
  const row=db.prepare("SELECT aggregate_json FROM project_snapshot WHERE project_id=?").get(p.project_id);
  const value=JSON.parse(row.aggregate_json);value.profile.name="Different Name";
  const content=canonicalJson(value),digest=createHash("sha256").update(content,"utf8").digest("hex");
  db.prepare("UPDATE project_snapshot SET aggregate_json=?,aggregate_hash=? WHERE project_id=?").run(content,digest,p.project_id);
 }finally{db.close();}
 const reopened=openProjectStore(path);
 try{
  assert.throws(()=>reopened.get(p.project_id),/PROJECT_SNAPSHOT_REPLAY_MISMATCH/);
  assert.throws(()=>reopened.verify(p.project_id),/PROJECT_SNAPSHOT_REPLAY_MISMATCH/);
  assert.throws(()=>reopened.append(p.project_id,{command_id:"later",type:"SET_OPERATIONAL_STATUS",payload:{status:"HALTED"}},{expected_revision:2}),/PROJECT_SNAPSHOT_REPLAY_MISMATCH/);
 }finally{reopened.close();}
});
test("legacy normalized draft events can be replayed after reopen",t=>{
 const path=setup(t),s=openProjectStore(path,{now:()=>1000});
 try{
  const p=s.create({project_id:"draft",profile:{name:"Draft",symbol:"DRAFT"}});
  const v=s.append(p.project_id,{command_id:"configure",type:"UPDATE_DRAFT_CONFIGURATION",payload:{profile:base.profile,network:base.network,token:base.token,wallet_group:group()}},{expected_revision:1});
  assert.deepEqual(s.get(p.project_id),v.aggregate);
  assert.equal(s.verify(p.project_id).semantic_replay,"MATCHED");
  assert.equal(s.verify(p.project_id).source_attestation,"UNKNOWN");
 }finally{s.close();}
});

test("integrity diagnostic isolates a corrupt project without returning an unverified aggregate",t=>{
 const path=setup(t),s=openProjectStore(path,{now:()=>1000});
 try{s.create(base);s.create({...base,project_id:"healthy"});}finally{s.close();}
 const db=new DatabaseSync(path);
 try{db.prepare("UPDATE project_snapshot SET aggregate_hash=? WHERE project_id=?").run("bad",base.project_id);}finally{db.close();}
 const r=openProjectStore(path,{now:()=>2000});
 try{
  const health=r.inspectIntegrity();
  assert.equal(health.status,"REVIEW_REQUIRED");assert.equal(health.project_count,2);
  assert.deepEqual(health.projects.find(x=>x.project_id===base.project_id),{project_id:base.project_id,revision:null,status:"REVIEW_REQUIRED",reason:"PROJECT_SNAPSHOT_INTEGRITY_FAILURE"});
  assert.equal(health.projects.find(x=>x.project_id==="healthy").status,"INTERNALLY_CONSISTENT");
  assert.throws(()=>r.list(),/PROJECT_SNAPSHOT_INTEGRITY_FAILURE/);
  const applied=r.append("healthy",{command_id:"healthy-change",type:"UPDATE_PROFILE",payload:{profile:{name:"Healthy Updated"}}},{expected_revision:1});
  assert.equal(applied.aggregate.revision,2);assert.equal(r.get("healthy").revision,2);
  assert.equal(r.inspectIntegrity().projects.find(x=>x.project_id==="healthy").revision,2);
 }finally{r.close();}
});
test("composite reads and rejected reads release their transaction boundaries",t=>{
 const path=setup(t),a=openProjectStore(path,{now:()=>1000}),b=openProjectStore(path,{now:()=>2000});
 try{
  const p=a.create(base);
  assert.throws(()=>a.get("missing"),/PROJECT_NOT_FOUND/);
  assert.equal(a.inspectIntegrity().project_count,1);
  const v=b.append(p.project_id,{command_id:"other-connection",type:"UPDATE_PROFILE",payload:{profile:{name:"Updated elsewhere"}}},{expected_revision:1});
  assert.equal(v.aggregate.revision,2);
  assert.equal(a.verify(p.project_id).revision,2);
  assert.deepEqual(a.listArchive(p.project_id),[]);
  assert.deepEqual(a.orderReview.list(p.project_id),[]);
  assert.equal(a.exportAuditBundle(p.project_id,2).project_revision,2);
  assert.equal(b.get(p.project_id).revision,2);
 }finally{b.close();a.close();}
});

test("verified SQLite backup is independently readable and never replaces the source",t=>{
 const path=setup(t),s=openProjectStore(path,{now:()=>1000}),destination=join(path,"..","backup.sqlite");
 try{
  const p=s.create(base);
  s.append(p.project_id,{command_id:"backup-profile",type:"UPDATE_PROFILE",payload:{profile:{name:"Backup revision"}}},{expected_revision:1});
  s.recordArchive(p.project_id,"ISSUANCE_OBSERVATION",{project_id:p.project_id,project_revision:2,status:"UNKNOWN",source_attestation:"UNKNOWN",execution_enabled:false},2);
  const v=s.createVerifiedBackup(destination);
  assert.equal(v.status,"VERIFIED_INDEPENDENT_COPY");assert.equal(v.integrity.sqlite_quick_check,"PASS");
  assert.equal(v.integrity.projects[0].archive_count,1);assert.equal(v.original_database_replaced,false);
  assert.throws(()=>s.createVerifiedBackup(destination),/PROJECT_BACKUP_DESTINATION_EXISTS/);
  assert.throws(()=>s.createVerifiedBackup(path),/PROJECT_BACKUP_DESTINATION_EXISTS/);
  const copy=openProjectStore(destination);
  try{
   assert.deepEqual(copy.get(p.project_id),s.get(p.project_id));
   assert.deepEqual(copy.events(p.project_id),s.events(p.project_id));
   assert.deepEqual(copy.listArchive(p.project_id),s.listArchive(p.project_id));
   s.append(p.project_id,{command_id:"source-only",type:"UPDATE_PROFILE",payload:{profile:{name:"Source changed"}}},{expected_revision:2});
   assert.equal(copy.get(p.project_id).revision,2);assert.equal(s.get(p.project_id).revision,3);
  }finally{copy.close();}
 }finally{s.close();}
});
test("database inspection does not treat corrupt archive as a healthy project",t=>{
 const path=setup(t),s=openProjectStore(path,{now:()=>1000});
 try{
  const p=s.create(base);s.recordArchive(p.project_id,"ISSUANCE_OBSERVATION",{project_id:p.project_id,project_revision:1,status:"UNKNOWN",source_attestation:"UNKNOWN",execution_enabled:false},1);
 }finally{s.close();}
 const raw=new DatabaseSync(path);
 try{raw.exec("DROP TRIGGER project_archive_no_update; UPDATE project_archive SET record_hash='invalid'");}finally{raw.close();}
 const r=openProjectStore(path);
 try{
  assert.equal(r.inspectIntegrity().status,"INTERNALLY_CONSISTENT");
  const v=r.inspectDatabaseIntegrity();assert.equal(v.status,"REVIEW_REQUIRED");
  assert.equal(v.projects[0].reason,"PROJECT_ARCHIVE_INTEGRITY_FAILURE");
  assert.throws(()=>r.createVerifiedBackup(join(path,"..","bad-copy.sqlite")),/PROJECT_BACKUP_REVIEW_REQUIRED/);
 }finally{r.close();}
});

test("lifecycle, risk and audit export use one recorded project revision",t=>{
 const path=setup(t),s=openProjectStore(path,{now:()=>1000});
 try{
  const p=s.create(base);
  s.append(p.project_id,{command_id:"group-qa",type:"UPSERT_WALLET_GROUP",payload:{group:group()}},{expected_revision:1});
  s.append(p.project_id,{command_id:"ready-qa",type:"TRANSITION_LIFECYCLE",payload:{to:"READY"}},{expected_revision:2});
  s.append(p.project_id,{command_id:"hold-qa",type:"SET_OPERATIONAL_STATUS",payload:{status:"REVIEW_REQUIRED"}},{expected_revision:3});
  const v=s.getLifecycleReview(p.project_id),b=s.exportAuditBundle(p.project_id,4);
  assert.equal(v.project_revision,4);assert.equal(v.recorded_stage,"READY");
  assert.deepEqual(v.recorded_timeline.stages.map(x=>x.stage),["DRAFT","READY"]);
  assert.equal(v.recorded_timeline.explicit_operational_events.at(-1).status,"REVIEW_REQUIRED");
  assert.equal(v.exception_review.status,"REVIEW_REQUIRED");assert.equal(v.exception_review.independent_recovery_verified,false);
  assert.deepEqual(v.recorded_timeline,b.recorded_timeline);assert.deepEqual(v.exception_review,b.exception_review);
  assert.equal(b.settlement_allowed,false);assert.equal(s.get(p.project_id).revision,4);
 }finally{s.close();}
});
