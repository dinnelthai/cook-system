export class SolanaRpcError extends Error {
  constructor(method, message, details = {}) {
    super(`Solana RPC ${method} failed: ${message}`);
    this.name = "SolanaRpcError";
    this.method = method;
    this.details = details;
  }
}

export class SolanaRpcClient {
  constructor({
    endpoint,
    fetchImpl = globalThis.fetch,
    commitment = "confirmed",
    timeoutMs = 30_000,
    maxRetries = 2,
    headers = {},
    strictEnvelope = false,
  } = {}) {
    if (typeof endpoint !== "string" || !/^https?:\/\//.test(endpoint)) {
      throw new TypeError("an HTTP(S) Solana RPC endpoint is required");
    }
    if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new RangeError("timeoutMs must be positive");
    if (!Number.isSafeInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) throw new RangeError("maxRetries must be between 0 and 5");
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
        const payload = await response.json();
        if (this.strictEnvelope && (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.jsonrpc !== "2.0" || payload.id !== id || Object.hasOwn(payload,"result") === Object.hasOwn(payload,"error"))) {
          throw new SolanaRpcError(method, "invalid JSON-RPC response envelope");
        }
        if (payload.error) {
          throw new SolanaRpcError(method, payload.error.message ?? "unknown JSON-RPC error", payload.error);
        }
        if (!Object.hasOwn(payload, "result")) {
          throw new SolanaRpcError(method, "response is missing result", { payload });
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
