import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fetchRaydiumMintHistoryFromEnv } from "../src/adapters/raydium/raydium-history-collector.mjs";

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
if (!args.mint) {
  console.error("Usage: npm run replay:raydium -- --mint <TOKEN_MINT> [--quote-mint <QUOTE_MINT>] [--limit 50000] [--out artifacts/raydium-history.json] [--include-transactions]");
  process.exitCode = 2;
} else {
  try {
    const result = await fetchRaydiumMintHistoryFromEnv({
      mint: args.mint,
      quoteMint: args["quote-mint"],
      maxSignatures: Number(args.limit ?? 50_000),
      includeTransactions: args["include-transactions"] === true,
    });
    const outputPath = resolve(args.out ?? `artifacts/raydium-${args.mint}.json`);
    await mkdir(resolve(outputPath, ".."), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(result, (_, value) => typeof value === "bigint" ? value.toString() : value, 2)}\n`,
      "utf8",
    );
    console.log(JSON.stringify({
      status: result.status,
      mint: result.mint,
      launchlab_pool: result.launchlab?.pool_address ?? result.launchlab_pool_address ?? null,
      cpmm_pool: result.cpmm?.pool_address ?? result.discovered_cpmm_pool_address ?? null,
      normalized_events: result.normalized_events?.length ?? 0,
      raw_candles_1m: result.raw_candles_1m?.length ?? 0,
      coverage_complete: result.coverage_complete ?? false,
      vault_reconciliation_pass: result.vault_reconciliation_pass ?? false,
      saved: outputPath,
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}
