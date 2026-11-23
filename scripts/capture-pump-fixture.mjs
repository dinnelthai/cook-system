import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRpcClientFromEnv } from "../src/adapters/pump/solana-rpc.mjs";
import { decodePumpTransaction, findTransactionIndexInBlock } from "../src/adapters/pump/pump-transaction-parser.mjs";
import { decodeMintAccount } from "../src/adapters/pump/pump-account-codec.mjs";

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[index + 1];
    if (value && !value.startsWith("--")) {
      result[key] = value;
      index += 1;
    } else result[key] = true;
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
if (!args.signature) {
  console.error("Usage: npm run capture:pump-fixture -- --signature <CONFIRMED_SIGNATURE> [--mint <TOKEN_MINT>] [--out fixtures/real]");
  process.exitCode = 2;
} else {
  try {
    const rpc = createRpcClientFromEnv();
    const transaction = await rpc.getTransaction(args.signature, { commitment: "confirmed" });
    if (!transaction) throw new Error("transaction is unavailable from this RPC provider");
    if (transaction.meta?.err !== null && transaction.meta?.err !== undefined) {
      throw new Error("refusing to capture a failed transaction as an execution fixture");
    }
    const block = await rpc.getBlock(transaction.slot);
    const transactionIndex = findTransactionIndexInBlock(block, args.signature);
    const mintDecimalsByMint = {};
    if (args.mint) {
      const mintAccount = await rpc.getAccountInfo(args.mint);
      mintDecimalsByMint[args.mint] = decodeMintAccount(mintAccount).decimals;
    }
    const parsed = decodePumpTransaction({
      transaction,
      signature: args.signature,
      transactionIndex,
      network: process.env.SOLANA_NETWORK ?? "mainnet",
      tokenDecimalsByMint: mintDecimalsByMint,
      sourceType: "rpc",
    });
    const fixture = {
      fixture_version: "1.0.0",
      fixture_kind: "observed_chain_transaction",
      source: {
        provider: "user_configured_solana_rpc",
        commitment: "confirmed",
        signature: args.signature,
        slot: transaction.slot,
        block_time: transaction.blockTime ?? null,
        transaction_index: transactionIndex,
      },
      transaction,
      parsed,
    };
    const outputDirectory = resolve(args.out ?? "fixtures/real");
    await mkdir(outputDirectory, { recursive: true });
    const outputPath = resolve(outputDirectory, `pump-${args.signature}.json`);
    await writeFile(outputPath, `${JSON.stringify(fixture, (_, value) => typeof value === "bigint" ? value.toString() : value, 2)}\n`, "utf8");
    console.log(JSON.stringify({
      saved: outputPath,
      parser_status: parsed.status,
      decoded_events: parsed.decoded_events.length,
      normalized_events: parsed.events.length,
      unresolved_events: parsed.unresolved_events.length,
      transaction_index: transactionIndex,
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}
