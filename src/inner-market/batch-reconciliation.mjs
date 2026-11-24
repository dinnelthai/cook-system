import { parseBaseUnits } from "../core/integer.mjs";

/**
 * Audits receipts from an already-authorized transaction batch.
 * This function never builds, signs, schedules, or submits transactions.
 */
export function reconcileExecutionBatch(receipts) {
  if (!Array.isArray(receipts)) throw new TypeError("receipts must be an array");
  const signatures = new Set();
  const batches = new Map();
  const validStatuses = new Set(["CONFIRMED", "PENDING", "FAILED", "REJECTED"]);

  for (const receipt of receipts) {
    if (!receipt || typeof receipt.batch_id !== "string" || receipt.batch_id.length === 0) throw new TypeError("each receipt requires batch_id");
    if (typeof receipt.signature !== "string" || receipt.signature.length === 0) throw new TypeError("each receipt requires signature");
    if (signatures.has(receipt.signature)) throw new Error("duplicate transaction signature: " + receipt.signature);
    signatures.add(receipt.signature);
    if (!validStatuses.has(receipt.status)) throw new TypeError("unsupported receipt status: " + receipt.status);
    let batch = batches.get(receipt.batch_id);
    if (!batch) {
      batch = { batch_id: receipt.batch_id, confirmed: 0, pending: 0, failed: 0, rejected: 0, buy_quote: 0n, sell_quote: 0n, buy_tokens: 0n, sell_tokens: 0n, fees: 0n, wallets: new Set() };
      batches.set(receipt.batch_id, batch);
    }
    if (receipt.wallet_address) batch.wallets.add(receipt.wallet_address);
    if (receipt.status !== "CONFIRMED") {
      batch[receipt.status.toLowerCase()] += 1;
      continue;
    }
    if (receipt.side !== "BUY" && receipt.side !== "SELL") throw new TypeError("confirmed receipt side must be BUY or SELL");
    const quote = parseBaseUnits(receipt.quote_amount_base_units, { name: "quote_amount_base_units" });
    const tokens = parseBaseUnits(receipt.token_amount_base_units, { name: "token_amount_base_units" });
    const fee = parseBaseUnits(receipt.fee_quote_base_units || "0", { name: "fee_quote_base_units" });
    if (quote === 0n || tokens === 0n) throw new RangeError("confirmed receipt amounts must be positive");
    if (receipt.side === "SELL" && fee > quote) throw new RangeError("sell fee exceeds gross quote proceeds");
    batch.confirmed += 1;
    batch.fees += fee;
    if (receipt.side === "BUY") {
      batch.buy_quote += quote + fee;
      batch.buy_tokens += tokens;
    } else {
      batch.sell_quote += quote - fee;
      batch.sell_tokens += tokens;
    }
  }

  return [...batches.values()].map((batch) => ({
    batch_id: batch.batch_id,
    receipt_count: batch.confirmed + batch.pending + batch.failed + batch.rejected,
    confirmed_count: batch.confirmed,
    pending_count: batch.pending,
    failed_count: batch.failed,
    rejected_count: batch.rejected,
    observed_wallet_count: batch.wallets.size,
    confirmed_buy_quote_spent_base_units: batch.buy_quote.toString(),
    confirmed_sell_quote_received_base_units: batch.sell_quote.toString(),
    confirmed_buy_token_amount_base_units: batch.buy_tokens.toString(),
    confirmed_sell_token_amount_base_units: batch.sell_tokens.toString(),
    confirmed_fee_quote_base_units: batch.fees.toString(),
  }));
}