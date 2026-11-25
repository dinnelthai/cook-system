import { randomUUID, createHash } from "node:crypto";
import { canonicalJson } from "../core/canonical-json.mjs";

export const PROJECT_SCHEMA_VERSION = "1.0.0";
export const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
export const PROJECT_STAGES = Object.freeze([
  "DRAFT", "READY", "LAUNCH_SUBMITTED", "LAUNCHED", "BONDING_CURVE_ACTIVE",
  "GRADUATION_PENDING", "PUMPSWAP_ACTIVE", "EXIT_IN_PROGRESS",
  "SETTLEMENT_PENDING", "CLOSED", "ARCHIVED"
]);
const CLUSTERS = new Set(["localnet", "devnet", "mainnet"]);
const VENUES = new Set(["PUMP_BONDING_CURVE", "PUMP_SWAP", "RAYDIUM_CPMM"]);
const GROUP_PURPOSES = new Set(["DEV", "TREASURY", "OPERATIONS", "MARKET_OPERATIONS", "OBSERVER"]);
const MEMBER_ROLES = new Set(["DEV", "TREASURY", "OPERATOR", "EXECUTOR", "OBSERVER"]);
const STAGES = new Set(PROJECT_STAGES);
const BASE_UNITS = /^(0|[1-9][0-9]*)$/;
const U64_MAX = 18446744073709551615n;
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function fail(code) { throw Error(code); }
function record(value, code = "INVALID_OBJECT") {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}
function exactKeys(value, allowed, code) {
  record(value, code);
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(code);
}
function text(value, max, code) {
  if (typeof value !== "string" || !value.trim() || value.length > max) fail(code);
  return value.trim();
}
function baseUnits(value, code) {
  if (typeof value !== "string" || !BASE_UNITS.test(value)) fail(code);
  return value;
}
function decodedBase58Length(value) {
  if (typeof value !== "string" || value.length < 32 || value.length > 88) return -1;
  let n = 0n;
  for (const char of value) {
    const digit = B58.indexOf(char);
    if (digit < 0) return -1;
    n = n * 58n + BigInt(digit);
  }
  let bytes = 0;
  while (n > 0n) { bytes++; n >>= 8n; }
  return value.match(/^1*/)[0].length + bytes;
}
function publicKey(value, code = "INVALID_SOLANA_ADDRESS") {
  if (decodedBase58Length(value) !== 32) fail(code);
  return value;
}
function signature(value) {
  if (decodedBase58Length(value) !== 64) fail("INVALID_TRANSACTION_SIGNATURE");
  return value;
}
function urlValue(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim()) fail("INVALID_PROJECT_URL");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname) fail("INVALID_PROJECT_URL");
    return url.href;
  } catch { fail("INVALID_PROJECT_URL"); }
}
function digest(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
function timestamp(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail("INVALID_TIMESTAMP");
  return value;
}

function normalizeProfile(input) {
  exactKeys(input, ["name", "symbol", "description", "website", "telegram", "twitter"], "INVALID_PROJECT_PROFILE");
  const name = text(input.name, 32, "INVALID_PROJECT_NAME");
  const symbol = text(input.symbol, 10, "INVALID_PROJECT_SYMBOL").toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) fail("INVALID_PROJECT_SYMBOL");
  const description = input.description ?? "";
  if (typeof description !== "string" || description.length > 1000) fail("INVALID_PROJECT_DESCRIPTION");
  return {
    name, symbol, description,
    website: input.website == null || input.website === "" ? null : urlValue(input.website),
    telegram: input.telegram == null || input.telegram === "" ? null : urlValue(input.telegram),
    twitter: input.twitter == null || input.twitter === "" ? null : urlValue(input.twitter)
  };
}
function normalizeNetwork(input) {
  exactKeys(input, ["chain_id", "cluster", "genesis_hash", "quote_mint"], "INVALID_PROJECT_NETWORK");
  if ((input.chain_id ?? "solana") !== "solana" || !CLUSTERS.has(input.cluster ?? "localnet")) fail("UNSUPPORTED_PROJECT_NETWORK");
  const genesis = input.genesis_hash ?? null;
  if (genesis !== null) publicKey(genesis, "INVALID_GENESIS_HASH");
  const quote = input.quote_mint ?? WRAPPED_SOL_MINT;
  if (quote !== WRAPPED_SOL_MINT) fail("UNSUPPORTED_QUOTE_ASSET");
  return { chain_id: "solana", cluster: input.cluster ?? "localnet", genesis_hash: genesis, quote_mint: quote };
}
function normalizeToken(input, { persisted = false } = {}) {
  exactKeys(input, ["mint", "supply_base_units", "decimals", "creator_wallet_address", "issuance_status", "issuance_signature", "verification_evidence_ref"], "INVALID_PROJECT_TOKEN");
  const mint = input.mint ?? null;
  if (mint !== null) publicKey(mint, "INVALID_TOKEN_MINT");
  const supply = input.supply_base_units ?? null;
  if (supply !== null && BigInt(baseUnits(supply, "INVALID_TOKEN_SUPPLY")) < 1n) fail("INVALID_TOKEN_SUPPLY");
  if (supply !== null && BigInt(supply) > U64_MAX) fail("TOKEN_SUPPLY_EXCEEDS_U64");
  const decimals = input.decimals ?? null;
  if (decimals !== null && (!Number.isInteger(decimals) || decimals < 0 || decimals > 9)) fail("INVALID_TOKEN_DECIMALS");
  if ((supply === null) !== (decimals === null)) fail("INCOMPLETE_TOKEN_SUPPLY");
  const creator = input.creator_wallet_address ?? null;
  if (creator !== null) publicKey(creator, "INVALID_CREATOR_WALLET");
  const status = input.issuance_status ?? (mint === null ? "DRAFT" : "EVIDENCE_UNVERIFIED");
  if (!["DRAFT", "EVIDENCE_UNVERIFIED", "VERIFIED"].includes(status)) fail("INVALID_ISSUANCE_STATUS");
  if (!persisted && status === "VERIFIED") fail("ISSUANCE_VERIFICATION_REQUIRES_VERIFIER");
  const issuanceSignature = input.issuance_signature ?? null;
  if (issuanceSignature !== null) signature(issuanceSignature);
  const verificationRef = input.verification_evidence_ref ?? null;
  if (verificationRef !== null) text(verificationRef, 256, "INVALID_EVIDENCE_REFERENCE");
  if (mint === null && (status !== "DRAFT" || issuanceSignature !== null || verificationRef !== null)) fail("INVALID_ISSUANCE_STATE");
  if (mint !== null && (!issuanceSignature || status === "DRAFT")) fail("ISSUANCE_EVIDENCE_REQUIRED");
  if (status === "VERIFIED" && !verificationRef) fail("ISSUANCE_VERIFICATION_REQUIRED");
  if (status !== "VERIFIED" && verificationRef !== null) fail("UNEXPECTED_ISSUANCE_VERIFICATION");
  return {
    mint, supply_base_units: supply, decimals, creator_wallet_address: creator,
    issuance_status: status, issuance_signature: issuanceSignature,
    verification_evidence_ref: verificationRef
  };
}
function normalizeLimits(input) {
  exactKeys(input, ["max_project_budget_base_units", "max_order_size_base_units", "max_wallet_exposure_base_units", "max_drawdown_bps"], "INVALID_PROJECT_LIMITS");
  const drawdown = input.max_drawdown_bps ?? null;
  if (drawdown !== null && (!Number.isInteger(drawdown) || drawdown < 0 || drawdown > 10000)) fail("INVALID_DRAWDOWN_LIMIT");
  return {
    max_project_budget_base_units: input.max_project_budget_base_units == null ? null : baseUnits(input.max_project_budget_base_units, "INVALID_PROJECT_LIMITS"),
    max_order_size_base_units: input.max_order_size_base_units == null ? null : baseUnits(input.max_order_size_base_units, "INVALID_PROJECT_LIMITS"),
    max_wallet_exposure_base_units: input.max_wallet_exposure_base_units == null ? null : baseUnits(input.max_wallet_exposure_base_units, "INVALID_PROJECT_LIMITS"),
    max_drawdown_bps: drawdown
  };
}
function normalizeWalletGroup(input) {
  exactKeys(input, ["group_id", "name", "purpose", "members"], "INVALID_WALLET_GROUP");
  const groupId = text(input.group_id, 128, "INVALID_WALLET_GROUP_ID");
  const name = text(input.name, 64, "INVALID_WALLET_GROUP_NAME");
  if (!GROUP_PURPOSES.has(input.purpose)) fail("INVALID_WALLET_GROUP_PURPOSE");
  if (!Array.isArray(input.members) || input.members.length < 1 || input.members.length > 20) fail("INVALID_WALLET_GROUP_MEMBERS");
  const seen = new Set();
  const members = input.members.map(member => {
    exactKeys(member, ["wallet_address", "role", "enabled", "allocation_limit_base_units"], "INVALID_WALLET_GROUP_MEMBER");
    const address = publicKey(member.wallet_address);
    if (seen.has(address)) fail("DUPLICATE_WALLET_GROUP_MEMBER");
    seen.add(address);
    if (!MEMBER_ROLES.has(member.role) || typeof member.enabled !== "boolean") fail("INVALID_WALLET_GROUP_MEMBER");
    return {
      wallet_address: address, role: member.role, enabled: member.enabled,
      allocation_limit_base_units: member.allocation_limit_base_units == null ? null : baseUnits(member.allocation_limit_base_units, "INVALID_WALLET_ALLOCATION")
    };
  });
  return { group_id: groupId, name, purpose: input.purpose, members };
}
function normalizeMarketBinding(input, aggregate, { persisted = false } = {}) {
  const keys = persisted
    ? ["market_id", "venue", "market_account", "identity", "identity_digest", "verification_status", "verification_evidence_ref"]
    : ["market_id", "venue", "market_account", "identity"];
  exactKeys(input, keys, "INVALID_MARKET_BINDING");
  const marketId = text(input.market_id, 128, "INVALID_MARKET_ID");
  if (!VENUES.has(input.venue)) fail("INVALID_MARKET_VENUE");
  const marketAccount = publicKey(input.market_account, "INVALID_MARKET_ACCOUNT");
  const identity = input.identity;
  exactKeys(identity, ["chain_id", "network", "token_mint", "quote_mint", "curve_program_id", "curve_account", "program_version", "idl_revision", "market_phase"], "INVALID_MARKET_IDENTITY");
  if (identity.chain_id !== "solana" || identity.network !== aggregate.network.cluster ||
      identity.token_mint !== aggregate.token.mint || identity.quote_mint !== aggregate.network.quote_mint) fail("MARKET_PROJECT_IDENTITY_MISMATCH");
  publicKey(identity.token_mint, "INVALID_TOKEN_MINT");
  publicKey(identity.quote_mint, "INVALID_QUOTE_MINT");
  publicKey(identity.curve_program_id, "INVALID_MARKET_PROGRAM");
  const curveAccount = identity.curve_account ?? null;
  if (curveAccount !== null) publicKey(curveAccount, "INVALID_CURVE_ACCOUNT");
  const programVersion = identity.program_version ?? null;
  const idlRevision = identity.idl_revision ?? null;
  if (programVersion !== null) text(programVersion, 128, "INVALID_PROGRAM_VERSION");
  if (idlRevision !== null) text(idlRevision, 128, "INVALID_IDL_REVISION");
  if (!["bonding_curve", "graduated", "post_graduation"].includes(identity.market_phase)) fail("INVALID_MARKET_PHASE");
  if (input.venue === "PUMP_BONDING_CURVE" && identity.market_phase !== "bonding_curve") fail("VENUE_PHASE_MISMATCH");
  if (input.venue !== "PUMP_BONDING_CURVE" && identity.market_phase !== "post_graduation") fail("VENUE_PHASE_MISMATCH");
  if (input.venue === "PUMP_BONDING_CURVE" && curveAccount !== marketAccount) fail("CURVE_ACCOUNT_MISMATCH");
  const normalizedIdentity = {
    chain_id: "solana", network: identity.network, token_mint: identity.token_mint,
    quote_mint: identity.quote_mint, curve_program_id: identity.curve_program_id,
    curve_account: curveAccount, program_version: programVersion, idl_revision: idlRevision,
    market_phase: identity.market_phase
  };
  const identityDigest = digest(normalizedIdentity);
  let verificationStatus = "UNVERIFIED", verificationEvidenceRef = null;
  if (persisted) {
    verificationStatus = input.verification_status;
    verificationEvidenceRef = input.verification_evidence_ref ?? null;
    if (!["UNVERIFIED", "VERIFIED"].includes(verificationStatus)) fail("INVALID_MARKET_VERIFICATION_STATUS");
    if (verificationStatus === "VERIFIED" && !verificationEvidenceRef) fail("MARKET_VERIFICATION_EVIDENCE_REQUIRED");
    if (verificationStatus === "UNVERIFIED" && verificationEvidenceRef !== null) fail("UNEXPECTED_MARKET_VERIFICATION");
    if (input.identity_digest !== identityDigest) fail("MARKET_IDENTITY_DIGEST_MISMATCH");
  }
  return {
    market_id: marketId, venue: input.venue, market_account: marketAccount,
    identity: normalizedIdentity, identity_digest: identityDigest,
    verification_status: verificationStatus, verification_evidence_ref: verificationEvidenceRef
  };
}
function normalizeEvidence(input) {
  exactKeys(input, ["kind", "source", "verification", "reference"], "INVALID_LIFECYCLE_EVIDENCE");
  const kinds = ["LAUNCH_TRANSACTION", "TOKEN_MINT", "MARKET_ACCOUNT", "CURVE_COMPLETE", "EXIT_APPROVAL", "EXIT_COMPLETED", "FINAL_RECONCILIATION", "ARCHIVE_CREATED"];
  if (!kinds.includes(input.kind)) fail("INVALID_LIFECYCLE_EVIDENCE_KIND");
  if (!["local_execution", "observed_chain", "operator", "internal_audit"].includes(input.source)) fail("INVALID_LIFECYCLE_EVIDENCE_SOURCE");
  if (!["SUBMITTED", "VERIFIED", "OPERATOR_CONFIRMED"].includes(input.verification)) fail("INVALID_LIFECYCLE_EVIDENCE_STATUS");
  return { kind: input.kind, source: input.source, verification: input.verification, reference: text(input.reference, 256, "INVALID_EVIDENCE_REFERENCE") };
}
function normalizeLifecycle(input) {
  exactKeys(input, ["stage", "operational_status", "stage_changed_at_ms", "evidence_ref"], "INVALID_PROJECT_LIFECYCLE");
  if (!STAGES.has(input.stage) || !["HALTED", "ACTIVE", "REVIEW_REQUIRED"].includes(input.operational_status)) fail("INVALID_PROJECT_LIFECYCLE");
  return {
    stage: input.stage, operational_status: input.operational_status,
    stage_changed_at_ms: timestamp(input.stage_changed_at_ms),
    evidence_ref: input.evidence_ref == null ? null : text(input.evidence_ref, 256, "INVALID_EVIDENCE_REFERENCE")
  };
}
function normalizeExecutionPolicy(input) {
  exactKeys(input, ["mode", "enabled", "requires_risk_approval", "unknown_blocks_execution"], "INVALID_EXECUTION_POLICY");
  if (input.mode !== "DISABLED" || input.enabled !== false || input.requires_risk_approval !== true || input.unknown_blocks_execution !== true) fail("EXECUTION_POLICY_MUST_REMAIN_DISABLED");
  return { mode: "DISABLED", enabled: false, requires_risk_approval: true, unknown_blocks_execution: true };
}
function assertUniqueWallets(groups) {
  const seen = new Set();
  for (const group of groups) for (const member of group.members) {
    if (seen.has(member.wallet_address)) fail("WALLET_ASSIGNED_TO_MULTIPLE_GROUPS");
    seen.add(member.wallet_address);
  }
}

export function createProjectAggregate(input, { idFactory = randomUUID, now = () => Date.now() } = {}) {
  exactKeys(input, ["project_id", "profile", "network", "token", "limits", "wallet_group"], "INVALID_PROJECT_INPUT");
  const createdAt = timestamp(now());
  const aggregate = {
    schema_version: PROJECT_SCHEMA_VERSION,
    project_id: input.project_id == null ? text(idFactory(), 128, "INVALID_PROJECT_ID") : text(input.project_id, 128, "INVALID_PROJECT_ID"),
    revision: 1, created_at_ms: createdAt, updated_at_ms: createdAt,
    profile: normalizeProfile(input.profile),
    network: normalizeNetwork(input.network ?? { cluster: "localnet" }),
    token: normalizeToken(input.token ?? {}),
    wallet_groups: input.wallet_group == null ? [] : [normalizeWalletGroup(input.wallet_group)], markets: [],
    limits: normalizeLimits(input.limits ?? {}),
    lifecycle: { stage: "DRAFT", operational_status: "HALTED", stage_changed_at_ms: createdAt, evidence_ref: null },
    execution_policy: { mode: "DISABLED", enabled: false, requires_risk_approval: true, unknown_blocks_execution: true },
    source_attestation: "UNKNOWN"
  };
  assertProjectAggregate(aggregate);
  return structuredClone(aggregate);
}

export function assertProjectAggregate(value) {
  exactKeys(value, ["schema_version", "project_id", "revision", "created_at_ms", "updated_at_ms", "profile", "network", "token", "wallet_groups", "markets", "limits", "lifecycle", "execution_policy", "source_attestation"], "INVALID_PROJECT_AGGREGATE");
  if (value.schema_version !== PROJECT_SCHEMA_VERSION || typeof value.project_id !== "string" || !value.project_id ||
      !Number.isSafeInteger(value.revision) || value.revision < 1) fail("INVALID_PROJECT_AGGREGATE");
  timestamp(value.created_at_ms); timestamp(value.updated_at_ms);
  if (value.updated_at_ms < value.created_at_ms) fail("INVALID_PROJECT_TIMESTAMPS");
  const profile = normalizeProfile(value.profile);
  const network = normalizeNetwork(value.network);
  const token = normalizeToken(value.token, { persisted: true });
  if (!Array.isArray(value.wallet_groups) || value.wallet_groups.length > 20) fail("INVALID_PROJECT_WALLET_GROUPS");
  const walletGroups = value.wallet_groups.map(normalizeWalletGroup);
  assertUniqueWallets(walletGroups);
  if (!Array.isArray(value.markets) || value.markets.length > 20) fail("INVALID_PROJECT_MARKETS");
  const interim = { ...value, profile, network, token };
  const markets = value.markets.map(m => normalizeMarketBinding(m, interim, { persisted: true }));
  if (new Set(markets.map(m => m.market_id)).size !== markets.length) fail("DUPLICATE_MARKET_ID");
  const limits = normalizeLimits(value.limits);
  const lifecycle = normalizeLifecycle(value.lifecycle);
  const executionPolicy = normalizeExecutionPolicy(value.execution_policy);
  if (value.source_attestation !== "UNKNOWN") fail("INVALID_SOURCE_ATTESTATION");
  if (token.creator_wallet_address && walletGroups.some(g => g.members.some(m => m.wallet_address === token.creator_wallet_address && m.role !== "DEV"))) fail("CREATOR_WALLET_ROLE_MISMATCH");
  const devGroup = walletGroups.find(group => group.group_id === "dev-wallets");
  if (devGroup && (!token.creator_wallet_address || !devGroup.members.some(member => member.wallet_address === token.creator_wallet_address && member.role === "DEV" && member.enabled))) fail("PROJECT_DEV_WALLET_GROUP_MISMATCH");
  const normalized = {
    schema_version: PROJECT_SCHEMA_VERSION, project_id: value.project_id, revision: value.revision,
    created_at_ms: value.created_at_ms, updated_at_ms: value.updated_at_ms,
    profile, network, token, wallet_groups: walletGroups, markets, limits, lifecycle,
    execution_policy: executionPolicy, source_attestation: "UNKNOWN"
  };
  if (canonicalJson(normalized) !== canonicalJson(value)) fail("NON_CANONICAL_PROJECT_AGGREGATE");
  return structuredClone(normalized);
}

export function validateProjectAggregate(value) {
  try { assertProjectAggregate(value); return { valid: true, errors: [] }; }
  catch (error) { return { valid: false, errors: [error.message] }; }
}

function requireEvidence(input, { kind, source, verification, reference } = {}) {
  const evidence = normalizeEvidence(input);
  if (kind && evidence.kind !== kind) fail("LIFECYCLE_EVIDENCE_KIND_MISMATCH");
  if (source && evidence.source !== source) fail("LIFECYCLE_EVIDENCE_SOURCE_MISMATCH");
  if (verification && evidence.verification !== verification) fail("LIFECYCLE_EVIDENCE_STATUS_MISMATCH");
  if (reference && evidence.reference !== reference) fail("LIFECYCLE_EVIDENCE_REFERENCE_MISMATCH");
  return evidence;
}
const NEXT_STAGE = Object.freeze({
  DRAFT: "READY", READY: "LAUNCH_SUBMITTED", LAUNCH_SUBMITTED: "LAUNCHED",
  LAUNCHED: "BONDING_CURVE_ACTIVE", BONDING_CURVE_ACTIVE: "GRADUATION_PENDING",
  GRADUATION_PENDING: "PUMPSWAP_ACTIVE", PUMPSWAP_ACTIVE: "EXIT_IN_PROGRESS",
  EXIT_IN_PROGRESS: "SETTLEMENT_PENDING", SETTLEMENT_PENDING: "CLOSED", CLOSED: "ARCHIVED"
});
function transitionLifecycle(project, payload, now) {
  exactKeys(payload, ["to", "evidence", "settlement"], "INVALID_LIFECYCLE_TRANSITION");
  // An already issued project may stop operations without reaching graduation.
  // This only records operator intent; reconciliation still requires trusted evidence.
  const earlyExit = payload.to === "EXIT_IN_PROGRESS" && ["LAUNCHED", "BONDING_CURVE_ACTIVE", "GRADUATION_PENDING"].includes(project.lifecycle.stage);
  const expected = earlyExit ? "EXIT_IN_PROGRESS" : NEXT_STAGE[project.lifecycle.stage];
  if (!expected || payload.to !== expected) fail("INVALID_LIFECYCLE_TRANSITION");
  let evidence = null;
  const verified = (kind, reference) => requireEvidence(payload.evidence, { kind, source: "observed_chain", verification: "VERIFIED", reference });
  switch (expected) {
    case "READY": {
      if (!project.network.genesis_hash || !project.token.supply_base_units || project.token.decimals === null || !project.token.creator_wallet_address) fail("PROJECT_NOT_READY");
      const creator = project.wallet_groups.some(g => g.members.some(m => m.wallet_address === project.token.creator_wallet_address && m.role === "DEV" && m.enabled));
      if (!creator) fail("PROJECT_DEV_WALLET_NOT_ASSIGNED");
      break;
    }
    case "LAUNCH_SUBMITTED":
      if (!project.token.issuance_signature || !project.token.mint) fail("ISSUANCE_EVIDENCE_REQUIRED");
      evidence = requireEvidence(payload.evidence, { kind: "LAUNCH_TRANSACTION", source: "local_execution", verification: "SUBMITTED", reference: project.token.issuance_signature });
      break;
    case "LAUNCHED":
      if (project.token.issuance_status !== "VERIFIED") fail("TOKEN_ISSUANCE_NOT_VERIFIED");
      evidence = verified("LAUNCH_TRANSACTION", project.token.issuance_signature);
      break;
    case "BONDING_CURVE_ACTIVE":
      if (!project.markets.some(m => m.venue === "PUMP_BONDING_CURVE" && m.verification_status === "VERIFIED")) fail("VERIFIED_BONDING_CURVE_REQUIRED");
      break;
    case "GRADUATION_PENDING":
      evidence = verified("CURVE_COMPLETE");
      break;
    case "PUMPSWAP_ACTIVE":
      if (!project.markets.some(m => m.venue === "PUMP_SWAP" && m.verification_status === "VERIFIED")) fail("VERIFIED_PUMPSWAP_MARKET_REQUIRED");
      break;
    case "EXIT_IN_PROGRESS":
      evidence = requireEvidence(payload.evidence, { kind: "EXIT_APPROVAL", source: "operator", verification: "OPERATOR_CONFIRMED" });
      break;
    case "SETTLEMENT_PENDING":
      evidence = verified("EXIT_COMPLETED");
      break;
    case "CLOSED": {
      evidence = requireEvidence(payload.evidence, { kind: "FINAL_RECONCILIATION", source: "internal_audit", verification: "VERIFIED" });
      const s = payload.settlement;
      exactKeys(s, ["reconciliation_status", "pending_order_count", "unresolved_balance_difference_base_units", "unresolved_asset_count"], "INVALID_SETTLEMENT_EVIDENCE");
      if (s.reconciliation_status !== "PASS" || s.pending_order_count !== 0 || s.unresolved_asset_count !== 0 ||
          baseUnits(s.unresolved_balance_difference_base_units, "INVALID_SETTLEMENT_EVIDENCE") !== "0") fail("SETTLEMENT_NOT_RECONCILED");
      break;
    }
    case "ARCHIVED":
      evidence = requireEvidence(payload.evidence, { kind: "ARCHIVE_CREATED", source: "internal_audit", verification: "VERIFIED" });
      break;
  }
  project.lifecycle = {
    ...project.lifecycle, stage: expected, stage_changed_at_ms: now,
    operational_status: ["EXIT_IN_PROGRESS", "SETTLEMENT_PENDING", "CLOSED", "ARCHIVED"].includes(expected)
      ? (project.lifecycle.operational_status === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "HALTED")
      : project.lifecycle.operational_status,
    evidence_ref: evidence?.reference ?? project.lifecycle.evidence_ref
  };
  return { to: expected, evidence, settlement: payload.settlement ?? null };
}

export function applyProjectCommand(current, command, { now = () => Date.now() } = {}) {
  const project = assertProjectAggregate(current);
  exactKeys(command, ["type", "payload"], "INVALID_PROJECT_COMMAND");
  const payload = record(command.payload, "INVALID_PROJECT_COMMAND");
  const at = timestamp(now());
  let eventPayload;
  switch (command.type) {
    case "UPDATE_PROFILE": {
      exactKeys(payload, ["profile"], "INVALID_PROJECT_COMMAND_PAYLOAD");
      const nextProfile = normalizeProfile({ ...project.profile, ...record(payload.profile, "INVALID_PROJECT_PROFILE") });
      if (!["DRAFT", "READY"].includes(project.lifecycle.stage) && nextProfile.symbol !== project.profile.symbol) fail("PROJECT_SYMBOL_LOCKED");
      project.profile = nextProfile;
      eventPayload = { profile: nextProfile };
      break;
    }
    case "UPDATE_DRAFT_CONFIGURATION": {
      exactKeys(payload, ["profile", "network", "token", "wallet_group"], "INVALID_PROJECT_COMMAND_PAYLOAD");
      if (project.lifecycle.stage !== "DRAFT" || project.token.mint !== null) fail("PROJECT_DRAFT_CONFIGURATION_LOCKED");
      const profile = normalizeProfile(payload.profile);
      const network = normalizeNetwork(payload.network);
      exactKeys(payload.token, ["supply_base_units", "decimals", "creator_wallet_address"], "INVALID_PROJECT_TOKEN_CONFIGURATION");
      const token = normalizeToken({ ...project.token, ...payload.token }, { persisted: true });
      let walletGroups = project.wallet_groups.filter(group => group.group_id !== "dev-wallets");
      if (payload.wallet_group !== null) {
        const group = normalizeWalletGroup(payload.wallet_group);
        if (group.group_id !== "dev-wallets" || group.purpose !== "DEV" ||
            !token.creator_wallet_address ||
            !group.members.some(member => member.wallet_address === token.creator_wallet_address && member.role === "DEV" && member.enabled)) {
          fail("PROJECT_DEV_WALLET_GROUP_MISMATCH");
        }
        if (walletGroups.some(existing => existing.members.some(member => group.members.some(next => next.wallet_address === member.wallet_address)))) {
          fail("WALLET_ASSIGNED_TO_MULTIPLE_GROUPS");
        }
        walletGroups.push(group);
      } else if (token.creator_wallet_address) {
        fail("PROJECT_DEV_WALLET_REQUIRED");
      }
      project.profile = profile;
      project.network = network;
      project.token = token;
      project.wallet_groups = walletGroups;
      eventPayload = { profile, network, token, wallet_groups: walletGroups };
      break;
    }
    case "SET_NETWORK_IDENTITY": {
      exactKeys(payload, ["network"], "INVALID_PROJECT_COMMAND_PAYLOAD");
      if (project.lifecycle.stage !== "DRAFT") fail("PROJECT_NETWORK_LOCKED");
      project.network = normalizeNetwork(payload.network);
      eventPayload = { network: project.network };
      break;
    }
    case "SET_TOKEN_CONFIGURATION": {
      exactKeys(payload, ["supply_base_units", "decimals", "creator_wallet_address"], "INVALID_PROJECT_COMMAND_PAYLOAD");
      if (project.lifecycle.stage !== "DRAFT" || project.token.mint !== null) fail("PROJECT_TOKEN_CONFIGURATION_LOCKED");
      project.token = normalizeToken({ ...project.token, ...payload }, { persisted: true });
      eventPayload = { token: project.token };
      break;
    }
    case "UPSERT_WALLET_GROUP": {
      exactKeys(payload, ["group"], "INVALID_PROJECT_COMMAND_PAYLOAD");
      const group = normalizeWalletGroup(payload.group);
      const others = project.wallet_groups.filter(g => g.group_id !== group.group_id);
      if (others.some(g => g.members.some(m => group.members.some(n => n.wallet_address === m.wallet_address)))) fail("WALLET_ASSIGNED_TO_MULTIPLE_GROUPS");
      const index = project.wallet_groups.findIndex(g => g.group_id === group.group_id);
      if (index < 0 && project.wallet_groups.length >= 20) fail("PROJECT_WALLET_GROUP_LIMIT");
      if (index < 0) project.wallet_groups.push(group); else project.wallet_groups[index] = group;
      assertUniqueWallets(project.wallet_groups);
      eventPayload = { group };
      break;
    }
    case "RECORD_ISSUANCE_EVIDENCE": {
      exactKeys(payload, ["mint", "signature"], "INVALID_PROJECT_COMMAND_PAYLOAD");
      if (!["READY", "LAUNCH_SUBMITTED"].includes(project.lifecycle.stage)) fail("ISSUANCE_EVIDENCE_STAGE_INVALID");
      const mint = publicKey(payload.mint, "INVALID_TOKEN_MINT");
      const txSignature = signature(payload.signature);
      if (project.token.mint && (project.token.mint !== mint || project.token.issuance_signature !== txSignature)) fail("ISSUANCE_EVIDENCE_CONFLICT");
      project.token = normalizeToken({
        ...project.token, mint, issuance_signature: txSignature,
        issuance_status: "EVIDENCE_UNVERIFIED", verification_evidence_ref: null
      }, { persisted: true });
      eventPayload = { mint, signature: txSignature, verification_status: "UNVERIFIED" };
      break;
    }
    case "VERIFY_ISSUANCE": {
      exactKeys(payload, ["evidence"], "INVALID_PROJECT_COMMAND_PAYLOAD");
      if (project.lifecycle.stage !== "LAUNCH_SUBMITTED") fail("ISSUANCE_VERIFICATION_STAGE_INVALID");
      const evidence = requireEvidence(payload.evidence, {
        kind: "TOKEN_MINT", source: "observed_chain", verification: "VERIFIED", reference: project.token.mint
      });
      if (!project.token.mint || evidence.reference !== project.token.mint) fail("ISSUANCE_EVIDENCE_MISMATCH");
      if (project.token.issuance_status === "VERIFIED") fail("ISSUANCE_ALREADY_VERIFIED");
      project.token = normalizeToken({
        ...project.token, issuance_status: "VERIFIED",
        verification_evidence_ref: evidence.reference
      }, { persisted: true });
      eventPayload = { evidence, mint: project.token.mint };
      break;
    }
    case "BIND_MARKET": {
      exactKeys(payload, ["market"], "INVALID_PROJECT_COMMAND_PAYLOAD");
      if (!project.token.mint) fail("PROJECT_TOKEN_MINT_REQUIRED");
      const market = normalizeMarketBinding(payload.market, project);
      if (market.venue === "PUMP_BONDING_CURVE" && !["LAUNCHED", "BONDING_CURVE_ACTIVE"].includes(project.lifecycle.stage)) fail("BONDING_CURVE_BINDING_STAGE_INVALID");
      if (market.venue !== "PUMP_BONDING_CURVE" && !["GRADUATION_PENDING", "PUMPSWAP_ACTIVE"].includes(project.lifecycle.stage)) fail("POST_GRADUATION_BINDING_STAGE_INVALID");
      if (project.markets.some(m => m.market_id === market.market_id)) fail("DUPLICATE_MARKET_ID");
      if (project.markets.length >= 20) fail("PROJECT_MARKET_LIMIT");
      project.markets.push(market);
      eventPayload = { market };
      break;
    }
    case "VERIFY_MARKET": {
      exactKeys(payload, ["market_id", "evidence"], "INVALID_PROJECT_COMMAND_PAYLOAD");
      const id = text(payload.market_id, 128, "INVALID_MARKET_ID");
      const index = project.markets.findIndex(m => m.market_id === id);
      if (index < 0) fail("MARKET_NOT_FOUND");
      const market = project.markets[index];
      const evidence = requireEvidence(payload.evidence, {
        kind: "MARKET_ACCOUNT", source: "observed_chain", verification: "VERIFIED", reference: market.market_account
      });
      if (market.verification_status === "VERIFIED") fail("MARKET_ALREADY_VERIFIED");
      project.markets[index] = { ...market, verification_status: "VERIFIED", verification_evidence_ref: evidence.reference };
      eventPayload = { market_id: id, evidence };
      break;
    }
    case "SET_BUDGET_LIMITS": {
      exactKeys(payload, ["limits"], "INVALID_PROJECT_COMMAND_PAYLOAD");
      project.limits = normalizeLimits(payload.limits);
      eventPayload = { limits: project.limits };
      break;
    }
    case "SET_OPERATIONAL_STATUS": {
      exactKeys(payload, ["status"], "INVALID_PROJECT_COMMAND_PAYLOAD");
      if (!["HALTED", "ACTIVE", "REVIEW_REQUIRED"].includes(payload.status)) fail("INVALID_OPERATIONAL_STATUS");
      if (payload.status === "ACTIVE" && (
        ["DRAFT", "CLOSED", "ARCHIVED"].includes(project.lifecycle.stage) ||
        project.lifecycle.operational_status === "REVIEW_REQUIRED"
      )) fail("PROJECT_CANNOT_ACTIVATE");
      if (project.lifecycle.operational_status === "REVIEW_REQUIRED" && payload.status !== "REVIEW_REQUIRED") fail("PROJECT_REVIEW_CLEARANCE_REQUIRED");
      project.lifecycle.operational_status = payload.status;
      eventPayload = { status: payload.status, execution_enabled: false };
      break;
    }
    case "CLEAR_REVIEW": {
      exactKeys(payload, ["evidence"], "INVALID_PROJECT_COMMAND_PAYLOAD");
      if (project.lifecycle.operational_status !== "REVIEW_REQUIRED") fail("PROJECT_REVIEW_NOT_ACTIVE");
      const evidence = requireEvidence(payload.evidence, {
        kind: "FINAL_RECONCILIATION", source: "internal_audit", verification: "VERIFIED"
      });
      project.lifecycle.operational_status = "HALTED";
      eventPayload = { evidence, status: "HALTED" };
      break;
    }
    case "TRANSITION_LIFECYCLE":
      eventPayload = transitionLifecycle(project, payload, at);
      break;
    default:
      fail("UNSUPPORTED_PROJECT_COMMAND");
  }
  project.revision += 1;
  project.updated_at_ms = at;
  assertProjectAggregate(project);
  return { aggregate: project, event_type: command.type, payload: eventPayload };
}
