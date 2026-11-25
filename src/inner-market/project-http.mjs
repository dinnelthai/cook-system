const ROOT = "/api/projects";
// This public operator boundary is not a chain verifier or an internal auditor.
const OPERATOR_COMMANDS = new Set([
  "UPDATE_PROFILE", "UPDATE_DRAFT_CONFIGURATION", "SET_NETWORK_IDENTITY",
  "SET_TOKEN_CONFIGURATION", "UPSERT_WALLET_GROUP", "RECORD_ISSUANCE_EVIDENCE",
  "BIND_MARKET", "SET_BUDGET_LIMITS", "SET_OPERATIONAL_STATUS"
]);
const OPERATOR_TRANSITIONS = new Set(["READY", "LAUNCH_SUBMITTED", "EXIT_IN_PROGRESS"]);
function assertOperatorCommand(type, payload) {
  if (type === "TRANSITION_LIFECYCLE") {
    if (!OPERATOR_TRANSITIONS.has(payload.to)) throw Error("TRUSTED_VERIFIER_REQUIRED");
    if (payload.settlement != null || payload.evidence?.verification === "VERIFIED") throw Error("TRUSTED_VERIFIER_REQUIRED");
    if (payload.to === "READY" && payload.evidence != null) throw Error("TRUSTED_VERIFIER_REQUIRED");
    return;
  }
  if (!OPERATOR_COMMANDS.has(type)) throw Error("TRUSTED_VERIFIER_REQUIRED");
}
const CONFLICTS = new Set([
  "PROJECT_ALREADY_EXISTS", "PROJECT_REVISION_CONFLICT", "PROJECT_IDEMPOTENCY_KEY_CONFLICT",
  "PROJECT_NETWORK_LOCKED", "PROJECT_TOKEN_CONFIGURATION_LOCKED", "PROJECT_SYMBOL_LOCKED",
  "MARKET_ALREADY_VERIFIED", "ISSUANCE_ALREADY_VERIFIED"
]);
const NOT_FOUND = new Set(["PROJECT_NOT_FOUND", "MARKET_NOT_FOUND", "ORDER_NOT_FOUND", "PROJECT_ARCHIVE_NOT_FOUND"]);
function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(body));
}
async function bodyJson(req, readRequestJson, maxBytes) {
  if ((req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase() !== "application/json") {
    throw Object.assign(Error("JSON_CONTENT_TYPE_REQUIRED"), { httpStatus: 415 });
  }
  let raw;
  try { raw = await readRequestJson(req, maxBytes); }
  catch (error) {
    if (error.message === "BODY_TOO_LARGE" || error.message === "INVALID_BODY_ENCODING") throw error;
    throw Error("INVALID_REQUEST_BODY");
  }
  let value;
  try { value = JSON.parse(raw); } catch { throw Error("INVALID_JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("INVALID_JSON_OBJECT");
  return value;
}
function errorResponse(error) {
  const code = typeof error?.message === "string" ? error.message : "";
  if (error?.httpStatus) return { status: error.httpStatus, code };
  if (["WORKSPACE_DISABLED","EVIDENCE_READER_UNAVAILABLE"].includes(code)) return {status:503,code};
  if (["PROJECT_ARCHIVE_SIZE_LIMIT","PROJECT_ARCHIVE_CAPACITY"].includes(code)) return {status:413,code};
  if (["WORKSPACE_REVISION_NOT_FOUND","CATALOGUE_RECORD_NOT_FOUND"].includes(code)) return {status:404,code};
  if (code === "PROJECT_ARCHIVE_INTEGRITY_FAILURE") return {status:422,code};
  if (code === "BODY_TOO_LARGE") return { status: 413, code };
  if (code === "INVALID_BODY_ENCODING" || code === "INVALID_JSON" || code === "INVALID_JSON_OBJECT" ||
      code === "INVALID_REQUEST_BODY" || code === "JSON_CONTENT_TYPE_REQUIRED") {
    return { status: code === "JSON_CONTENT_TYPE_REQUIRED" ? 415 : 400, code };
  }
  if (code === "TRUSTED_VERIFIER_REQUIRED") return { status: 403, code };
  if (CONFLICTS.has(code)) return { status: 409, code };
  if (NOT_FOUND.has(code)) return { status: 404, code };
  if (/^[A-Z][A-Z0-9_]{2,100}$/.test(code)) return { status: 400, code };
  return { status: 503, code: "PROJECT_STORE_UNAVAILABLE" };
}

/** Loopback HTTP adapter for Project CRUD, versioned commands and audit reads.
 * Host/origin enforcement is performed by the parent local-only server. */
export function createProjectHttpHandler({ store, readRequestJson, maxBodyBytes = 65536, networkConfig, inspectEvidence, inspectMarket, resolveReportLink, listReportCandidates, reviewOrderReceipt } = {}) {
  if (!store || typeof readRequestJson !== "function" || !Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1024) {
    throw Error("INVALID_PROJECT_HTTP_CONFIGURATION");
  }
  return async function handleProjectRequest(req, res) {
    let url;
    try { url = new URL(req.url, "http://127.0.0.1"); }
    catch { send(res, 400, { code: "INVALID_REQUEST_URL" }); return true; }
    if (url.pathname !== ROOT && !url.pathname.startsWith(ROOT + "/")) return false;
    if (url.search || url.hash) { send(res, 400, { code: "QUERY_NOT_SUPPORTED" }); return true; }
    const parts = url.pathname.split("/").filter(Boolean);
    try {
      if (parts.length === 3 && parts[2] === "config") {
        if (req.method !== "GET") { send(res, 405, { code: "METHOD_NOT_ALLOWED" }); return true; }
        send(res, 200, { network: networkConfig ?? { chain_id: "solana", cluster: "localnet", genesis_hash: null, quote_mint: "So11111111111111111111111111111111111111112" }, execution_enabled: false });
        return true;
      }
      if (parts.length === 2) {
        if (req.method === "GET") {
          send(res, 200, { projects: store.list() });
          return true;
        }
        if (req.method !== "POST") { send(res, 405, { code: "METHOD_NOT_ALLOWED" }); return true; }
        const input = await bodyJson(req, readRequestJson, maxBodyBytes);
        const project = store.create(input, { actor_id: "operator" });
        send(res, 201, { project });
        return true;
      }
      if (parts.length < 3 || parts.length > 4) { send(res, 404, { code: "PROJECT_ROUTE_NOT_FOUND" }); return true; }
      let projectId;
      try { projectId = decodeURIComponent(parts[2]); } catch { send(res, 400, { code: "INVALID_PROJECT_ID" }); return true; }
      if (!projectId || projectId.length > 128 || projectId.includes("/") || projectId.includes("\0")) {
        send(res, 400, { code: "INVALID_PROJECT_ID" });
        return true;
      }
      if (parts.length === 3) {
        if (req.method !== "GET") { send(res, 405, { code: "METHOD_NOT_ALLOWED" }); return true; }
        send(res, 200, { project: store.get(projectId) });
        return true;
      }
      const action = parts[3];
      if (action === "events" || action === "verify") {
        if (req.method !== "GET") { send(res, 405, { code: "METHOD_NOT_ALLOWED" }); return true; }
        send(res, 200, action === "events" ? { events: store.events(projectId) } : store.verify(projectId));
        return true;
      }
      if (action === "evidence-observation") {
        if (!["GET","POST"].includes(req.method)) { send(res, 405, { code: "METHOD_NOT_ALLOWED" }); return true; }
        if(req.method==="POST"){
          const body=await bodyJson(req,readRequestJson,maxBodyBytes);
          if(Object.keys(body).length)throw Error("INVALID_PROJECT_OBSERVATION_REQUEST");
        }
        if (typeof inspectEvidence !== "function") { send(res, 503, { code: "EVIDENCE_READER_UNAVAILABLE" }); return true; }
        const project = store.get(projectId);
        const observation = await inspectEvidence(project);
        if (store.get(projectId).revision !== project.revision) { send(res, 409, { code: "PROJECT_REVISION_CONFLICT" }); return true; }
        const archive=req.method==="POST"?store.recordArchive(projectId,"ISSUANCE_OBSERVATION",observation,project.revision):null;
        send(res, 200, { observation, archive }); return true;
      }
      if(action==="market-observation"){
        if(req.method!=="POST"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        if(typeof inspectMarket!=="function"){send(res,503,{code:"EVIDENCE_READER_UNAVAILABLE"});return true;}
        const body=await bodyJson(req,readRequestJson,maxBodyBytes);
        if(Object.keys(body).some(k=>!["market_id","expected_revision"].includes(k))||typeof body.market_id!=="string"||!Number.isSafeInteger(body.expected_revision))throw Error("INVALID_MARKET_OBSERVATION_REQUEST");
        const project=store.get(projectId);
        if(project.revision!==body.expected_revision)throw Error("PROJECT_REVISION_CONFLICT");
        const observation=await inspectMarket(project,body.market_id);
        const archive=store.recordArchive(projectId,"MARKET_OBSERVATION",observation,project.revision);
        send(res,200,{observation,archive});return true;
      }
      if(action==="report-candidates"){
        if(req.method!=="GET"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        if(typeof listReportCandidates!=="function"){send(res,503,{code:"WORKSPACE_DISABLED"});return true;}
        send(res,200,listReportCandidates(store.get(projectId)));return true;
      }
      if(action==="order-receipt-review"){
        if(req.method!=="POST"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        if(typeof reviewOrderReceipt!=="function"){send(res,503,{code:"EVIDENCE_READER_UNAVAILABLE"});return true;}
        const input=await bodyJson(req,readRequestJson,maxBodyBytes);
        if(Object.keys(input).some(k=>!["order_id","archive_id","expected_revision","expected_order_revision"].includes(k))||
           typeof input.order_id!=="string"||typeof input.archive_id!=="string"||!Number.isSafeInteger(input.expected_revision)||!Number.isSafeInteger(input.expected_order_revision))throw Error("INVALID_ORDER_RECEIPT_REQUEST");
        const project=store.get(projectId);
        const order=store.orderReview.list(projectId).find(o=>o.order_id===input.order_id);
        if(!order)throw Error("ORDER_NOT_FOUND");
        if(project.revision!==input.expected_revision||order.revision!==input.expected_order_revision)throw Error("PROJECT_REVISION_CONFLICT");
        const link=store.listArchive(projectId).find(a=>a.archive_id===input.archive_id);
        if(!link)throw Error("PROJECT_ARCHIVE_NOT_FOUND");
        const review=await reviewOrderReceipt(project,order,link);
        const latest=store.orderReview.list(projectId).find(o=>o.order_id===input.order_id);
        if(store.get(projectId).revision!==project.revision||latest?.revision!==order.revision)throw Error("PROJECT_REVISION_CONFLICT");
        send(res,200,{review});return true;
      }
      if(action==="order-review"){
        if(req.method!=="GET"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        const project=store.get(projectId);
        const orders=store.orderReview.list(projectId);
        if(store.get(projectId).revision!==project.revision)throw Error("PROJECT_REVISION_CONFLICT");
        send(res,200,{project_id:projectId,project_revision:project.revision,orders,source_attestation:"UNKNOWN",settlement_allowed:false,execution_enabled:false});return true;
      }
      if(action==="order-review-events"){
        if(req.method!=="POST"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        const input=await bodyJson(req,readRequestJson,maxBodyBytes);
        if(Object.keys(input).some(k=>!["order_id","expected_revision","expected_order_revision"].includes(k))||typeof input.order_id!=="string"||
          !Number.isSafeInteger(input.expected_revision)||!Number.isSafeInteger(input.expected_order_revision))throw Error("INVALID_ORDER_REVIEW_REQUEST");
        const project=store.get(projectId),order=store.orderReview.list(projectId).find(o=>o.order_id===input.order_id);
        if(!order)throw Error("ORDER_NOT_FOUND");
        if(project.revision!==input.expected_revision||order.revision!==input.expected_order_revision)throw Error("PROJECT_REVISION_CONFLICT");
        const events=store.orderReview.events(projectId,order.order_id);
        const latest=store.orderReview.list(projectId).find(o=>o.order_id===order.order_id);
        if(store.get(projectId).revision!==project.revision||latest?.revision!==order.revision)throw Error("PROJECT_REVISION_CONFLICT");
        send(res,200,{project_id:projectId,project_revision:project.revision,order_id:order.order_id,order_revision:order.revision,events,source_attestation:"UNKNOWN",execution_enabled:false});return true;
      }
      if(action==="archive"){
        if(req.method!=="GET"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        send(res,200,{records:store.listArchive(projectId),execution_enabled:false});return true;
      }
      if(action==="report-links"){
        if(req.method!=="POST"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        if(typeof resolveReportLink!=="function"){send(res,503,{code:"WORKSPACE_DISABLED"});return true;}
        const selection=await bodyJson(req,readRequestJson,maxBodyBytes);
        const project=store.get(projectId);
        if(selection.expected_revision!==undefined&&selection.expected_revision!==project.revision)throw Error("PROJECT_REVISION_CONFLICT");
        const {expected_revision,...reference}=selection;
        const link=resolveReportLink(project,reference);
        const archive=store.recordArchive(projectId,"HISTORICAL_REPORT_LINK",link,project.revision);
        send(res,200,{link,archive});return true;
      }
      if (action === "commands") {
        if (req.method !== "POST") { send(res, 405, { code: "METHOD_NOT_ALLOWED" }); return true; }
        const input = await bodyJson(req, readRequestJson, maxBodyBytes);
        const allowed = ["command_id", "type", "payload", "expected_revision"];
        if (Object.keys(input).some(key => !allowed.includes(key)) ||
            typeof input.command_id !== "string" || typeof input.type !== "string" ||
            !input.payload || typeof input.payload !== "object" || Array.isArray(input.payload) ||
            !Number.isSafeInteger(input.expected_revision) || input.expected_revision < 1) {
          throw Error("INVALID_PROJECT_COMMAND");
        }
        assertOperatorCommand(input.type, input.payload);
        const result = store.append(projectId, {
          command_id: input.command_id, type: input.type, payload: input.payload
        }, { expected_revision: input.expected_revision, actor_id: "operator" });
        send(res, 200, result);
        return true;
      }
      send(res, 404, { code: "PROJECT_ROUTE_NOT_FOUND" });
      return true;
    } catch (error) {
      const result = errorResponse(error);
      send(res, result.status, { code: result.code });
      return true;
    }
  };
}
