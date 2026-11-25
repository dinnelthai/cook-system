import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openProjectStore } from "../src/inner-market/project-store.mjs";
import { createProjectHttpHandler } from "../src/inner-market/project-http.mjs";

const wallet = "11111111111111111111111111111111";
async function readRequestJson(req, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw Error("BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total).toString("utf8");
}
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "cook-project-http-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = openProjectStore(join(realpathSync(dir), "projects.sqlite"), {
    idFactory: (() => { let n = 0; return () => "event-" + (++n); })(),
    now: () => 1000
  });
  t.after(() => store.close());
  const handler = createProjectHttpHandler({ store, readRequestJson, maxBodyBytes: 2048 });
  const server = createServer(async (req, res) => {
    if (!await handler(req, res)) { res.writeHead(404); res.end(); }
  });
  server.listen(0, "127.0.0.1");
  t.after(() => server.close());
  return new Promise(resolve => server.once("listening", () => resolve("http://127.0.0.1:" + server.address().port)));
}
const json = (url, method, body) => fetch(url, {
  method, headers: { "content-type": "application/json" }, body: JSON.stringify(body)
});

test("Project HTTP API creates, reads, mutates and verifies a persisted project", async t => {
  const base = await setup(t);
  const createdResponse = await json(base + "/api/projects", "POST", {
    project_id: "http-project-1",
    profile: { name: "HTTP Project", symbol: "HTTP" },
    network: { cluster: "localnet", genesis_hash: wallet },
    token: { supply_base_units: "1000000000", decimals: 6, creator_wallet_address: wallet }
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).project;
  assert.equal(created.revision, 1);
  assert.equal(created.execution_policy.enabled, false);
  assert.equal(JSON.stringify(created).includes("private_key"), false);

  const config = await (await fetch(base + "/api/projects/config")).json();
  assert.equal(config.network.cluster, "localnet");
  assert.equal(config.execution_enabled, false);

  const listResponse = await fetch(base + "/api/projects");
  assert.equal(listResponse.status, 200);
  assert.equal((await listResponse.json()).projects.length, 1);

  const group = {
    group_id: "dev-wallets", name: "Dev Wallets", purpose: "DEV",
    members: [{ wallet_address: wallet, role: "DEV", enabled: true, allocation_limit_base_units: null }]
  };
  const command = {
    command_id: "http-command-1", type: "UPSERT_WALLET_GROUP",
    payload: { group }, expected_revision: 1
  };
  const appliedResponse = await json(base + "/api/projects/http-project-1/commands", "POST", command);
  assert.equal(appliedResponse.status, 200);
  const applied = await appliedResponse.json();
  assert.equal(applied.status, "APPLIED");
  assert.equal(applied.aggregate.revision, 2);

  const retryResponse = await json(base + "/api/projects/http-project-1/commands", "POST", command);
  assert.equal(retryResponse.status, 200);
  assert.equal((await retryResponse.json()).status, "ALREADY_APPLIED");

  const staleResponse = await json(base + "/api/projects/http-project-1/commands", "POST", {
    command_id: "http-command-stale", type: "SET_OPERATIONAL_STATUS",
    payload: { status: "HALTED" }, expected_revision: 1
  });
  assert.equal(staleResponse.status, 409);
  assert.equal((await staleResponse.json()).code, "PROJECT_REVISION_CONFLICT");

  const getResponse = await fetch(base + "/api/projects/http-project-1");
  assert.equal((await getResponse.json()).project.wallet_groups.length, 1);
  const events = await (await fetch(base + "/api/projects/http-project-1/events")).json();
  assert.equal(events.events.length, 2);
  const verify = await (await fetch(base + "/api/projects/http-project-1/verify")).json();
  assert.equal(verify.status, "VERIFIED");
  assert.equal(verify.event_count, 2);
});

test("Project HTTP API rejects malformed, oversized and unsupported requests", async t => {
  const base = await setup(t);
  const wrongType = await fetch(base + "/api/projects", { method: "POST", body: "{}" });
  assert.equal(wrongType.status, 415);
  assert.equal((await wrongType.json()).code, "JSON_CONTENT_TYPE_REQUIRED");

  const malformed = await fetch(base + "/api/projects", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{"
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, "INVALID_JSON");

  const oversized = await json(base + "/api/projects", "POST", { note: "x".repeat(3000) });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).code, "BODY_TOO_LARGE");

  const query = await fetch(base + "/api/projects?limit=1");
  assert.equal(query.status, 400);
  assert.equal((await query.json()).code, "QUERY_NOT_SUPPORTED");

  const missing = await fetch(base + "/api/projects/does-not-exist");
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, "PROJECT_NOT_FOUND");
});
