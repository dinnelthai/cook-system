# Pump.fun Bonding Curve Adapter — V1.1

- Status: Implementation specification
- Version: 1.1
- Date: 2026-11-23
- Scope: SOL-quoted Pump.fun bonding curves before graduation
- Runtime target: offline deterministic replay / simulation
- Parent: Cook System V1

## 1. Objective

Implement a versioned adapter that normalizes Pump.fun instruction variants, emitted events, bonding-curve account layouts, fee configuration, and completion transitions into the Cook System canonical contracts.

The adapter has two distinct modes:

1. **Observed replay:** decode confirmed chain executions and reconstruct state without changing the recorded facts.
2. **Synthetic simulation:** generate hypothetical offline state transitions using the same versioned curve semantics and exact integer arithmetic.

Observed replay and synthetic simulation must never share an unlabeled data stream. No signing, transaction construction, transaction submission, wallet orchestration, or live order placement is part of this adapter.

## 2. Source snapshot and provenance

Pin the external source inputs. Do not use an unpinned moving branch as the sole reproducibility reference.

| Source | Snapshot reference | Purpose |
|---|---|---|
| Pump program | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | Program identity |
| Pump IDL JSON | `pump-fun/pump-public-docs/idl/pump.json`, blob SHA `bb79d04e5a4ef8b286d67511757c23a15672ef51` | Instruction discriminators, account layouts, event layouts |
| Pump IDL TS | `pump-fun/pump-public-docs/idl/pump.ts`, blob SHA `675ef0abb865f524e5628df4b7a227eef8f47c09` | Generated TypeScript types |
| Pump Fees IDL | `pump-fun/pump-public-docs/idl/pump_fees.json`, blob SHA `a06cfeca8aed4d984091c023ec4d5ef3fa0bdda7` | FeeConfig / FeeTier layouts |
| Program README | `docs/PUMP_PROGRAM_README.md`, blob SHA `cdd6e6744c2797e9d502615a84a316cfe97a3ff8` | Account semantics and lifecycle |
| Trade V3 docs | `docs/instructions/TRADE_V3.md`, blob SHA `a50fc83f44b23688f615764a45ab752369dc39c4` | V3 instruction behavior |
| Synthetic migration docs | `docs/SYNTHETIC_MIGRATION.md`, blob SHA `1dcbb0e6cc6c520abe90fd67be6269077b7c121f` | Completing-buy event split |
| Fee program docs | `docs/FEE_PROGRAM_README.md`, blob SHA `20b48370e1cc6ac5bdaead8209e369e9b949b362` | Dynamic fee calculation |
| Reference SDK | `@pump-fun/pump-sdk` 4.1.0 | Differential quote oracle |

The Pump IDL metadata version is not sufficient to identify an on-chain deployment revision. Store both the IDL blob hash and the observed program / account layout metadata for every replay run.

## 3. V1.1 scope and explicit exclusions

### Supported for first implementation

- SOL-paired bonding curves.
- Legacy `buy` / `sell` and legacy exact-SOL-in paths where present in historical records.
- `buy_v2` / `sell_v2` / `buy_exact_quote_in_v2`.
- `buy_v3` / `sell_v3` / `buy_exact_quote_in_v3`.
- Legacy SPL Token and Token-2022 base mints, using the mint's decoded token program and decimals.
- Dynamic fee configuration snapshots and fee-tier changes.
- V3 fee accrual and later fee-sweep events.
- Ordinary non-Mayhem curve completion.
- Mayhem flag recognition and raw observed-event decoding. Mayhem quote simulation must use its own partial-fill semantics; it must not use ordinary synthetic migration.
- Curve account snapshots and event-to-account reconciliation.

### Deferred

- USDC-quoted curves.
- Pump-coin quote chains / multi-hop paths.
- PumpSwap pool execution and post-graduation market making.
- Mayhem-specific partial-fill and completion edge cases beyond safe recognition.
- Fee-sharing and holder-reward distribution accounting beyond decoding their event fields.

Unsupported quote mints or unrecognized instruction variants must return an explicit `UNSUPPORTED_VARIANT` result. They must never silently fall back to SOL math.

## 4. Canonical reserve model

Use quote-neutral names in the internal model:

- `virtual_token_reserves`
- `virtual_quote_reserves`
- `real_token_reserves`
- `real_quote_reserves`
- `token_total_supply`
- `quote_mint`
- `complete`

For a SOL-paired curve:

- The curve account's `quote_mint` may be the default public key.
- Unified V2/V3 instructions pass wrapped SOL (`So11111111111111111111111111111111111111112`) as the quote mint.
- The internal normalized quote asset is SOL.
- Quote amounts are in lamports (9 decimals).
- Token amounts use the actual Mint account decimals; do not assume decimals from the token symbol.

The current Pump IDL `BondingCurve` type includes, in order, virtual token / quote reserves, real token / quote reserves, supply, completion flag, creator, Mayhem and cashback flags, quote mint, creator fee bps, holder-reward flag, accrued creator / protocol fees, depth, initial quote reserves, and post-completion buy fields.

Older account data may be shorter because fields were appended over time. Decode known historical layouts by data length and pinned IDL / discriminator context. Missing documented trailing fields may receive documented defaults, but an unknown layout must fail closed. Never shift offsets based on guesswork.

Important: the Bonding Curve's `virtual_quote_reserves` is an unsigned reserve field in the current IDL. Do not import PumpSwap Pool's signed `virtual_quote_reserves` semantics into the curve adapter.

## 5. Instruction-family normalization

The adapter must decode the actual instruction discriminator and arguments. A date-only heuristic is insufficient because old and new instructions can coexist.

| Family | Instruction names | Normalized meaning | Fee settlement |
|---|---|---|---|
| Legacy | `buy`, `sell`, `buy_exact_sol_in` | Historical SOL curve execution | Legacy per-trade transfers |
| V2 | `buy_v2`, `sell_v2`, `buy_exact_quote_in_v2` | Unified quote-mint interface | Protocol / creator fees paid according to V2 flow |
| V3 | `buy_v3`, `sell_v3`, `buy_exact_quote_in_v3` | Smaller-account interface | Protocol / creator fees accrue on curve; buyback component is still paid in-trade |

V2 and V3 may be mixed on the same coin. Existing legacy instructions also remain supported by the program. Do not infer the instruction version from the token's creation date alone.

The current public IDL includes a `partial_fill` argument on some V2/V3 buy variants, while the public BUY.md table does not document it consistently. The adapter must treat the pinned IDL and actual instruction bytes as the decode authority, record the argument when present, and keep behavior behind version-specific tests.

## 6. Exact quote arithmetic

All base-unit arithmetic uses checked integer operations (`u64` / `u128` bounds as specified by the program) with explicit floor and ceiling division. No binary floating point is permitted in quote or state-transition calculations.

The simplified constant-product relationship:

`virtual_quote_reserves * virtual_token_reserves = k`

is a diagnostic baseline only. It is not the complete adapter implementation.

### 6.1 Fee resolution

The Pump Fees `FeeConfig` contains:
- `flat_fees`;
- `fee_tiers`;
- `stable_fee_tiers`;
- `exotic_flat_fees`.

A `Fees` record contains:
- `lp_fee_bps`;
- `protocol_fee_bps`;
- `creator_fee_bps`.

For the supported SOL-quoted curve path, resolve the fee configuration applicable at the event's execution point. Where the current fee program uses dynamic tiers, calculate the curve market-cap reference from:

`market_cap_lamports = floor(virtual_quote_reserves * mint_supply / virtual_token_reserves)`

Select the applicable `fee_tiers` entry using the pinned fee-program rules. If a fee-config account is unavailable, use the documented program fallback only when the exact instruction / program version permits it; otherwise mark the quote as unverified.

Do not hard-code a universal 1.25% fee. Store the resolved protocol, creator, and buyback basis points and the fee-config snapshot reference for each simulated execution.

### 6.2 Exact quote-in buy formula reference

The public Pump IDL documents the SOL exact-quote-in calculation in integer arithmetic. Let `B` be spendable quote input and `F_total = protocol_fee_bps + creator_fee_bps`:

1. `net_quote = floor(B * 10_000 / (10_000 + F_total))`
2. `protocol_fee = ceil(net_quote * protocol_fee_bps / 10_000)`
3. `creator_fee = ceil(net_quote * creator_fee_bps / 10_000)`
4. If `net_quote + protocol_fee + creator_fee > B`, reduce `net_quote` by the excess.
5. `tokens_out = floor((net_quote - 1) * virtual_token_reserves / (virtual_quote_reserves + net_quote - 1))`

This is the curve-leg reference for the documented exact-quote-in path. It does not by itself model a V3 buy that crosses curve completion; that path must use the V3 SDK quote implementation and split the curve and post-completion legs.

The exact-token-out buy and exact-token-in sell paths must be implemented against the pinned SDK / IDL arithmetic and differential-tested against emitted on-chain `TradeEvent` values. Do not derive a sell quote by algebraically reversing a buy formula and assume rounding parity.

### 6.3 Reference SDK as differential oracle

Pin `@pump-fun/pump-sdk` 4.1.0 in the adapter test environment. Use its public quote methods as a reference oracle for:
- exact token-out buy;
- exact quote-in buy;
- sell quote;
- V3 quote that crosses the completion boundary.

The Cook adapter remains a deterministic state / event normalizer. SDK outputs must be checked against recorded execution events and account deltas; the SDK is not a substitute for source-event provenance.

### 6.4 Interface-level platform fees are not Pump protocol fees

Pump.fun's published fee page states that, from 2026-10-17, the Pump.fun web and mobile apps charge an additional 0.45% platform fee for wallets without a referral code or 0.40% for wallets with a referral code. The same page says this fee does not apply to trades placed through Terminal or third-party interfaces. This is an interface-level fee, not a Pump on-chain `FeeConfig` tier and not a field that should be inferred from `TradeEvent`. If the simulator models a specific app route, store this as a separate off-chain execution-cost overlay; never merge it into protocol / creator fee bps.

## 7. Dynamic fee history

Fee configuration is mutable. A historical replay must not apply today's fee tiers to yesterday's trades.

Maintain a fee-config timeline:
- fee-config account address;
- decoded fee-config snapshot;
- effective slot / event sequence;
- source update event or account snapshot;
- content hash;
- decoder version.

Decode fee-program update events such as fee-tier updates and retain the exact tier table active at each observed or simulated execution. If the active configuration cannot be reconstructed, mark the fee calculation as uncertain and do not claim exact fee parity.

## 8. Event decoding and normalization

Decode at minimum:

- `TradeEvent`
- `CompleteEvent`
- `PostCompleteBuyEvent`
- `SweepBondingCurveFeeEvent`
- relevant fee-config update events
- `BondingCurve` account snapshots

The current `TradeEvent` includes both legacy SOL-named fields and quote-neutral fields, including `ix_name`, `quote_mint`, `quote_amount`, `virtual_quote_reserves`, `real_quote_reserves`, holder-reward fields, and unclaimed creator-fee information.

Normalization rules:

1. Preserve the original decoded event payload verbatim in an immutable source record.
2. Produce a normalized execution record with explicit quote asset, quote amount, token amount, side, instruction name, fee components, and post-execution curve state.
3. Use `ix_name` and instruction discriminator to resolve instruction family.
4. Reconcile legacy `sol_amount` and quote-neutral fields according to the quote mint and event version; do not blindly add both.
5. Keep fee amounts separate from effective curve reserve deltas.
6. Do not infer a wallet's role or controller from the event itself.

## 9. Synthetic migration boundary

For ordinary non-Mayhem coins, a V3 buy that crosses the remaining curve inventory can contain two economic legs:

1. **Curve leg:** buys the remaining tokens at the bonding-curve price and completes the curve.
2. **Post-completion pool leg:** buys additional tokens using the reserves the migration would create, priced with the pool formula.

The documented event order is:
1. `TradeEvent` — curve leg only.
2. `CompleteEvent` — curve completion.
3. `PostCompleteBuyEvent` — post-completion pool leg.

Normalize these as separate venue / execution-leg records. The pool leg must not be added to the bonding-curve OHLCV. A combined transaction summary may report the sum of the legs, but it must preserve the component breakdown.

After the curve is complete, subsequent curve trades are not valid until migration. Do not continue applying curve swaps after `complete == true`.

Mayhem coins do not use the ordinary synthetic migration behavior. Until the dedicated Mayhem adapter is tested, mark this branch unsupported for synthetic quote generation rather than assuming the ordinary path.

## 10. Fee settlement and sweep accounting

V3 protocol and creator fees remain on the bonding curve until swept. The buyback portion of the protocol fee is paid in the trade. Later sweep instructions emit `SweepBondingCurveFeeEvent`.

Therefore:
- a fee sweep is a fee movement, not a trade;
- a sweep does not change raw OHLCV;
- accrued protocol / creator fee buckets must be tracked separately from effective curve liquidity;
- fee bucket changes must reconcile with sweep events and account snapshots;
- a V2 / legacy trade must use its own fee settlement semantics.

## 11. Event ordering and replay

The replay key must include enough information to establish a total order:

`(slot, transaction_index, instruction_index, inner_instruction_index, event_sequence)`

`event_sequence` is a stable log / event ordinal within the transaction. Signature alone is not a unique event key because one transaction may contain multiple instructions and multiple emitted events.

For observed data:
- preserve chain order where complete;
- mark partial ordering where one or more components are missing;
- refuse exact open / close reconstruction when order is insufficient;
- never fabricate transaction order from timestamp alone.

For synthetic data:
- generate a deterministic event sequence;
- persist the random seed and event-generator version;
- replay must be bit-for-bit deterministic.

## 12. State reconciliation

After each normalized curve execution, compare:
- expected virtual reserve changes;
- expected real reserve changes;
- wallet token and quote balance deltas;
- protocol / creator fee buckets;
- event-reported post-state;
- next authoritative account snapshot.

Reconciliation statuses:
- `PASS`: all required fields match within program-defined integer semantics;
- `WARNING`: incomplete event / snapshot coverage but no known contradiction;
- `FAIL`: confirmed mismatch;
- `UNKNOWN`: unsupported instruction or unavailable source data.

Do not "repair" a mismatch by overwriting raw events. Record the first divergent event and preserve both expected and observed states.

## 13. Acceptance tests

### Instruction decoding
- [ ] Legacy, V2, and V3 discriminators decode to distinct variants.
- [ ] Unknown discriminators fail closed.
- [ ] V2/V3 can be interleaved in one curve history.
- [ ] SOL quote normalization handles default curve quote mint and wrapped-SOL instruction quote mint.

### Account decoding
- [ ] Current `BondingCurve` layout decodes all documented fields.
- [ ] Historical shorter layouts decode only when a known layout is identified.
- [ ] Unknown account lengths do not silently decode.
- [ ] SPL Token and Token-2022 mint decimals are read from mint metadata.

### Fee parity
- [ ] Dynamic fee tiers are resolved from the correct historical FeeConfig.
- [ ] Fee config changes are applied at the correct event boundary.
- [ ] V2/legacy fee transfers and V3 accrued fee buckets are separate.
- [ ] Fee sweeps never create trade volume.
- [ ] Fee calculations match the pinned SDK and event data.

### Migration boundary
- [ ] A normal V3 curve-only buy emits one curve leg.
- [ ] A completing V3 buy produces distinct curve, completion, and post-completion pool-leg records.
- [ ] Post-completion pool leg is excluded from curve OHLCV.
- [ ] No subsequent curve execution is accepted after completion.
- [ ] Mayhem synthetic-migration quote generation remains disabled until separately validated.

### Determinism and reconciliation
- [ ] Same ordered event stream and adapter snapshot produce the same state hash.
- [ ] Same simulation seed produces the same synthetic event stream.
- [ ] Raw candles reconcile to confirmed curve execution legs only.
- [ ] Incomplete order or fee configuration lowers confidence rather than generating false precision.

## 14. Source references

- Pump public IDL: https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump.json
- Pump public TypeScript IDL: https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump.ts
- Pump Fees IDL: https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump_fees.json
- Pump program account and lifecycle docs: https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md
- Bonding curve V3 trades: https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/TRADE_V3.md
- Synthetic migration: https://github.com/pump-fun/pump-public-docs/blob/main/docs/SYNTHETIC_MIGRATION.md
- Dynamic fee program: https://github.com/pump-fun/pump-public-docs/blob/main/docs/FEE_PROGRAM_README.md
- Official SDK: https://www.npmjs.com/package/@pump-fun/pump-sdk/v/4.1.0
