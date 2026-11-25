import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openProjectStore } from "../src/inner-market/project-store.mjs";

const wallet = "11111111111111111111111111111111";
const base = {
  project_id: "persisted-alpha",
  profile: { name: "Persisted Alpha", symbol: "ALPHA" },
  network: { cluster: "localnet", genesis_hash: wallet }
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
