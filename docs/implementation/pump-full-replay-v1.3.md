# Pump Full Replay Engine — V1.3

- Status: Implementation and CI verification in progress
- Version: 1.3
- Date: 2026-11-23
- Parent: Pump Decoder / Dynamic Fee Resolver V1.2
- Scope: SOL-paired Pump bonding-curve transactions, completion, PumpSwap migration, and Mayhem quote semantics

## 1. V1.3 deliverables

V1.3 extends the V1.2 decoder into a complete ingestion / normalization / replay path:

1. Solana JSON-RPC client for transaction, block, account, slot and signature history retrieval.
2. SPL Token / Token-2022 mint decimal decoding and Pump BondingCurve account snapshots.
3. Pump / Pump Fees / PumpSwap IDL decoding, including CreateEvent, CompleteEvent, PostCompleteBuyEvent, CompletePumpAmmMigrationEvent and PumpSwap CreatePoolEvent.
4. Confirmed transaction parsing with log-index event ordering, top-level and inner instruction association, failed-transaction exclusion, and v0 loaded-address support.
5. Wallet lamport and SPL token-account delta extraction and event reconciliation.
6. Exact-input / exact-output curve quotes, sell quotes, V3 synthetic migration quote legs, and explicit Mayhem partial-fill handling.
7. FeeConfig update history collection with an explicit baseline-snapshot requirement for historical exactness.
8. CLI tools for mint-history replay and confirmed real-chain fixture capture.
9. Pump SDK 4.3.1 differential tests.

## 2. Added source modules

| Module | Responsibility |
|---|---|
| `solana-rpc.mjs` | JSON-RPC transport, retry policy and typed RPC errors |
| `pump-account-codec.mjs` | SPL Mint, Token-2022 Mint and Pump BondingCurve account decoding |
| `pump-transaction-parser.mjs` | Program instruction / log event association and canonical transaction parsing |
| `transaction-reconciler.mjs` | Native SOL and token balance deltas, trade reconciliation and current-account comparison |
| `pump-lifecycle-normalizer.mjs` | Create, completion, post-completion, migration, pool-create and fee-sweep event normalization |
| `pump-fee-history.mjs` | FeeConfig PDA snapshot and fee-update event history |
| `pump-history-collector.mjs` | Mint signature pagination, transaction fetch, block ordering, replay and raw OHLCV |
| `quote-engine.mjs` | Exact quote-in, exact token-out, sell, V3 migration and Mayhem quote paths |

The pinned IDL snapshot now includes Pump migration events / instructions and the PumpSwap CreatePoolEvent / Pool layout.

## 3. Quote engine

Exports:

- `quoteExactQuoteInBuy(...)`
- `quoteExactTokenOutBuy(...)`
- `quoteExactTokenInSell(...)`
- `quoteV3ExactTokenOutBuy(...)`
- `quoteV3ExactQuoteInBuy(...)`
- `quoteMayhemExactTokenOutBuy(...)`
- `quoteMayhemExactQuoteInBuy(...)`

All reserve and amount math is BigInt. Fees are returned as protocol / creator components. Curve and pool legs remain separate in V3 quote results. The pool quote state is derived from the curve's real quote reserves, curve-completion quote, curve token-account balance, and pool migration fee.

Mayhem does not enter the synthetic migration branch. A request that exceeds remaining curve inventory fails unless `partialFill=true`; with partial fill, only the remaining curve inventory is quoted and unused input is returned.

The current quote adapter intentionally supports SOL-paired bonding curves only. Non-SOL quote mints return an explicit unsupported status rather than applying lamport math to a different token's base units.

## 4. Transaction replay and reconciliation

The transaction parser:

- Resolves static and v0 loaded account keys.
- Decodes Pump trade / lifecycle instructions and Pump / Pump Fees / PumpSwap Program data events.
- Associates events with their top-level instruction and inner CPI index using the runtime log stack.
- Assigns one deterministic event sequence across all decoded programs in the transaction.
- Excludes all events from failed transactions from the normalized execution stream.
- Keeps unknown or partially decoded records in `unresolved_events` rather than silently dropping them.

Balance reconciliation aggregates token accounts by owner and mint, and computes SOL lamport deltas with the transaction network fee added back only for the fee payer. A reconciliation passes only when the actor's token delta and native quote delta both exactly match the normalized event amounts. Transactions with rent, additional transfers, or unrelated instructions remain warnings; the adapter does not force a false pass.

Historical account bytes are not included in standard `getTransaction` responses. The collector therefore uses observed post-state in Pump events, transaction balance deltas, and a current BondingCurve account snapshot. It compares the current account with replay only when the lifecycle remains comparable. It does not pretend that a current account read is a historical pre/post account snapshot.

## 5. FeeConfig history

The collector fetches the Pump FeeConfig PDA, decodes update events from transactions that reference it, and records the current account snapshot at its RPC context slot.

A current snapshot cannot be backdated. Exact historical tier resolution requires an authoritative baseline FeeConfig snapshot before the replay window and complete update-event coverage. Without that baseline, earlier trades are marked unavailable / stale / unverified. The code deliberately refuses to apply today's fee tiers to historical trades.

## 6. Real-chain operation

Set an RPC endpoint outside the repository:

```bash
export SOLANA_RPC_URL="https://your-archive-capable-solana-rpc"
export SOLANA_COMMITMENT="confirmed"
npm install
npm test
```

Replay a token:

```bash
npm run replay:pump -- --mint <TOKEN_MINT> --limit 10000 --fee-history --out artifacts/pump-history.json
```

Capture a confirmed transaction fixture:

```bash
npm run capture:pump-fixture -- --signature <CONFIRMED_SIGNATURE> --mint <TOKEN_MINT>
```

The capture script refuses failed transactions. It records the raw RPC response and parser output in `fixtures/real/`. Never commit RPC URLs, provider credentials, private keys, or wallet secrets.

Some public RPC providers do not retain historical blocks. A provider must support the requested `getTransaction`, `getBlock`, and account reads for the requested time range. If a block or transaction is unavailable, the collector records a data gap and will not label the replay complete.

No fabricated transaction is committed as a real fixture. Real-chain differential validation is only complete after the capture command is run against confirmed mainnet transactions and the captured fixture is checked into the repository.

## 7. SDK differential tests

The project pins `@pump-fun/pump-sdk@4.3.1` as a development-only reference. A postinstall compatibility patch adjusts the transitive agent-payments package's CommonJS Anchor BN import for Node.js ESM. It does not modify Pump program logic or runtime quote code.

The CI suite compares local exact-token-out buy, exact-token-in sell, and V3 migration quotes with the SDK using deterministic fixture states. The SDK comparison is a reference check, not a substitute for real transaction fixtures.

## 8. Known boundaries

- SOL-paired quote path only; USDC / other quote-mint math is explicitly unsupported.
- Exact historical FeeConfig is unavailable without a baseline account snapshot and complete update coverage.
- Historical account data is not returned by standard RPC `getTransaction`; full historical account snapshots require an archive / Geyser / indexed source.
- V3 synthetic migration is modelled as a curve leg plus a PumpSwap pool leg; captured `PostCompleteBuyEvent` and `CreatePoolEvent` are retained as observed evidence for differential validation.
- Mayhem synthetic migration is disabled; only the documented partial-fill / fail behavior is quoted.
- Cashback coin V3 trades are not enabled by this adapter; observed successful V2 paths remain separate.
- No transaction construction, signing, submission, wallet custody, or live trading is implemented.

## 9. References

- Pump public IDL: https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump.json
- Pump Fees IDL: https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump_fees.json
- PumpSwap IDL: https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump_amm.json
- Pump BUY V2 / V3 docs: https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/BUY.md
- Pump V3 trade docs: https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/TRADE_V3.md
- Pump synthetic migration docs: https://github.com/pump-fun/pump-public-docs/blob/main/docs/SYNTHETIC_MIGRATION.md
- Pump dynamic fees: https://github.com/pump-fun/pump-public-docs/blob/main/docs/FEE_PROGRAM_README.md
- Pump SDK 4.3.1: https://www.npmjs.com/package/@pump-fun/pump-sdk/v/4.3.1
