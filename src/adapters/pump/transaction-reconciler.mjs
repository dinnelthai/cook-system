import { WRAPPED_SOL_MINT } from "./fee-resolver.mjs";

function asBigInt(value, name) {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^-?(0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  throw new TypeError(`${name} must be an integer`);
}

function accountKeys(transaction) {
  const message = transaction?.transaction?.message ?? transaction?.message;
  const meta = transaction?.meta;
  const staticKeys = (message?.accountKeys ?? []).map((key) =>
    typeof key === "string" ? key : key.pubkey
  );
  const loaded = meta?.loadedAddresses ?? {};
  return [
    ...staticKeys,
    ...(loaded.writable ?? []),
    ...(loaded.readonly ?? []),
  ];
}

function tokenBalanceMap(balances = [], keys = []) {
  const result = new Map();
  for (const item of balances) {
    const owner = item.owner ?? keys[item.accountIndex] ?? null;
    if (!owner || typeof item.mint !== "string") continue;
    const key = `${owner}:${item.mint}`;
    const amount = BigInt(item.uiTokenAmount?.amount ?? "0");
    const decimals = item.uiTokenAmount?.decimals ?? null;
    const previous = result.get(key);
    result.set(key, {
      owner,
      mint: item.mint,
      amount: (previous?.amount ?? 0n) + amount,
      decimals: previous?.decimals ?? decimals,
      account_count: (previous?.account_count ?? 0) + 1,
    });
  }
  return result;
}

export function extractTransactionBalanceDeltas(transaction) {
  const meta = transaction?.meta;
  if (!meta) throw new TypeError("transaction metadata is required for balance reconciliation");
  const keys = accountKeys(transaction);
  const preBalances = meta.preBalances ?? [];
  const postBalances = meta.postBalances ?? [];
  const lamports = [];
  const count = Math.max(keys.length, preBalances.length, postBalances.length);
  for (let index = 0; index < count; index += 1) {
    if (!keys[index]) continue;
    const pre = BigInt(preBalances[index] ?? 0);
    const post = BigInt(postBalances[index] ?? 0);
    lamports.push({
      address: keys[index],
      pre_lamports: pre.toString(),
      post_lamports: post.toString(),
      delta_lamports: (post - pre).toString(),
    });
  }

  const preTokens = tokenBalanceMap(meta.preTokenBalances ?? [], keys);
  const postTokens = tokenBalanceMap(meta.postTokenBalances ?? [], keys);
  const tokenKeys = new Set([...preTokens.keys(), ...postTokens.keys()]);
  const tokens = [];
  for (const key of tokenKeys) {
    const before = preTokens.get(key);
    const after = postTokens.get(key);
    const owner = before?.owner ?? after?.owner;
    const mint = before?.mint ?? after?.mint;
    const pre = before?.amount ?? 0n;
    const post = after?.amount ?? 0n;
    tokens.push({
      owner,
      mint,
      pre_amount_base_units: pre.toString(),
      post_amount_base_units: post.toString(),
      delta_base_units: (post - pre).toString(),
      decimals: before?.decimals ?? after?.decimals ?? null,
      account_count: (before?.account_count ?? 0) + (after?.account_count ?? 0),
    });
  }

  return {
    fee_lamports: String(meta.fee ?? 0),
    lamports,
    tokens,
  };
}

function transactionInstructions(transaction) {
  const message = transaction?.transaction?.message ?? transaction?.message;
  const outer = message?.instructions ?? [];
  const inner = transaction?.meta?.innerInstructions ?? [];
  const innerCount = inner.reduce((sum, group) => sum + (group.instructions?.length ?? 0), 0);
  return { outerCount: outer.length, innerCount, hasOtherInstructions: outer.length + innerCount > 1 };
}

export function reconcilePumpTradesWithTransaction({
  transaction,
  tradeEvents,
}) {
  if (!Array.isArray(tradeEvents) || tradeEvents.length === 0) {
    throw new TypeError("at least one normalized Pump trade event is required");
  }
  const meta = transaction?.meta;
  if (!meta) throw new TypeError("transaction metadata is required");
  if (meta.err !== null && meta.err !== undefined) {
    return {
      status: "INVALID",
      reason: "transaction_failed",
      transaction_error: meta.err,
      checks: [],
    };
  }

  const balances = extractTransactionBalanceDeltas(transaction);
  const { hasOtherInstructions } = transactionInstructions(transaction);
  const first = tradeEvents[0];
  const actor = first.payload.actor_address;
  const mint = first.market.token_mint;
  const side = first.event_kind === "CURVE_BUY_EXECUTED" ? "buy" : "sell";
  const mixed = tradeEvents.some((event) =>
    event.payload.actor_address !== actor ||
    event.market.token_mint !== mint ||
    (event.event_kind === "CURVE_BUY_EXECUTED" ? "buy" : "sell") !== side
  );
  if (mixed) {
    return {
      status: "WARNING",
      reason: "mixed_trade_actors_mints_or_sides",
      checks: [],
      balance_deltas: balances,
    };
  }

  const expectedToken = tradeEvents.reduce((sum, event) => sum + asBigInt(event.payload.token_amount_base_units, "token amount"), 0n);
  const expectedQuote = tradeEvents.reduce((sum, event) => sum + asBigInt(event.payload.quote_amount_base_units, "quote amount"), 0n);
  const tokenDelta = balances.tokens.find((item) => item.owner === actor && item.mint === mint);
  const walletLamports = balances.lamports.find((item) => item.address === actor);
  const rawLamportDelta = walletLamports ? BigInt(walletLamports.delta_lamports) : null;
  const feePayer = accountKeys(transaction)[0] ?? null;
  const adjustedLamportDelta = rawLamportDelta === null
    ? null
    : rawLamportDelta + (feePayer === actor ? BigInt(balances.fee_lamports) : 0n);
  const expectedTokenDelta = side === "buy" ? expectedToken : -expectedToken;
  const expectedQuoteDelta = side === "buy" ? -expectedQuote : expectedQuote;
  const tokenMatches = tokenDelta ? BigInt(tokenDelta.delta_base_units) === expectedTokenDelta : false;
  const quoteMatches = adjustedLamportDelta !== null && adjustedLamportDelta === expectedQuoteDelta;

  const checks = [
    {
      name: "actor_token_balance_delta",
      status: tokenMatches ? "PASS" : tokenDelta ? "MISMATCH" : "UNKNOWN",
      expected: expectedTokenDelta.toString(),
      observed: tokenDelta?.delta_base_units ?? null,
    },
    {
      name: "actor_native_quote_balance_delta",
      status: quoteMatches ? "PASS" : adjustedLamportDelta === null ? "UNKNOWN" : "MISMATCH",
      expected: expectedQuoteDelta.toString(),
      observed: adjustedLamportDelta?.toString() ?? null,
      note: "network transaction fee is added back only when the actor is the transaction fee payer; rent and other instructions can still affect this delta",
    },
  ];

  const allPass = checks.every((check) => check.status === "PASS");
  const knownMismatch = checks.some((check) => check.status === "MISMATCH");
  return {
    status: allPass ? "PASS" : knownMismatch ? "WARNING" : "UNKNOWN",
    reason: allPass
      ? "token_and_native_quote_deltas_match"
      : hasOtherInstructions
        ? "transaction_contains_other_instructions_or_balance_effects"
        : "one_or_more_balance_deltas_do_not_match_event_amounts",
    checks,
    balance_deltas: balances,
    event_count: tradeEvents.length,
    actor_address: actor,
    token_mint: mint,
    quote_mint: WRAPPED_SOL_MINT,
  };
}

export function reconcileCurveStateSnapshot({ replayedState, decodedBondingCurve }) {
  if (!replayedState || !decodedBondingCurve?.data) throw new TypeError("replayed state and decoded BondingCurve are required");
  const fields = [
    ["virtual_token_reserves_base_units", "virtual_token_reserves"],
    ["virtual_quote_reserves_base_units", "virtual_quote_reserves"],
    ["real_token_reserves_base_units", "real_token_reserves"],
    ["real_quote_reserves_base_units", "real_quote_reserves"],
    ["token_total_supply_base_units", "token_total_supply"],
    ["protocol_fees_base_units", "protocol_fees"],
    ["creator_fees_base_units", "creator_fee"],
  ];
  const mismatches = [];
  const missing = [];
  for (const [stateField, accountField] of fields) {
    const observed = decodedBondingCurve.data[accountField];
    if (observed === null || observed === undefined) {
      missing.push(stateField);
      continue;
    }
    const actual = BigInt(observed).toString();
    const expected = String(replayedState[stateField]);
    if (actual !== expected) mismatches.push({ field: stateField, replayed: expected, observed: actual });
  }
  if (typeof decodedBondingCurve.data.complete !== "boolean") missing.push("complete");
  else if (decodedBondingCurve.data.complete !== replayedState.complete) {
    mismatches.push({
      field: "complete",
      replayed: replayedState.complete,
      observed: decodedBondingCurve.data.complete,
    });
  }
  return {
    status: mismatches.length ? "FAIL" : missing.length ? "UNKNOWN" : "PASS",
    mismatches,
    missing_fields: missing,
    snapshot_slot: decodedBondingCurve.context_slot ?? null,
  };
}
