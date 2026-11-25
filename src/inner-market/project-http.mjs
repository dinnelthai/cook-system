const ROOT = "/api/projects";
const CONFLICTS = new Set([
  "PROJECT_ALREADY_EXISTS", "PROJECT_REVISION_CONFLICT", "PROJECT_IDEMPOTENCY_KEY_CONFLICT",
  "PROJECT_NETWORK_LOCKED", "PROJECT_TOKEN_CONFIGURATION_LOCKED", "PROJECT_SYMBOL_LOCKED",
  "MARKET_ALREADY_VERIFIED", "ISSUANCE_ALREADY_VERIFIED"
]);
const NOT_FOUND = new Set(["PROJECT_NOT_FOUND", "MARKET_NOT_FOUND"]);
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
  if (code === "BODY_TOO_LARGE") return { status: 413, code };
  if (code === "INVALID_BODY_ENCODING" || code === "INVALID_JSON" || code === "INVALID_JSON_OBJECT" ||
      code === "INVALID_REQUEST_BODY" || code === "JSON_CONTENT_TYPE_REQUIRED") {
    return { status: code === "JSON_CONTENT_TYPE_REQUIRED" ? 415 : 400, code };
  }
  if (CONFLICTS.has(code)) return { status: 409, code };
  if (NOT_FOUND.has(code)) return { status: 404, code };
  if (/^[A-Z][A-Z0-9_]{2,100}$/.test(code)) return { status: 400, code };
  return { status: 503, code: "PROJECT_STORE_UNAVAILABLE" };
}

/** Loopback HTTP adapter for Project CRUD, versioned commands and audit reads.
 * Host/origin enforcement is performed by the parent local-only server. */
export function createProjectHttpHandler({ store, readRequestJson, maxBodyBytes = 65536, networkConfig } = {}) {
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
