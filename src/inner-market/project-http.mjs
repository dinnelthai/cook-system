import {sendJson as send} from "./local-http-common.mjs";
import {describeProjectDirectory} from "./project-governance-review.mjs";
import {describeProjectRiskReview} from "./project-risk-review.mjs";
 import {reviewProjectGraduationEvidence} from "./project-graduation-evidence.mjs";
const ROOT = "/api/projects";
// This public operator boundary is not a chain verifier or an internal auditor.
const OPERATOR_COMMANDS = new Set([
  "UPDATE_PROFILE", "UPDATE_DRAFT_CONFIGURATION", "SET_NETWORK_IDENTITY",
  "SET_TOKEN_CONFIGURATION", "UPSERT_WALLET_GROUP", "RECORD_ISSUANCE_EVIDENCE",
  "BIND_MARKET", "SET_BUDGET_LIMITS", "SET_OPERATIONAL_STATUS", "AUTHORIZE_LOCALNET_EXECUTION", "REVOKE_LOCALNET_EXECUTION"
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
  "PROJECT_ALREADY_EXISTS", "PROJECT_REVISION_CONFLICT", "PROJECT_EVIDENCE_SNAPSHOT_CONFLICT", "PROJECT_IDEMPOTENCY_KEY_CONFLICT",
  "PROJECT_NETWORK_LOCKED", "PROJECT_TOKEN_CONFIGURATION_LOCKED", "PROJECT_SYMBOL_LOCKED",
  "MARKET_ALREADY_VERIFIED", "ISSUANCE_ALREADY_VERIFIED"
]);
const NOT_FOUND = new Set(["PROJECT_NOT_FOUND", "MARKET_NOT_FOUND", "ORDER_NOT_FOUND", "PROJECT_ARCHIVE_NOT_FOUND"]);
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
  if (["WORKSPACE_DISABLED","EVIDENCE_READER_UNAVAILABLE","PROJECT_TRADE_EXECUTION_DISABLED"].includes(code)) return {status:503,code};
  if (code === "PROJECT_EXECUTION_NOT_AUTHORIZED") return {status:403,code};
  if (["PROJECT_TRADE_PREVIEW_EXPIRED","PROJECT_TRADE_PREVIEW_ALREADY_USED","PROJECT_TRADE_IDEMPOTENCY_CONFLICT","PROJECT_TRADE_PREVIEW_BINDING_CONFLICT","PROJECT_TRADE_EXECUTION_BUSY"].includes(code)) return {status:409,code};
  if (["PROJECT_ARCHIVE_SIZE_LIMIT","PROJECT_ARCHIVE_CAPACITY","PROJECT_AUDIT_BUNDLE_SIZE_LIMIT"].includes(code)) return {status:413,code};
  if (["WORKSPACE_REVISION_NOT_FOUND","CATALOGUE_RECORD_NOT_FOUND"].includes(code)) return {status:404,code};
  if (["PROJECT_ARCHIVE_INTEGRITY_FAILURE","PROJECT_SNAPSHOT_INTEGRITY_FAILURE","PROJECT_SNAPSHOT_REVISION_MISMATCH","PROJECT_SNAPSHOT_REPLAY_MISMATCH","PROJECT_EVENT_REPLAY_CREATION_INVALID","PROJECT_EVENT_REPLAY_TRANSITION_INVALID","PROJECT_EVENT_CHAIN_INCOMPLETE","PROJECT_EVENT_CHAIN_INVALID"].includes(code)) return {status:422,code};
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
export function createProjectHttpHandler({ store, readRequestJson, maxBodyBytes = 65536, networkConfig, inspectEvidence, inspectMarket, resolveReportLink, listReportCandidates, reviewOrderReceipt, importOrderReceipts, reviewProjectClose, reviewProjectTreasury, reviewProjectMarketEvidence, tradeService } = {}) {
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
      if(parts.length===4&&parts[2]==="request-recovery"&&parts[3]==="create"){
        if(req.method!=="POST"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        const input=await bodyJson(req,readRequestJson,maxBodyBytes);
        if(Object.keys(input).length!==1||!Object.hasOwn(input,"create_request_id"))throw Error("INVALID_PROJECT_CREATE_REQUEST_ID");
        send(res,200,store.lookupCreateRequest(input.create_request_id,{actor_id:"operator"}));return true;
      }
      if (parts.length === 2) {
        if (req.method === "GET") {
          const projects=store.list();
          send(res, 200, { projects, directory: describeProjectDirectory(projects) });
          return true;
        }
        if (req.method !== "POST") { send(res, 405, { code: "METHOD_NOT_ALLOWED" }); return true; }
        const input = await bodyJson(req, readRequestJson, maxBodyBytes);
        const {create_request_id,...projectInput}=input;
        const project = store.create(projectInput, { actor_id: "operator",create_request_id });
        send(res, 201, { project });
        return true;
      }
      if (parts.length < 3 || parts.length > 6) { send(res, 404, { code: "PROJECT_ROUTE_NOT_FOUND" }); return true; }
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
      if (action === "trade") {
        if (!tradeService) { send(res, 503, {code: "PROJECT_TRADE_EXECUTION_DISABLED"}); return true; }
        const operation=parts[4];
        if (parts.length === 5 && operation === "preview") {
          if (req.method !== "POST") { send(res, 405, {code: "METHOD_NOT_ALLOWED"}); return true; }
          const input = await bodyJson(req, readRequestJson, maxBodyBytes);
          const result = await tradeService.createPreview(projectId, input);
          send(res, 201, {preview: result, execution_enabled: false}); return true;
        }
        if (parts.length === 5 && operation === "execute") {
          if (req.method !== "POST") { send(res, 405, {code: "METHOD_NOT_ALLOWED"}); return true; }
          const input = await bodyJson(req, readRequestJson, maxBodyBytes);
          const result = await tradeService.execute(projectId, input);
          send(res, 200, {execution: result}); return true;
        }
        if (parts.length === 6 && operation === "executions") {
          if (req.method !== "GET") { send(res, 405, {code: "METHOD_NOT_ALLOWED"}); return true; }
          const result = tradeService.getExecution(decodeURIComponent(parts[5]));
          send(res, 200, {execution: result}); return true;
        }
        if (parts.length === 5 && operation === "reconcile") {
          if (req.method !== "POST") { send(res, 405, {code: "METHOD_NOT_ALLOWED"}); return true; }
          const input=await bodyJson(req,readRequestJson,maxBodyBytes);if(Object.keys(input).length!==1||typeof input.execution_id!=="string")throw Error("INVALID_PROJECT_TRADE_EXECUTION_ID");
          const result=await tradeService.reconcile(projectId,input.execution_id);send(res,200,{execution:result});return true;
        }
        send(res, 404, {code: "PROJECT_TRADE_ROUTE_NOT_FOUND"}); return true;
      }
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
      if(action==="runtime"){
        if(req.method==="GET"){send(res,200,store.getRuntimeContext(projectId));return true;}
        if(req.method!=="POST"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        const input=await bodyJson(req,readRequestJson,maxBodyBytes);
        if(Object.keys(input).length!==3||Object.keys(input).some(k=>!["expected_revision","expected_context_id","report_link_archive_id"].includes(k))||
          !Number.isSafeInteger(input.expected_revision)||input.expected_revision<1||
          typeof input.expected_context_id!=="string"||!/^[a-f0-9]{64}$/.test(input.expected_context_id)||
          typeof input.report_link_archive_id!=="string"||!/^[a-f0-9]{64}$/.test(input.report_link_archive_id))throw Error("INVALID_RUNTIME_SELECTION");
        send(res,200,store.getRuntimeContext(projectId,input));return true;
      }
      if(action==="business-review"){
        if(req.method!=="GET"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        send(res,200,store.getBusinessReview(projectId));return true;
      }
      if(action==="risk-review"){
        if(req.method!=="GET"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        send(res,200,store.getRiskReview(projectId));return true;
      }
      if(action==="market-evidence-review"){
        if(req.method!=="POST"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        if(typeof reviewProjectMarketEvidence!=="function"){send(res,503,{code:"WORKSPACE_DISABLED"});return true;}
        const input=await bodyJson(req,readRequestJson,maxBodyBytes);
        if(Object.keys(input).some(k=>!["archive_id","expected_revision"].includes(k))||typeof input.archive_id!=="string"||!Number.isSafeInteger(input.expected_revision))throw Error("INVALID_MARKET_EVIDENCE_REVIEW_REQUEST");
        const project=store.get(projectId);
        if(project.revision!==input.expected_revision)throw Error("PROJECT_REVISION_CONFLICT");
        const link=store.listArchive(projectId).find(a=>a.archive_id===input.archive_id);
        if(!link)throw Error("PROJECT_ARCHIVE_NOT_FOUND");
        const review=reviewProjectMarketEvidence(project,link);
        const archive=store.recordArchive(projectId,"MARKET_EVIDENCE_REVIEW",review,project.revision);
        send(res,200,{review,archive});return true;
      }
      if(action==="treasury-review"){
        if(req.method!=="POST"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        if(typeof reviewProjectTreasury!=="function"){send(res,503,{code:"WORKSPACE_DISABLED"});return true;}
        const input=await bodyJson(req,readRequestJson,maxBodyBytes);
        if(Object.keys(input).some(k=>!["archive_id","expected_revision"].includes(k))||typeof input.archive_id!=="string"||!Number.isSafeInteger(input.expected_revision))throw Error("INVALID_TREASURY_REVIEW_REQUEST");
        const project=store.get(projectId);
        if(project.revision!==input.expected_revision)throw Error("PROJECT_REVISION_CONFLICT");
        const link=store.listArchive(projectId).find(a=>a.archive_id===input.archive_id);
        if(!link)throw Error("PROJECT_ARCHIVE_NOT_FOUND");
        const review=reviewProjectTreasury(project,link);
        const archive=store.recordArchive(projectId,"TREASURY_REVIEW",review,project.revision);
        send(res,200,{review,archive});return true;
      }
      if(action==="audit-bundle"){
        if(req.method!=="POST"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        const input=await bodyJson(req,readRequestJson,maxBodyBytes);
        if(Object.keys(input).some(k=>!["expected_revision","expected_context_id"].includes(k))||!Number.isSafeInteger(input.expected_revision)||input.expected_revision<1||
          (Object.hasOwn(input,"expected_context_id")&&(typeof input.expected_context_id!=="string"||!/^[a-f0-9]{64}$/.test(input.expected_context_id))))throw Error("INVALID_PROJECT_AUDIT_REQUEST");
        send(res,200,{bundle:store.exportAuditBundle(projectId,input.expected_revision,input.expected_context_id??null)});return true;
      }
      if(action==="close-evidence-review"){
        if(req.method!=="POST"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        if(typeof reviewProjectClose!=="function"){send(res,503,{code:"WORKSPACE_DISABLED"});return true;}
        const input=await bodyJson(req,readRequestJson,maxBodyBytes);
        if(Object.keys(input).some(k=>!["archive_id","expected_revision"].includes(k))||typeof input.archive_id!=="string"||!Number.isSafeInteger(input.expected_revision))throw Error("INVALID_CLOSE_REVIEW_REQUEST");
        const snapshot=store.getEvidenceSnapshot(projectId),{project,archives,orders,evidence_snapshot_digest}=snapshot;
        if(project.revision!==input.expected_revision)throw Error("PROJECT_REVISION_CONFLICT");
        const link=archives.find(a=>a.archive_id===input.archive_id);
        if(!link)throw Error("PROJECT_ARCHIVE_NOT_FOUND");
        const review={...reviewProjectClose(project,link,orders,archives),evidence_snapshot_digest};
        const archive=store.recordArchive(projectId,"PROJECT_CLOSE_REVIEW",review,project.revision,evidence_snapshot_digest);
        send(res,200,{review,archive});return true;
      }
      if(action==="graduation-history-review"){
        if(req.method!=="POST"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        const input=await bodyJson(req,readRequestJson,Math.min(maxBodyBytes*16,1024*1024));
        if(Object.keys(input).some(k=>!["expected_revision","history"].includes(k))||!Number.isSafeInteger(input.expected_revision))throw Error("INVALID_GRADUATION_REVIEW_REQUEST");
        const project=store.get(projectId);
        if(project.revision!==input.expected_revision)throw Error("PROJECT_REVISION_CONFLICT");
        const review=reviewProjectGraduationEvidence(project,input.history);
        const archive=store.recordArchive(projectId,"GRADUATION_HISTORY_REVIEW",review,project.revision);
        send(res,200,{review,archive});return true;
      }
      if(action==="lifecycle-evidence"){
        if(req.method!=="GET"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        send(res,200,store.getLifecycleReview(projectId));return true;
      }
      if(action==="order-import"){
        if(req.method!=="POST"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        if(typeof importOrderReceipts!=="function"){send(res,503,{code:"WORKSPACE_DISABLED"});return true;}
        const input=await bodyJson(req,readRequestJson,maxBodyBytes);
        if(Object.keys(input).some(k=>!["archive_id","expected_revision"].includes(k))||typeof input.archive_id!=="string"||!Number.isSafeInteger(input.expected_revision))throw Error("INVALID_ORDER_IMPORT");
        const project=store.get(projectId);
        if(project.revision!==input.expected_revision)throw Error("PROJECT_REVISION_CONFLICT");
        const link=store.listArchive(projectId).find(a=>a.archive_id===input.archive_id);
        if(!link)throw Error("PROJECT_ARCHIVE_NOT_FOUND");
        const derived=importOrderReceipts(project,link);
        const result=store.orderReview.importReceipts(projectId,project.revision,link.archive_id,derived.samples);
        send(res,200,{...result,excluded_receipt_count:derived.excluded_receipt_count,project_id:projectId,project_revision:project.revision});return true;
      }
      if(action==="order-receipt-review"){
        if(req.method!=="POST"){send(res,405,{code:"METHOD_NOT_ALLOWED"});return true;}
        if(typeof reviewOrderReceipt!=="function"){send(res,503,{code:"EVIDENCE_READER_UNAVAILABLE"});return true;}
        const input=await bodyJson(req,readRequestJson,maxBodyBytes);
        if(Object.keys(input).some(k=>!["order_id","archive_id","expected_revision","expected_order_revision"].includes(k))||
           typeof input.order_id!=="string"||typeof input.archive_id!=="string"||!Number.isSafeInteger(input.expected_revision)||!Number.isSafeInteger(input.expected_order_revision))throw Error("INVALID_ORDER_RECEIPT_REQUEST");
        const snapshot=store.getEvidenceSnapshot(projectId),{project,archives,orders,receipt_snapshot_digest:evidence_snapshot_digest}=snapshot;
        const order=orders.find(o=>o.order_id===input.order_id);
        if(!order)throw Error("ORDER_NOT_FOUND");
        if(project.revision!==input.expected_revision||order.revision!==input.expected_order_revision)throw Error("PROJECT_REVISION_CONFLICT");
        const link=archives.find(a=>a.archive_id===input.archive_id);
        if(!link)throw Error("PROJECT_ARCHIVE_NOT_FOUND");
        const review={...await reviewOrderReceipt(project,order,link),evidence_snapshot_digest};
        const record=store.recordArchive(projectId,"ORDER_RECEIPT_REVIEW",{...review,order_head_hash:order.head_hash},project.revision,evidence_snapshot_digest);
        send(res,200,{review,review_archive_id:record.archive_id});return true;
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
        if(!Number.isSafeInteger(selection.expected_revision)||selection.expected_revision<1)throw Error("EXPECTED_PROJECT_REVISION_REQUIRED");
         if(selection.expected_revision!==project.revision)throw Error("PROJECT_REVISION_CONFLICT");
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
        if(input.type==="AUTHORIZE_LOCALNET_EXECUTION"&&(!tradeService||tradeService.executionAvailable!==true))throw Error("PROJECT_TRADE_EXECUTION_DISABLED");
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
