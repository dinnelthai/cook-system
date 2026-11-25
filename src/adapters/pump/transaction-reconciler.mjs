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

const U64_MAX=(1n<<64n)-1n;
function unsigned(value,name){
 const n=asBigInt(value,name);
 if(n<0n||n>U64_MAX)throw new RangeError(name+" outside u64");
 return n;
}
function tokenAccountBalanceMap(balances,keys){
 if(!Array.isArray(balances))return null;
 const result=new Map();
 for(const item of balances){
  const address=Number.isSafeInteger(item?.accountIndex)&&item.accountIndex>=0?keys[item.accountIndex]:null;
  if(typeof address!=="string"||!address||typeof item.mint!=="string"||!item.mint||result.has(address)||
     !Number.isInteger(item.uiTokenAmount?.decimals)||item.uiTokenAmount.decimals<0||item.uiTokenAmount.decimals>255||
     typeof item.uiTokenAmount?.amount!=="string")return null;
  let amount;try{amount=unsigned(item.uiTokenAmount.amount,"token balance");}catch{return null;}
  result.set(address,{address,mint:item.mint,owner:typeof item.owner==="string"&&item.owner?item.owner:null,amount,decimals:item.uiTokenAmount.decimals});
 }
 return result;
}
export function extractTransactionBalanceDeltas(transaction) {
 const meta=transaction?.meta;
 if(!meta)throw new TypeError("transaction metadata is required for balance reconciliation");
 const keys=accountKeys(transaction),issues=[],lamports=[],tokens=[],tokenAccounts=[];
 let fee=null;try{fee=unsigned(meta.fee,"network fee").toString();}catch{issues.push("NETWORK_FEE_UNKNOWN");}
 const nativeArrays=Array.isArray(meta.preBalances)&&Array.isArray(meta.postBalances)&&meta.preBalances.length===keys.length&&meta.postBalances.length===keys.length;
 if(!nativeArrays)issues.push("NATIVE_BALANCE_ARRAY_INCOMPLETE");
 else for(let i=0;i<keys.length;i++){
  if(typeof keys[i]!=="string"||!keys[i]){issues.push("NATIVE_ACCOUNT_UNKNOWN");continue;}
  try{
   const pre=unsigned(meta.preBalances[i],"pre balance"),post=unsigned(meta.postBalances[i],"post balance");
   lamports.push({address:keys[i],pre_lamports:pre.toString(),post_lamports:post.toString(),delta_lamports:(post-pre).toString()});
  }catch{issues.push("NATIVE_BALANCE_UNKNOWN");}
 }
 const pre=tokenAccountBalanceMap(meta.preTokenBalances,keys),post=tokenAccountBalanceMap(meta.postTokenBalances,keys);
 if(!pre||!post)issues.push("TOKEN_BALANCE_METADATA_INCOMPLETE");
 else{
  const owners=new Map(),decimalsByMint=new Map();let ownerIncomplete=false;
  function addOwner(row,side){
   if(!row)return;
   if(!row.owner){ownerIncomplete=true;return;}
   const key=JSON.stringify([row.owner,row.mint]);
   const aggregate=owners.get(key)??{owner:row.owner,mint:row.mint,decimals:row.decimals,pre:0n,post:0n,accounts:new Set()};
   aggregate[side]+=row.amount;aggregate.accounts.add(row.address);owners.set(key,aggregate);
  }
  for(const address of new Set([...pre.keys(),...post.keys()])){
   const before=pre.get(address),after=post.get(address),row=before??after;
   for(const r of [before,after]){
    if(!r)continue;
    if(decimalsByMint.has(r.mint)&&decimalsByMint.get(r.mint)!==r.decimals){ownerIncomplete=true;issues.push("TOKEN_DECIMALS_CONFLICT");}
    decimalsByMint.set(r.mint,r.decimals);
   }
   if(before&&after&&(before.mint!==after.mint||before.decimals!==after.decimals)){
    ownerIncomplete=true;issues.push("TOKEN_ACCOUNT_IDENTITY_CHANGED");continue;
   }
   const a=before?.amount??0n,z=after?.amount??0n;
   // A missing row in an available array is a recorded absence, not proof of account creation/closure.
   tokenAccounts.push({address,mint:row.mint,owner:before&&after?(before.owner===after.owner?before.owner:null):row.owner,
    pre_amount_base_units:a.toString(),post_amount_base_units:z.toString(),delta_base_units:(z-a).toString(),decimals:row.decimals});
   addOwner(before,"pre");addOwner(after,"post");
  }
  if(ownerIncomplete)issues.push("TOKEN_OWNER_AGGREGATION_INCOMPLETE");
  else for(const x of owners.values())tokens.push({owner:x.owner,mint:x.mint,pre_amount_base_units:x.pre.toString(),post_amount_base_units:x.post.toString(),delta_base_units:(x.post-x.pre).toString(),decimals:x.decimals,account_count:x.accounts.size});
 }
 // Transaction-wide native conservation is separate from economic attribution.
 // A discrepancy is a review observation, not proof of a missing fee or rent.
 const nativeComplete=keys.length>0&&lamports.length===keys.length&&new Set(keys).size===keys.length;
 const observed=nativeComplete?lamports.reduce((sum,row)=>sum+BigInt(row.delta_lamports),0n):null;
 const expected=fee===null?null:-BigInt(fee);
 const residual=observed===null||expected===null?null:observed-expected;
 const nativeFeeAudit={status:residual===null?"UNKNOWN":residual===0n?"RECORDED_FEE_MATCH":"REVIEW_REQUIRED",
  recorded_account_count:lamports.length,expected_account_count:keys.length,
  recorded_network_fee_lamports:fee,observed_native_delta_lamports:observed?.toString()??null,
  expected_native_delta_lamports:expected?.toString()??null,residual_lamports:residual?.toString()??null,
  scope:"TRANSACTION_ALL_RECORDED_ACCOUNTS",economic_attribution:"UNKNOWN",source_attestation:"UNKNOWN"};
 return {fee_lamports:fee,lamports,tokens,token_accounts:tokenAccounts,balance_evidence_status:issues.length?"PARTIAL":"RECORDED_DELTAS",balance_evidence_issues:[...new Set(issues)],native_fee_audit:nativeFeeAudit};
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
  const adjustedLamportDelta = rawLamportDelta === null || (feePayer === actor && balances.fee_lamports === null)
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


export function reconcilePumpSwapTradesWithTransaction({
  transaction,
  tradeEvents,
}) {
  if (!Array.isArray(tradeEvents) || tradeEvents.length === 0) {
    throw new TypeError("at least one normalized PumpSwap trade event is required");
  }
  const meta = transaction?.meta;
  if (!meta) throw new TypeError("transaction metadata is required");
  if (meta.err !== null && meta.err !== undefined) {
    return { status: "INVALID", reason: "transaction_failed", transaction_error: meta.err, checks: [] };
  }

  const balances = extractTransactionBalanceDeltas(transaction);
  const first = tradeEvents[0];
  const actor = first.payload.actor_address;
  const baseMint = first.market.token_mint;
  const quoteMint = first.market.quote_mint;
  const pool = first.payload.pool_address;
  const side = first.event_kind === "POOL_BUY_EXECUTED" ? "buy" : "sell";
  const mixed = tradeEvents.some((event) =>
    event.payload.actor_address !== actor ||
    event.market.token_mint !== baseMint ||
    event.market.quote_mint !== quoteMint ||
    event.payload.pool_address !== pool ||
    (event.event_kind === "POOL_BUY_EXECUTED" ? "buy" : "sell") !== side
  );
  if (mixed) {
    return { status: "WARNING", reason: "mixed_pool_trade_actors_mints_sides_or_pools", checks: [], balance_deltas: balances };
  }

  const expectedBase = tradeEvents.reduce((sum, event) =>
    sum + asBigInt(event.payload.token_amount_base_units, "base token amount"), 0n);
  const expectedQuote = tradeEvents.reduce((sum, event) =>
    sum + asBigInt(event.payload.quote_amount_base_units, "quote token amount"), 0n);
  const actorBase = balances.tokens.find((item) => item.owner === actor && item.mint === baseMint);
  const actorQuote = balances.tokens.find((item) => item.owner === actor && item.mint === quoteMint);
  const baseVault = first.payload.pool_vault_accounts?.base;
  const quoteVault = first.payload.pool_vault_accounts?.quote;
  const baseVaultDelta = balances.token_accounts.find((item) => item.address === baseVault && item.mint === baseMint);
  const quoteVaultDelta = balances.token_accounts.find((item) => item.address === quoteVault && item.mint === quoteMint);

  const expectedActorBase = side === "buy" ? expectedBase : -expectedBase;
  const expectedActorQuote = side === "buy" ? -expectedQuote : expectedQuote;
  const expectedPoolBase = -expectedActorBase;
  const actorBaseMatches = actorBase ? BigInt(actorBase.delta_base_units) === expectedActorBase : false;
  const actorQuoteMatches = actorQuote ? BigInt(actorQuote.delta_base_units) === expectedActorQuote : false;
  const poolBaseMatches = baseVaultDelta ? BigInt(baseVaultDelta.delta_base_units) === expectedPoolBase : false;
  const poolQuoteObserved = quoteVaultDelta ? BigInt(quoteVaultDelta.delta_base_units) : null;
  const poolQuoteDirectionMatches = poolQuoteObserved !== null &&
    (side === "buy" ? poolQuoteObserved > 0n : poolQuoteObserved < 0n);

  const checks = [
    {
      name: "actor_base_token_balance_delta",
      status: actorBaseMatches ? "PASS" : actorBase ? "MISMATCH" : "UNKNOWN",
      expected: expectedActorBase.toString(),
      observed: actorBase?.delta_base_units ?? null,
    },
    {
      name: "actor_quote_token_balance_delta",
      status: actorQuoteMatches ? "PASS" : actorQuote ? "MISMATCH" : "UNKNOWN",
      expected: expectedActorQuote.toString(),
      observed: actorQuote?.delta_base_units ?? null,
    },
    {
      name: "pool_base_vault_balance_delta",
      status: poolBaseMatches ? "PASS" : baseVaultDelta ? "MISMATCH" : "UNKNOWN",
      expected: expectedPoolBase.toString(),
      observed: baseVaultDelta?.delta_base_units ?? null,
    },
    {
      name: "pool_quote_vault_balance_direction",
      status: poolQuoteDirectionMatches ? "PASS" : quoteVaultDelta ? "MISMATCH" : "UNKNOWN",
      expected: side === "buy" ? "positive" : "negative",
      observed: quoteVaultDelta?.delta_base_units ?? null,
      note: "quote-vault delta includes pool fees, buyback transfers and any other quote-vault movement in this transaction; direction is checked, not an exact amount",
    },
  ];
  const allPass = checks.every((check) => check.status === "PASS");
  const mismatch = checks.some((check) => check.status === "MISMATCH");
  return {
    status: allPass ? "PASS" : mismatch ? "WARNING" : "UNKNOWN",
    reason: allPass ? "actor_and_pool_base_vault_deltas_match" : "one_or_more_pool_trade_balance_checks_not_passed",
    checks,
    balance_deltas: balances,
    event_count: tradeEvents.length,
    actor_address: actor,
    pool_address: pool,
    base_mint: baseMint,
    quote_mint: quoteMint,
  };
}
