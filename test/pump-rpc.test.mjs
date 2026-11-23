import test from "node:test";
import assert from "node:assert/strict";
import {
  SolanaRpcClient,
  SolanaRpcError,
} from "../src/adapters/pump/solana-rpc.mjs";
import {
  decodeMintAccount,
  SPL_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "../src/adapters/pump/pump-account-codec.mjs";
import { derivePumpBondingCurveAddress } from "../src/adapters/pump/pump-history-collector.mjs";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
  };
}

test("Solana RPC client sends JSON-RPC and returns the result", async () => {
  let request;
  const rpc = new SolanaRpcClient({
    endpoint: "https://rpc.example.invalid",
    fetchImpl: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return jsonResponse({ jsonrpc: "2.0", id: request.body.id, result: { slot: 123 } });
    },
    maxRetries: 0,
  });
  const result = await rpc.getSlot();
  assert.equal(result, 123);
  assert.equal(request.body.method, "getSlot");
  assert.deepEqual(request.body.params, [{ commitment: "confirmed" }]);
  assert.equal(request.init.method, "POST");
});

test("Solana RPC client retries rate limits but propagates JSON-RPC errors", async () => {
  let calls = 0;
  const rpc = new SolanaRpcClient({
    endpoint: "https://rpc.example.invalid",
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse({ error: { code: -32005, message: "rate limited" } }, 429)
        : jsonResponse({ result: "ok" });
    },
    maxRetries: 1,
  });
  assert.equal(await rpc.request("getHealth"), "ok");
  assert.equal(calls, 2);

  const failing = new SolanaRpcClient({
    endpoint: "https://rpc.example.invalid",
    fetchImpl: async () => jsonResponse({ error: { code: -32602, message: "invalid params" } }),
    maxRetries: 0,
  });
  await assert.rejects(() => failing.request("getAccountInfo"), SolanaRpcError);
});

test("mint decoder reads SPL Token and Token-2022 base mint decimals", () => {
  const bytes = Buffer.alloc(82);
  bytes.writeBigUInt64LE(1_000_000_000n, 36);
  bytes.writeUInt8(6, 44);
  bytes.writeUInt8(1, 45);
  const account = (owner) => ({
    context: { slot: 99 },
    value: { owner, data: [bytes.toString("base64"), "base64"] },
  });
  assert.equal(decodeMintAccount(account(SPL_TOKEN_PROGRAM_ID)).decimals, 6);
  assert.equal(decodeMintAccount(account(TOKEN_2022_PROGRAM_ID)).is_token_2022, true);
  assert.throws(() => decodeMintAccount(account("11111111111111111111111111111111")), /unsupported mint owner/);
});

test("bonding curve PDA derivation is deterministic and returns a valid Solana key", () => {
  const mint = "So11111111111111111111111111111111111111112";
  const a = derivePumpBondingCurveAddress(mint);
  const b = derivePumpBondingCurveAddress(mint);
  assert.equal(a, b);
  assert.equal(a.length, 44);
});
