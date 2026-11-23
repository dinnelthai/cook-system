import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fetchPumpMintHistoryFromEnv } from "../src/adapters/pump/pump-history-collector.mjs";

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
    } else {
      result[key] = true;
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
if (!args.mint) {
  console.error("Usage: npm run replay:pump -- --mint <TOKEN_MINT> [--limit 10000] [--concurrency 5] [--fee-history] [--include-raw] [--network mainnet] [--out artifacts/history.json]");
  process.exitCode = 2;
} else {
  try {
    const result = await fetchPumpMintHistoryFromEnv({
      mint: args.mint,
      network: args.network ?? "mainnet",
      maxSignatures: Number(args.limit ?? 10_000),
      concurrency: Number(args.concurrency ?? 5),
      until: args.until ?? null,
      includeRawTransactions: args["include-raw"] === true,
      includeFeeConfigHistory: args["fee-history"] === true,
    });
    const json = JSON.stringify(result, (_, value) => typeof value === "bigint" ? value.toString() : value, 2);
    if (args.out) {
      const outputPath = resolve(args.out);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${json}\n`, "utf8");
      console.log(`Saved replay output to ${outputPath}`);
    }
    console.log(JSON.stringify({
      status: result.status,
      mint: result.market.token_mint,
      bonding_curve_address: result.bonding_curve_address,
      signatures_seen: result.signature_coverage.signatures.length,
      transactions_fetched: result.signature_coverage.fetched_transactions,
      events: result.events.length,
      data_gaps: result.data_gaps.length,
      curve_replay_status: result.curve_replay_status,
      replay_lifecycle: result.replay?.state.lifecycle ?? null,
      curve_snapshot_reconciliation: result.current_account_reconciliation?.status ?? null,
      pool_replays: result.pool_replays.map((pool) => ({
        pool_address: pool.pool_address,
        replay_status: pool.replay_status,
        signatures_seen: pool.signature_coverage?.signatures?.length ?? 0,
        fetched_transactions: result.transactions.filter((item) => item.source_addresses.includes(pool.pool_address)).length,
        pool_events: pool.replay?.processed_event_ids?.length ?? 0,
        current_account_reconciliation: pool.current_account_reconciliation?.status ?? null,
        unresolved_events: pool.unresolved_events.length,
      })),
      unresolved_events: result.transactions.reduce((sum, item) => sum + item.unresolved_count, 0),
      candles_1m: result.raw_candles_1m.length,
      candle_status: result.raw_candles_status,
    }, null, 2));
    if (result.status !== "REPLAYED_FULL_HISTORY") process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}
