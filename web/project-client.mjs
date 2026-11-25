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

export async function listProjectOrders(projectId,revision){
 const r=await request("/api/projects/"+encodeURIComponent(projectId)+"/order-review");
 if(r.project_id!==projectId||r.project_revision!==revision||!Array.isArray(r.orders)||r.execution_enabled!==false||r.settlement_allowed!==false||r.orders.some(o=>o.project_id!==projectId||o.execution_enabled!==false||o.settlement_allowed!==false))throw Error("PROJECT_ORDER_SCOPE_MISMATCH");
 return r.orders;
}
export async function getOrderReviewEvents(projectId,revision,order){
 const r=await request("/api/projects/"+encodeURIComponent(projectId)+"/order-review-events",{method:"POST",body:{order_id:order.order_id,expected_revision:revision,expected_order_revision:order.revision}});
 if(r.project_id!==projectId||r.project_revision!==revision||r.order_id!==order.order_id||r.order_revision!==order.revision||!Array.isArray(r.events)||r.execution_enabled!==false)throw Error("PROJECT_ORDER_SCOPE_MISMATCH");
 return r.events;
}
export async function getOrderReceiptReview(projectId,revision,order,archiveId){
 const r=await request("/api/projects/"+encodeURIComponent(projectId)+"/order-receipt-review",{method:"POST",body:{order_id:order.order_id,archive_id:archiveId,expected_revision:revision,expected_order_revision:order.revision}});
 const v=r.review;
 if(v?.project_id!==projectId||v.project_revision!==revision||v.order_id!==order.order_id||v.order_revision!==order.revision||v.signature!==order.signature||v.archive_id!==archiveId||v.execution_enabled!==false||v.settlement_allowed!==false)throw Error("PROJECT_ORDER_SCOPE_MISMATCH");
 return {...v,review_archive_id:r.review_archive_id??null};
}

export async function importProjectOrderReceipts(projectId,revision,archiveId){
 const r=await request("/api/projects/"+encodeURIComponent(projectId)+"/order-import",{method:"POST",body:{archive_id:archiveId,expected_revision:revision}});
 if(r.project_id!==projectId||r.project_revision!==revision||r.execution_enabled!==false||r.settlement_allowed!==false)throw Error("PROJECT_ORDER_SCOPE_MISMATCH");
 return r;
}

export async function getProjectLifecycleEvidence(projectId,revision){
 const r=await request("/api/projects/"+encodeURIComponent(projectId)+"/lifecycle-evidence");
 if(r.project_id!==projectId||r.project_revision!==revision||r.execution_enabled!==false||r.lifecycle_mutated!==false||r.settlement_allowed!==false||!Array.isArray(r.steps)||!Array.isArray(r.blockers))throw Error("PROJECT_LIFECYCLE_SCOPE_MISMATCH");
 return r;
}

export async function reviewProjectGraduationHistory(projectId,revision,history){
 const r=await request("/api/projects/"+encodeURIComponent(projectId)+"/graduation-history-review",{method:"POST",body:{expected_revision:revision,history}});
 if(r.review?.project_id!==projectId||r.review.project_revision!==revision||r.review.execution_enabled!==false||r.review.lifecycle_mutated!==false||r.review.settlement_allowed!==false)throw Error("PROJECT_GRADUATION_SCOPE_MISMATCH");
 return r;
}

export async function reviewProjectCloseEvidence(projectId,revision,archiveId){
 const r=await request("/api/projects/"+encodeURIComponent(projectId)+"/close-evidence-review",{method:"POST",body:{expected_revision:revision,archive_id:archiveId}});
 if(r.review?.project_id!==projectId||r.review.project_revision!==revision||r.review.execution_enabled!==false||r.review.settlement_allowed!==false||r.review.lifecycle_mutated!==false)throw Error("PROJECT_CLOSE_SCOPE_MISMATCH");
 return r;
}
