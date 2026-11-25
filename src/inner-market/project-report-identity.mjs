import { assertHistoricalReportScope } from "./historical-market-state.mjs";

/** A declared identity match is not authenticated provenance or a live balance. */
export function matchProjectReport(project, input) {
  const result = (status, reasons) => ({ status, reasons, source_attestation: "UNKNOWN", live_state: false, execution_enabled: false });
  if (!project || !input) return result("UNBOUND", ["PROJECT_OR_REPORT_MISSING"]);
  if (input.sourceMode !== "ARCHIVED_HISTORICAL") return result("BLOCKED", ["HISTORICAL_SOURCE_REQUIRED"]);
  let scope;
  try { scope = assertHistoricalReportScope(input); } catch { return result("BLOCKED", ["REPORT_SCOPE_INVALID"]); }
  if (!scope.identity_complete || !project.token?.mint || !project.network?.genesis_hash) return result("UNKNOWN", ["IDENTITY_INCOMPLETE"]);
  const expectedNetwork = project.network.cluster === "localnet" ? "local_sim" : project.network.cluster;
  const expected = { projectId: project.project_id, tokenMint: project.token.mint, network: expectedNetwork, genesisHash: project.network.genesis_hash, quoteAsset: "SOL_LAMPORTS" };
  const mismatches = Object.keys(expected).filter(k => input.scope[k] !== expected[k]);
  return mismatches.length ? result("BLOCKED", mismatches.map(k => "IDENTITY_MISMATCH:" + k)) : result("DECLARED_MATCH", []);
}
