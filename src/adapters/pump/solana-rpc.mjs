export class SolanaRpcError extends Error {
  constructor(method, message, details = {}) {
    super(`Solana RPC ${method} failed: ${message}`);
    this.name = "SolanaRpcError";
    this.method = method;
    this.details = details;
  }
}

// Native Fetch bodies are bounded while streaming, including decompressed bytes.
// JSON-only injected test adapters can only be checked after their own parsing.
async function readRpcPayload(response, method, maxBytes, allowInjectedJson) {
  const tooLarge = () => new SolanaRpcError(method, "response size limit exceeded");
  const declared = response.headers?.get?.("content-length");
  if (typeof declared === "string" && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    if (response.body?.cancel) await response.body.cancel().catch(() => {});
    throw tooLarge();
  }
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const parts = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw tooLarge();
        parts.push(decoder.decode(value, { stream: true }));
      }
      parts.push(decoder.decode());
      return JSON.parse(parts.join(""));
    } catch (error) {
      await reader.cancel().catch(() => {});
      if (error instanceof SolanaRpcError || error?.name === "AbortError") throw error;
      throw new SolanaRpcError(method, "invalid or unreadable JSON response");
    } finally {
      reader.releaseLock();
    }
  }
  if (allowInjectedJson && typeof response.json === "function") {
    let payload;
    try { payload = await response.json(); } catch {
      throw new SolanaRpcError(method, "invalid JSON response");
    }
    const encoded = JSON.stringify(payload);
    if (typeof encoded !== "string") throw new SolanaRpcError(method, "invalid JSON response");
    if (new TextEncoder().encode(encoded).byteLength > maxBytes) throw tooLarge();
    return payload;
  }
  throw new SolanaRpcError(method, "response body unavailable");
}

export class SolanaRpcClient {
  constructor({
    endpoint,
    fetchImpl = globalThis.fetch,
    commitment = "confirmed",
    timeoutMs = 30_000,
    maxRetries = 2,
    headers = {},
    strictEnvelope = true,
    maxResponseBytes = 32 * 1024 * 1024,
  } = {}) {
    if (typeof endpoint !== "string" || !/^https?:\/\//.test(endpoint)) {
      throw new TypeError("an HTTP(S) Solana RPC endpoint is required");
    }
    if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new RangeError("timeoutMs must be positive");
    if (!Number.isSafeInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) throw new RangeError("maxRetries must be between 0 and 5");
    if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > 128 * 1024 * 1024) throw new RangeError("invalid maxResponseBytes");
    if (typeof strictEnvelope !== "boolean") throw new TypeError("strictEnvelope must be boolean");
    this.maxResponseBytes = maxResponseBytes;
    this.allowInjectedJson = fetchImpl !== globalThis.fetch;
    this.endpoint = endpoint;
    this.fetchImpl = fetchImpl;
    this.commitment = commitment;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.headers = headers;
    this.nextId = 1;
    this.strictEnvelope = strictEnvelope === true;
  }

  async request(method, params = []) {
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const id = this.nextId++;
        const response = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", ...this.headers },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id,
            method,
            params,
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          const error = new SolanaRpcError(method, `HTTP ${response.status}`, { status: response.status });
          if (retryable && attempt < this.maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, Math.min(250 * (2 ** attempt), 2000)));
            continue;
          }
          throw error;
        }
        const payload = await readRpcPayload(response, method, this.maxResponseBytes, this.allowInjectedJson);
        if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
            Object.hasOwn(payload,"result") === Object.hasOwn(payload,"error") ||
            (this.strictEnvelope && (payload.jsonrpc !== "2.0" || payload.id !== id))) {
          throw new SolanaRpcError(method, "invalid JSON-RPC response envelope");
        }
        if (Object.hasOwn(payload,"error")) {
          const err = payload.error;
          if (!err || typeof err !== "object" || Array.isArray(err) || !Number.isSafeInteger(err.code) || typeof err.message !== "string") {
            throw new SolanaRpcError(method, "invalid JSON-RPC error envelope");
          }
          // Do not propagate arbitrary upstream message/data into logs or reports.
          throw new SolanaRpcError(method, "JSON-RPC error", { code: err.code });
        }
        return payload.result;
      } catch (error) {
        lastError = error;
        const retryable = error?.name === "AbortError" || error instanceof TypeError;
        if (retryable && attempt < this.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(250 * (2 ** attempt), 2000)));
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError ?? new SolanaRpcError(method, "request failed");
  }

  getTransaction(signature, { commitment = this.commitment, maxSupportedTransactionVersion = 0 } = {}) {
    return this.request("getTransaction", [
      signature,
      { encoding: "json", commitment, maxSupportedTransactionVersion },
    ]);
  }

  getBlock(slot, { commitment = this.commitment, maxSupportedTransactionVersion = 0 } = {}) {
    return this.request("getBlock", [
      slot,
      {
        encoding: "json",
        transactionDetails: "full",
        rewards: false,
        commitment,
        maxSupportedTransactionVersion,
      },
    ]);
  }

  getAccountInfo(address, { commitment = this.commitment, minContextSlot } = {}) {
    const config = { encoding: "base64", commitment };
    if (Number.isSafeInteger(minContextSlot) && minContextSlot >= 0) config.minContextSlot = minContextSlot;
    return this.request("getAccountInfo", [address, config]);
  }

  getSignaturesForAddress(address, {
    commitment = this.commitment,
    limit = 1000,
    before,
    until,
  } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
      throw new RangeError("limit must be between 1 and 1000");
    }
    const config = { commitment, limit };
    if (before) config.before = before;
    if (until) config.until = until;
    return this.request("getSignaturesForAddress", [address, config]);
  }

  getGenesisHash() {
    return this.request("getGenesisHash", []);
  }

  getSlot({ commitment = this.commitment } = {}) {
    return this.request("getSlot", [{ commitment }]);
  }

  getBlockTime(slot) {
    return this.request("getBlockTime", [slot]);
  }
}

export function createRpcClientFromEnv(env = process.env) {
  const endpoint = env.SOLANA_RPC_URL;
  if (!endpoint) {
    const error = new Error("SOLANA_RPC_URL is not set; provide an RPC endpoint through the environment");
    error.code = "RPC_ENDPOINT_REQUIRED";
    throw error;
  }
  return new SolanaRpcClient({
    endpoint,
    commitment: env.SOLANA_COMMITMENT ?? "confirmed",
    timeoutMs: Number(env.SOLANA_RPC_TIMEOUT_MS ?? 30_000),
  });
}
