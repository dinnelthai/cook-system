# Pump Decoder and Dynamic Fee Resolver — V1.2

- Status: Initial implementation committed; runtime verification pending
- Version: 1.2
- Date: 2026-11-23
- Parent: Pump.fun Bonding Curve Adapter V1.1
- Scope: Offline decoding and historical fee reconstruction for SOL-paired Pump bonding curves

## 1. Deliverables

V1.2 adds the first source-driven adapter layer:

- A pinned Pump / Pump Fees IDL snapshot.
- A dependency-free Borsh reader driven by the pinned IDL.
- Pump Legacy / V2 / V3 trade instruction decoding.
- Pump TradeEvent, CompleteEvent, PostCompleteBuyEvent, and SweepBondingCurveFeeEvent decoding.
- Pump BondingCurve / Global and Pump Fees FeeConfig account decoding.
- Program-scoped Program data log extraction.
- Dynamic fee tier selection using the Pump Fees FeeConfig.
- Historical fee-config timeline invalidation when a fee update event occurs without a subsequent full account snapshot.
- Exact integer quote-in calculation for the documented SOL exact-quote-in formula.

## 2. Pinned source inputs

The generated snapshot is src/adapters/pump/pump-idl.snapshot.json.

| Input | Pinned reference |
|---|---|
| Pump program | 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P |
| Pump Fees program | pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ |
| Pump IDL blob | bb79d04e5a4ef8b286d67511757c23a15672ef51 |
| Pump Fees IDL blob | a06cfeca8aed4d984091c023ec4d5ef3fa0bdda7 |
| Pump FeeConfig PDA | 8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt |
| SDK reference | @pump-fun/pump-sdk 4.1.0 |

The upstream IDL metadata version is not a deployment version. Every replay result must retain the snapshot version and source blob hashes. Updating the snapshot requires reviewing the diff, regenerating the decoder tests, and recording a new adapter version.

## 3. Decoder modules

### src/adapters/pump/borsh.mjs

- Base58 / Base64 codecs.
- Little-endian Borsh primitives: bool, u8, u16, u32, u64, u128, i64, pubkey and string.
- Struct, tuple struct, fixed array, vector, option and defined-type decoding.
- Strict bounds checks, UTF-8 validation and recursion / vector limits.
- Explicit partial trailing-field defaults for known append-only account / event layouts.

### src/adapters/pump/pump-decoder.mjs

Exports:

- decodePumpInstruction({ programId, data, encoding })
- decodeProgramEvent({ programId, data, encoding })
- decodeProgramAccount({ programId, data, encoding })
- decodeProgramDataLogs(logs, programId)
- getPumpIdlSnapshotMetadata()

The instruction decoder supports the pinned Legacy / V2 / V3 buy and sell discriminators. Optional trailing OptionBool arguments may be omitted where the IDL / official instruction docs allow it. Unknown discriminators and unsupported programs return explicit statuses; they are never guessed from transaction timestamps.

The log decoder only consumes Program data emitted while the requested program is at the top of the invocation stack. This prevents a nested CPI program's event bytes from being attributed to Pump.

### src/adapters/pump/fee-resolver.mjs

Exports:

- calculateBondingCurveMarketCap(...)
- calculateFeeTier(...)
- resolveBondingCurveFees(...)
- buildFeeConfigTimeline(...)
- resolveFeeConfigAt(...)
- quoteExactSolIn(...)

For a SOL-paired bonding curve:

market_cap_lamports = floor(virtual_quote_reserves * token_total_supply / virtual_token_reserves)

Tier selection follows the official algorithm: if market cap is below the first threshold, use the first tier; otherwise select the highest threshold not greater than market cap. The tier supplies LP, protocol and creator basis points. For bonding curves, LP fee bps are retained as a decoded field but are not added to the protocol-plus-creator exact-input fee denominator unless the relevant program path explicitly requires them.

If FeeConfig is absent, the resolver can use the documented Global fee-bps fallback. If a fee update event has occurred after the last full FeeConfig snapshot, the timeline marks the configuration stale and refuses to claim exact historical fees. A current FeeConfig snapshot alone does not prove the historical tier table unless the caller supplies complete timeline coverage.

## 4. Exact quote-in formula

For spendable SOL input B, protocol fee P bps, creator fee C bps, virtual SOL reserves Q, and virtual token reserves T:

1. net_quote = floor(B * 10_000 / (10_000 + P + C))
2. protocol_fee = ceil(net_quote * P / 10_000)
3. creator_fee = ceil(net_quote * C / 10_000)
4. If net_quote + protocol_fee + creator_fee > B, reduce net_quote by the excess.
5. tokens_out = floor((net_quote - 1) * T / (Q + net_quote - 1))

All calculations use BigInt. The buyback fee is a split of the protocol fee, not an extra fee added to P + C. This method only covers the documented curve leg; it does not yet quote sell paths or V3 synthetic migration's post-completion pool leg.

## 5. Historical fee configuration

Fee configuration updates such as UpsertFeeTiersEvent, UpdateFeeConfigEvent, UpsertStableFeeTiersEvent, UpdateStableFeeConfigEvent, and SetExoticFlatFeesEvent are decoded as change signals.

A change signal invalidates the last known snapshot. The adapter waits for a subsequent authoritative FeeConfig account snapshot before marking the configuration available again. This intentionally favors an explicit unknown fee state over silently applying today's tiers to historical trades.

## 6. Important exclusions and edge cases

- This implementation is a decoder / research component only. It does not construct, sign, or submit transactions.
- The first fee resolver supports SOL-quoted curves only. USDC and pump-token quote paths return unsupported rather than using lamport math.
- Mayhem instructions and events can be decoded, but Mayhem synthetic quote behavior is not yet implemented. Mayhem does not use ordinary synthetic migration.
- Pump V3 trades work for Mayhem coins according to the V3 docs, but cashback coins are the exception: V3 fails with CashbackCoinNotSupported; use V2 semantics for observed successful cashback trades.
- A V3 buy crossing curve completion must be split into the curve leg, completion event and post-completion pool leg. The post-completion leg is not bonding-curve OHLCV.
- Pump.fun's additional app Platform Fee, published as 0.45% without a referral code or 0.40% with one from 2026-10-17 for web / mobile app trades, is not part of the Pump on-chain FeeConfig. It is excluded from this on-chain resolver and must remain a separate interface-level cost overlay when applicable. Terminal and third-party interface trades are excluded from that published Platform Fee.
- Failed transactions must not be treated as executed trades merely because a decodable instruction appears in the transaction message.

## 7. Test coverage added

test/pump-adapter.test.mjs covers:

- Base58 round trips and leading zero bytes.
- V3 instruction arguments and omitted optional tail arguments.
- Unknown discriminators / unsupported programs.
- Anchor event decoding.
- Program invocation stack filtering for logs.
- Historical short BondingCurve account layouts.
- Nested FeeConfig / FeeTier / Fees account decoding.
- Market-cap and fee-tier threshold boundaries.
- FeeConfig-first resolution and Global fallback.
- Stale fee-config timeline behavior.
- Exact SOL-in integer rounding.

The repository includes a Node.js 22 GitHub Actions workflow for npm test. The workflow file is committed, but a successful Actions run has not yet been observed; do not report these tests as passed until CI or a local Node 22 run confirms them.

## 8. Next steps

1. Run the Node 22 test suite and fix any failures.
2. Add differential fixtures from confirmed, successful Pump transactions.
3. Compare decoded TradeEvent fields with instruction arguments and account deltas.
4. Implement token / quote decimal-aware normalized execution prices.
5. Implement exact-token-out buy and exact-token-in sell quote paths against the pinned SDK.
6. Implement a historical FeeConfig snapshot collector / account timeline.
7. Implement state reconciliation using authoritative pre- and post-transaction account snapshots.
8. Add synthetic migration and Mayhem-specific quote tests before enabling those quote paths.

## 9. References

- Pump public IDL: https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump.json
- Pump Fees IDL: https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump_fees.json
- Pump dynamic fee documentation: https://github.com/pump-fun/pump-public-docs/blob/main/docs/FEE_PROGRAM_README.md
- Pump V3 trade documentation: https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/TRADE_V3.md
- Pump fee sweep documentation: https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/SWEEP_FEES.md
- Pump.fun app fee disclosure: https://pump.fun/docs/fees?include-nsfw=true
- Official Pump SDK 4.1.0: https://www.npmjs.com/package/@pump-fun/pump-sdk/v/4.1.0
