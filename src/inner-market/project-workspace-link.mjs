import { openHistoricalWorkspaceStore } from "./historical-workspace-store.mjs";
import { restoreHistoricalWorkspace } from "./historical-project-workspace.mjs";
import { matchProjectReport } from "./project-report-identity.mjs";
import { canonicalJson } from "../core/canonical-json.mjs";
import { createHash } from "node:crypto";
const hash=s=>createHash("sha256").update(s,"utf8").digest("hex");

/** Resolve an immutable saved report from server-side storage, never a client assertion. */
export function createProjectWorkspaceResolver({path,enabled}={}){
  return function resolve(project, selection){
    if(!enabled)throw Error("WORKSPACE_DISABLED");
    if(!selection||Object.keys(selection).some(k=>!["workspace_revision","record_key"].includes(k))||
       !Number.isSafeInteger(selection.workspace_revision)||selection.workspace_revision<1||
       typeof selection.record_key!=="string"||!selection.record_key||selection.record_key.length>16384)throw Error("INVALID_PROJECT_REPORT_SELECTION");
    const store=openHistoricalWorkspaceStore(path);
    try{
      const snapshot=store.load(selection.workspace_revision);
      const catalogue=restoreHistoricalWorkspace(snapshot.workspace);
      const {input,report}=catalogue.get(selection.record_key);
      const match=matchProjectReport(project,input);
      if(match.status!=="DECLARED_MATCH")throw Error("PROJECT_REPORT_IDENTITY_MISMATCH");
      return {schema_version:"cook-project-report-link.1",project_id:project.project_id,project_revision:project.revision,
        workspace_revision:snapshot.revision,workspace_digest:snapshot.digest,record_key:selection.record_key,
        report_digest:hash(canonicalJson(input)),scope:input.scope,report_status:report.status,status:"DECLARED_MATCH",
        source_attestation:"UNKNOWN",live_state:false,execution_enabled:false};
    }finally{store.close();}
  };
}
