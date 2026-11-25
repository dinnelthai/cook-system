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
function setup(t, extras={}) {
  const dir = mkdtempSync(join(tmpdir(), "cook-project-http-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = openProjectStore(join(realpathSync(dir), "projects.sqlite"), {
    idFactory: (() => { let n = 0; return () => "event-" + (++n); })(),
    now: () => 1000
  });
  t.after(() => store.close());
  const handler = createProjectHttpHandler({ store, readRequestJson, maxBodyBytes: 2048, ...extras });
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
  const directoryResult=await listResponse.json();
  assert.equal(directoryResult.projects.length,1);
  assert.equal(directoryResult.directory.project_count,1);
  assert.equal(directoryResult.directory.execution_enabled,false);

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

test("operator HTTP cannot manufacture verified evidence or bypass internal lifecycle gates", async t => {
  const base = await setup(t);
  const root = base + "/api/projects";
  const created = await json(root, "POST", { project_id: "trust-test", profile: { name: "Trust", symbol: "TRUST" } });
  assert.equal(created.status, 201);
  const route = root + "/trust-test/commands";
  const evidence = { kind: "TOKEN_MINT", source: "observed_chain", verification: "VERIFIED", reference: wallet };
  const attempts = [
    ["VERIFY_ISSUANCE", { evidence }],
    ["VERIFY_MARKET", { market_id: "fake", evidence }],
    ["CLEAR_REVIEW", { evidence }],
    ["TRANSITION_LIFECYCLE", { to: "LAUNCHED", evidence }],
    ["TRANSITION_LIFECYCLE", { to: "GRADUATION_PENDING", evidence }],
    ["TRANSITION_LIFECYCLE", { to: "CLOSED", evidence }],
    ["TRANSITION_LIFECYCLE", { to: "READY", evidence }]
  ];
  for (const [i, [type, payload]] of attempts.entries()) {
    const res = await json(route, "POST", { command_id: "forged-" + i, type, payload, expected_revision: 1 });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, "TRUSTED_VERIFIER_REQUIRED");
  }
  const project = (await (await fetch(root + "/trust-test")).json()).project;
  assert.equal(project.revision, 1);
  assert.equal(project.lifecycle.stage, "DRAFT");
  assert.equal(project.token.issuance_status, "DRAFT");
  assert.equal((await (await fetch(root + "/trust-test/events")).json()).events.length, 1);
});

test("evidence archive accepts only server-produced observations and read-only GET does not save",async t=>{
 const base=await setup(t,{inspectEvidence:async p=>({project_id:p.project_id,project_revision:p.revision,status:"UNKNOWN",source_attestation:"UNKNOWN",execution_enabled:false,lifecycle_mutated:false})});
 const root=base+"/api/projects";
 assert.equal((await json(root,"POST",{project_id:"archive-http",profile:{name:"Archive",symbol:"ARC"}})).status,201);
 const url=root+"/archive-http";
 assert.equal((await fetch(url+"/evidence-observation")).status,200);
 assert.equal((await (await fetch(url+"/archive")).json()).records.length,0);
 assert.equal((await json(url+"/evidence-observation","POST",{status:"VERIFIED"})).status,400);
 const res=await json(url+"/evidence-observation","POST",{});assert.equal(res.status,200);
 assert.ok((await res.json()).archive.archive_id);
 assert.equal((await (await fetch(url+"/archive")).json()).records.length,1);
 assert.equal((await (await fetch(url)).json()).project.revision,1);
 assert.equal((await json(url+"/archive","POST",{})).status,405);
 assert.equal((await json(url+"/report-links","POST",{})).status,503);
});

test("market observations and report candidates use server-side project scope",async t=>{
 const base=await setup(t,{inspectMarket:async(p,id)=>({project_id:p.project_id,project_revision:p.revision,market_id:id,status:"UNKNOWN",source_attestation:"UNKNOWN",execution_enabled:false}),listReportCandidates:p=>({project_id:p.project_id,project_revision:p.revision,workspace_revision:0,records:[],execution_enabled:false})});
 const root=base+"/api/projects";
 assert.equal((await json(root,"POST",{project_id:"market-http",profile:{name:"Market",symbol:"MKT"}})).status,201);
 const url=root+"/market-http";
 assert.equal((await json(url+"/market-observation","POST",{market_id:"test",expected_revision:2})).status,409);
 assert.equal((await json(url+"/market-observation","POST",{market_id:"test",expected_revision:1,status:"VERIFIED"})).status,400);
 const res=await json(url+"/market-observation","POST",{market_id:"test",expected_revision:1});
 assert.equal(res.status,200);assert.equal((await res.json()).archive.kind,"MARKET_OBSERVATION");
 assert.equal((await (await fetch(url+"/report-candidates")).json()).project_revision,1);
 assert.equal((await (await fetch(url)).json()).project.revision,1);
});

test("order review endpoint exposes read-only project scope",async t=>{
 const base=await setup(t),root=base+"/api/projects";
 assert.equal((await json(root,"POST",{project_id:"review-http",profile:{name:"Review",symbol:"REV"}})).status,201);
 const route=root+"/review-http/order-review";
 const result=await (await fetch(route)).json();
 assert.deepEqual(result.orders,[]);assert.equal(result.execution_enabled,false);assert.equal(result.settlement_allowed,false);
 assert.equal((await json(route,"POST",{type:"REGISTER_OBSERVATION"})).status,405);
});

test("order receipt review rejects unregistered orders and caller-supplied financial assertions",async t=>{
 const base=await setup(t,{reviewOrderReceipt:async()=>assert.fail("unexpected invocation")}),root=base+"/api/projects";
 assert.equal((await json(root,"POST",{project_id:"receipt-http",profile:{name:"Receipt",symbol:"REC"}})).status,201);
 const url=root+"/receipt-http/order-receipt-review";
 const body={order_id:"o",archive_id:"a",expected_revision:1,expected_order_revision:1};
 assert.equal((await json(url,"POST",{...body,outcome:"SUCCESS"})).status,400);
 assert.equal((await json(url,"POST",body)).status,404);
 assert.equal((await fetch(url)).status,405);
});

test("order review events reject missing orders and arbitrary event submissions",async t=>{
 const base=await setup(t),root=base+"/api/projects";
 assert.equal((await json(root,"POST",{project_id:"order-events-http",profile:{name:"Order Events",symbol:"ORD"}})).status,201);
 const url=root+"/order-events-http/order-review-events";
 const body={order_id:"missing",expected_revision:1,expected_order_revision:1};
 assert.equal((await json(url,"POST",body)).status,404);
 assert.equal((await json(url,"POST",{...body,event:{type:"OBSERVE_OUTCOME"}})).status,400);
 assert.equal((await fetch(url)).status,405);
});

test("audit bundle endpoint is a revision-pinned export, not a closure command",async t=>{
 const base=await setup(t),root=base+"/api/projects";
 assert.equal((await json(root,"POST",{project_id:"audit-http",profile:{name:"Audit",symbol:"AUD"}})).status,201);
 const url=root+"/audit-http/audit-bundle";
 assert.equal((await json(url,"POST",{expected_revision:2})).status,409);
 assert.equal((await json(url,"POST",{expected_revision:1,stage:"ARCHIVED"})).status,400);
 const r=await json(url,"POST",{expected_revision:1});assert.equal(r.status,200);
 const {bundle}=await r.json();assert.equal(bundle.project_id,"audit-http");assert.equal(bundle.execution_enabled,false);assert.equal(bundle.settlement_allowed,false);
 assert.equal((await (await fetch(root+"/audit-http")).json()).project.revision,1);
});

test("treasury review accepts only an existing project report archive reference",async t=>{
 const base=await setup(t,{reviewProjectTreasury:()=>assert.fail("unexpected review")}),root=base+"/api/projects";
 assert.equal((await json(root,"POST",{project_id:"treasury-http",profile:{name:"Treasury",symbol:"TRSY"}})).status,201);
 const url=root+"/treasury-http/treasury-review";
 assert.equal((await json(url,"POST",{expected_revision:1,archive_id:"missing",balance:"0"})).status,400);
 assert.equal((await json(url,"POST",{expected_revision:2,archive_id:"missing"})).status,409);
 assert.equal((await json(url,"POST",{expected_revision:1,archive_id:"missing"})).status,404);
});

test("risk review is a project-scoped read-only evidence projection",async t=>{
 const base=await setup(t),root=base+"/api/projects";
 assert.equal((await json(root,"POST",{project_id:"risk-http",profile:{name:"Risk",symbol:"RISK"}})).status,201);
 const url=root+"/risk-http/risk-review";
 const r=await fetch(url);assert.equal(r.status,200);const v=await r.json();
 assert.equal(v.project_id,"risk-http");assert.equal(v.project_revision,1);assert.equal(v.execution_enabled,false);assert.equal(v.live_risk_assessed,false);
 assert.ok(v.findings.some(f=>f.code==="CURRENT_EXPOSURE_UNAVAILABLE"));
 assert.equal((await json(url,"POST",{status:"SAFE"})).status,405);
 assert.equal((await (await fetch(root+"/risk-http")).json()).project.revision,1);
});

test("market evidence endpoint validates archive scope and rejects client-supplied conclusions",async t=>{
 const base=await setup(t,{reviewProjectMarketEvidence:()=>assert.fail("unexpected review")}),root=base+"/api/projects";
 assert.equal((await json(root,"POST",{project_id:"market-review-http",profile:{name:"Market Review",symbol:"MREV"}})).status,201);
 const url=root+"/market-review-http/market-evidence-review";
 assert.equal((await fetch(url)).status,405);
 assert.equal((await json(url,"POST",{expected_revision:1,archive_id:"missing",status:"VERIFIED"})).status,400);
 assert.equal((await json(url,"POST",{expected_revision:2,archive_id:"missing"})).status,409);
 assert.equal((await json(url,"POST",{expected_revision:1,archive_id:"missing"})).status,404);
});

test("lifecycle endpoint returns a recorded timeline and exception review without mutating project",async t=>{
 const base=await setup(t),root=base+"/api/projects";
 assert.equal((await json(root,"POST",{project_id:"timeline-http",profile:{name:"Timeline",symbol:"TIME"}})).status,201);
 const response=await fetch(root+"/timeline-http/lifecycle-evidence");assert.equal(response.status,200);
 const v=await response.json();assert.equal(v.project_revision,1);
 assert.deepEqual(v.recorded_timeline.stages.map(x=>x.stage),["DRAFT"]);
 assert.equal(v.exception_review.status,"EVIDENCE_INCOMPLETE");
 assert.equal(v.execution_enabled,false);assert.equal(v.exception_review.settlement_allowed,false);
 assert.equal((await (await fetch(root+"/timeline-http")).json()).project.revision,1);
});

test("unified business review is read-only and explicitly distinguishes pending data gates",async t=>{
 const base=await setup(t),root=base+"/api/projects";
 assert.equal((await json(root,"POST",{project_id:"business-http",profile:{name:"Business",symbol:"BIZ"}})).status,201);
 const url=root+"/business-http/business-review",r=await fetch(url);assert.equal(r.status,200);
 const v=await r.json();assert.equal(v.project_revision,1);assert.equal(v.treasury.live_balance,null);
 assert.equal(v.orders.record_count,0);assert.equal(v.data_integration.status,"EXTERNAL_ACCEPTANCE_PENDING");
 assert.equal(v.execution_enabled,false);assert.equal(v.settlement_allowed,false);
 assert.equal((await json(url,"POST",{})).status,405);
 assert.equal((await (await fetch(root+"/business-http")).json()).project.revision,1);
});

test("runtime endpoint requires an exact revision and context for interval selection",async t=>{
 const base=await setup(t),root=base+"/api/projects";
 assert.equal((await json(root,"POST",{project_id:"runtime-http",profile:{name:"Runtime",symbol:"RUN"}})).status,201);
 const url=root+"/runtime-http/runtime",r=await fetch(url);assert.equal(r.status,200);
 const v=await r.json();assert.equal(v.project_revision,1);assert.match(v.runtime_context_id,/^[a-f0-9]{64}$/);
 assert.equal(v.selected_interval,null);assert.equal(v.execution_enabled,false);
 const b=await (await fetch(root+"/runtime-http/business-review")).json();assert.equal(b.runtime_context_id,v.runtime_context_id);
 const body={expected_revision:1,expected_context_id:v.runtime_context_id,report_link_archive_id:"a".repeat(64)};
 assert.equal((await json(url,"POST",body)).status,404);
 assert.equal((await json(url,"POST",{...body,expected_context_id:"b".repeat(64)})).status,409);
 assert.equal((await json(url,"POST",{...body,expected_revision:2})).status,409);
 assert.equal((await json(url,"POST",{...body,extra:true})).status,400);
 assert.equal((await fetch(url,{method:"DELETE"})).status,405);
 assert.equal((await (await fetch(root+"/runtime-http")).json()).project.revision,1);
});

test("dedicated risk API and business risk use the same retrospective findings",async t=>{
 const base=await setup(t),root=base+"/api/projects";
 assert.equal((await json(root,"POST",{project_id:"global-risk-http",profile:{name:"Global Risk",symbol:"GRISK"}})).status,201);
 const v=await (await fetch(root+"/global-risk-http/business-review")).json();
 const r=await (await fetch(root+"/global-risk-http/risk-review")).json();
 assert.deepEqual(r,v.global_risk);assert.equal(r.execution_enabled,false);
 assert.equal(r.portfolio.current_exposure,null);
 assert.equal((await (await fetch(root+"/global-risk-http")).json()).project.revision,1);
});
