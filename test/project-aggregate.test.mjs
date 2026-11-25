import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createProjectAggregate, applyProjectCommand, validateProjectAggregate, WRAPPED_SOL_MINT } from "../src/inner-market/project-aggregate.mjs";
import { loadSchemaRegistry, validateJsonSchema } from "../src/core/json-schema-validator.mjs";

const wallet = "11111111111111111111111111111111";
const mint = "11111111111111111111111111111112";
const curve = "11111111111111111111111111111113";
const signature = "1".repeat(64);
const base = {
  project_id: "project-alpha",
  profile: { name: "Alpha Token", symbol: "alpha", description: "Localnet project" },
  network: { cluster: "localnet", genesis_hash: wallet, quote_mint: WRAPPED_SOL_MINT },
  token: { supply_base_units: "1000000000000000", decimals: 6, creator_wallet_address: wallet }
};
const group = {
  group_id: "dev-wallets", name: "Dev Wallets", purpose: "DEV",
  members: [{ wallet_address: wallet, role: "DEV", enabled: true, allocation_limit_base_units: "5000000000" }]
};
const run = (project, type, payload, at = 1001) => applyProjectCommand(project, { type, payload }, { now: () => at }).aggregate;
function readyProject() {
  let p = createProjectAggregate(base, { now: () => 1000 });
  p = run(p, "UPSERT_WALLET_GROUP", { group });
  p = run(p, "TRANSITION_LIFECYCLE", { to: "READY" });
  return p;
}
function launchedProject() {
  let p = readyProject();
  p = run(p, "RECORD_ISSUANCE_EVIDENCE", { mint, signature }, 1002);
  p = run(p, "TRANSITION_LIFECYCLE", { to: "LAUNCH_SUBMITTED", evidence: { kind: "LAUNCH_TRANSACTION", source: "local_execution", verification: "SUBMITTED", reference: signature } }, 1003);
  p = run(p, "VERIFY_ISSUANCE", { evidence: { kind: "TOKEN_MINT", source: "observed_chain", verification: "VERIFIED", reference: mint } }, 1004);
  return run(p, "TRANSITION_LIFECYCLE", { to: "LAUNCHED", evidence: { kind: "LAUNCH_TRANSACTION", source: "observed_chain", verification: "VERIFIED", reference: signature } }, 1005);
}

test("new Project aggregate is canonical, scoped to SOL and execution-disabled", () => {
  const project = createProjectAggregate(base, { now: () => 1000 });
  assert.equal(project.lifecycle.stage, "DRAFT");
  assert.equal(project.execution_policy.enabled, false);
  assert.equal(project.execution_policy.mode, "DISABLED");
  assert.equal(project.network.quote_mint, WRAPPED_SOL_MINT);
  assert.equal(project.source_attestation, "UNKNOWN");
  assert.deepEqual(validateProjectAggregate(project), { valid: true, errors: [] });
});
test("Project Aggregate validates against the registered JSON Schema", async () => {
  const project = createProjectAggregate(base, { now: () => 1000 });
  const registry = await loadSchemaRegistry(fileURLToPath(new URL("../schemas/", import.meta.url)));
  const result = validateJsonSchema(project, registry.get("project-aggregate.schema.json"), registry);
  assert.deepEqual(result, { valid: true, errors: [] });
});
test("project cannot become READY without a Dev wallet group and genesis identity", () => {
  let p = createProjectAggregate(base, { now: () => 1000 });
  assert.throws(() => run(p, "TRANSITION_LIFECYCLE", { to: "READY" }), /PROJECT_DEV_WALLET_NOT_ASSIGNED/);
  p = createProjectAggregate({ ...base, network: { cluster: "localnet", quote_mint: WRAPPED_SOL_MINT } }, { now: () => 1000 });
  p = run(p, "UPSERT_WALLET_GROUP", { group });
  assert.throws(() => run(p, "TRANSITION_LIFECYCLE", { to: "READY" }), /PROJECT_NOT_READY/);
});
test("wallets cannot be silently assigned to multiple project groups", () => {
  let p = createProjectAggregate(base, { now: () => 1000 });
  p = run(p, "UPSERT_WALLET_GROUP", { group });
  assert.throws(() => run(p, "UPSERT_WALLET_GROUP", { group: { ...group, group_id: "treasury", purpose: "TREASURY" } }), /WALLET_ASSIGNED_TO_MULTIPLE_GROUPS/);
});
test("issuance evidence remains unverified until a chain-verifier command", () => {
  let p = readyProject();
  assert.throws(() => run(p, "TRANSITION_LIFECYCLE", { to: "LAUNCH_SUBMITTED", evidence: { kind: "LAUNCH_TRANSACTION", source: "local_execution", verification: "SUBMITTED", reference: signature } }), /ISSUANCE_EVIDENCE_REQUIRED/);
  p = run(p, "RECORD_ISSUANCE_EVIDENCE", { mint, signature }, 1002);
  assert.equal(p.token.issuance_status, "EVIDENCE_UNVERIFIED");
  p = run(p, "TRANSITION_LIFECYCLE", { to: "LAUNCH_SUBMITTED", evidence: { kind: "LAUNCH_TRANSACTION", source: "local_execution", verification: "SUBMITTED", reference: signature } }, 1003);
  assert.throws(() => run(p, "TRANSITION_LIFECYCLE", { to: "LAUNCHED", evidence: { kind: "LAUNCH_TRANSACTION", source: "observed_chain", verification: "VERIFIED", reference: signature } }), /TOKEN_ISSUANCE_NOT_VERIFIED/);
  p = run(p, "VERIFY_ISSUANCE", { evidence: { kind: "TOKEN_MINT", source: "observed_chain", verification: "VERIFIED", reference: mint } }, 1004);
  assert.equal(p.token.issuance_status, "VERIFIED");
  p = run(p, "TRANSITION_LIFECYCLE", { to: "LAUNCHED", evidence: { kind: "LAUNCH_TRANSACTION", source: "observed_chain", verification: "VERIFIED", reference: signature } }, 1005);
  assert.equal(p.lifecycle.stage, "LAUNCHED");
});
test("market binding is identity-scoped and cannot advance lifecycle until verified", () => {
  let p = launchedProject();
  const identity = { chain_id: "solana", network: "localnet", token_mint: mint, quote_mint: WRAPPED_SOL_MINT, curve_program_id: curve, curve_account: curve, program_version: "pump-v1", idl_revision: null, market_phase: "bonding_curve" };
  p = run(p, "BIND_MARKET", { market: { market_id: "curve-alpha", venue: "PUMP_BONDING_CURVE", market_account: curve, identity } }, 1006);
  assert.equal(p.markets[0].verification_status, "UNVERIFIED");
  assert.throws(() => run(p, "TRANSITION_LIFECYCLE", { to: "BONDING_CURVE_ACTIVE" }), /VERIFIED_BONDING_CURVE_REQUIRED/);
  assert.throws(() => run(p, "VERIFY_MARKET", { market_id: "curve-alpha", evidence: { kind: "MARKET_ACCOUNT", source: "operator", verification: "VERIFIED", reference: curve } }), /LIFECYCLE_EVIDENCE_SOURCE_MISMATCH/);
  p = run(p, "VERIFY_MARKET", { market_id: "curve-alpha", evidence: { kind: "MARKET_ACCOUNT", source: "observed_chain", verification: "VERIFIED", reference: curve } }, 1007);
  p = run(p, "TRANSITION_LIFECYCLE", { to: "BONDING_CURVE_ACTIVE" }, 1008);
  assert.equal(p.lifecycle.stage, "BONDING_CURVE_ACTIVE");
});
test("symbol cannot be changed after launch", () => {
  const p = launchedProject();
  assert.throws(() => run(p, "UPDATE_PROFILE", { profile: { symbol: "OTHER" } }), /PROJECT_SYMBOL_LOCKED/);
  assert.equal(p.token.mint, mint);
});
test("unsupported execution enabling and non-SOL quote assets are rejected", () => {
  const p = createProjectAggregate(base, { now: () => 1000 });
  assert.throws(() => applyProjectCommand(p, { type: "SET_EXECUTION_POLICY", payload: { enabled: true } }), /UNSUPPORTED_PROJECT_COMMAND/);
  assert.throws(() => createProjectAggregate({ ...base, network: { cluster: "localnet", genesis_hash: wallet, quote_mint: mint } }), /UNSUPPORTED_QUOTE_ASSET/);
});
