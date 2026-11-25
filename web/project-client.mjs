async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method, cache: "no-store",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let result;
  try { result = await response.json(); } catch { throw Error("PROJECT_API_INVALID_RESPONSE"); }
  if (!response.ok) throw Error(result?.code || "PROJECT_API_REQUEST_FAILED");
  return result;
}
export async function listProjects() {
  const result = await request("/api/projects");
  if (!Array.isArray(result.projects)) throw Error("PROJECT_API_INVALID_RESPONSE");
  return result.projects;
}
export async function getProject(projectId) {
  const result = await request("/api/projects/" + encodeURIComponent(projectId));
  if (!result.project || result.project.project_id !== projectId) throw Error("PROJECT_API_INVALID_RESPONSE");
  return result.project;
}
export async function createProject(input) {
  const result = await request("/api/projects", { method: "POST", body: input });
  if (!result.project?.project_id) throw Error("PROJECT_API_INVALID_RESPONSE");
  return result.project;
}
export async function appendProjectCommand(projectId, command, expectedRevision) {
  const result = await request("/api/projects/" + encodeURIComponent(projectId) + "/commands", {
    method: "POST",
    body: {
      command_id: command.command_id, type: command.type,
      payload: command.payload, expected_revision: expectedRevision
    }
  });
  if (!result.aggregate || !["APPLIED", "ALREADY_APPLIED"].includes(result.status)) throw Error("PROJECT_API_INVALID_RESPONSE");
  return result;
}
export async function getProjectConfig() {
  const result = await request("/api/projects/config");
  if (!result.network || result.execution_enabled !== false) throw Error("PROJECT_API_INVALID_RESPONSE");
  return result;
}

export async function inspectProjectEvidence(projectId) {
  const result = await request("/api/projects/" + encodeURIComponent(projectId) + "/evidence-observation",{method:"POST",body:{}});
  if (result.observation?.project_id !== projectId || result.observation.execution_enabled !== false || result.observation.lifecycle_mutated !== false) throw Error("PROJECT_API_INVALID_RESPONSE");
  return {...result.observation,archive_id:result.archive?.archive_id??null};
}
export async function listProjectArchive(projectId){
  const result=await request("/api/projects/"+encodeURIComponent(projectId)+"/archive");
  if(!Array.isArray(result.records)||result.execution_enabled!==false)throw Error("PROJECT_API_INVALID_RESPONSE");
  return result.records;
}
export async function linkProjectReport(projectId,workspaceRevision,recordKey,expectedRevision){
  return request("/api/projects/"+encodeURIComponent(projectId)+"/report-links",{method:"POST",body:{workspace_revision:workspaceRevision,record_key:recordKey,expected_revision:expectedRevision}});
}

export async function inspectProjectMarket(projectId,marketId,expectedRevision){
 return request("/api/projects/"+encodeURIComponent(projectId)+"/market-observation",{method:"POST",body:{market_id:marketId,expected_revision:expectedRevision}});
}
export async function listProjectReportCandidates(projectId){
 return request("/api/projects/"+encodeURIComponent(projectId)+"/report-candidates");
}
