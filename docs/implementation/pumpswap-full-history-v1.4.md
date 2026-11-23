# PumpSwap Full History Replay — V1.4

- Status: Implemented; 59 / 59 Node.js 22 tests pass; mainnet fixture validation pending
- Version: 1.4
- Date: 2026-11-23
- Parent: Pump Full Replay Engine V1.3
- Scope: Pump bonding-curve migration discovery, PumpSwap pool transaction ingestion, swap / liquidity / fee events, reserve replay and current pool-vault reconciliation

## 1. Why V1.4 exists

V1.3 collected the Pump BondingCurve address history. That is not sufficient for a token's full lifecycle: after migration, ordinary trades touch the PumpSwap Pool and its token vaults, not the BondingCurve account.

The earlier IDL snapshot also contained only `CreatePoolEvent` for PumpSwap. It did not include the `BuyEvent`, `SellEvent`, or trade instruction definitions needed to decode post-graduation swaps.

V1.4 closes that ingestion and decoding gap. A replay is not labelled full merely because the curve history is complete; every discovered PumpSwap pool must also pass its own coverage and state checks.

## 2. Official PumpSwap IDL snapshot

The PumpSwap section of `pump-idl.snapshot.json` is now synchronized to the official `pump-fun/pump-public-docs/idl/pump_amm.json`:

- 38 instructions
- 27 events
- 7 account definitions
- 40 type definitions

The snapshot includes `BuyEvent`, `SellEvent`, `DepositEvent`, `WithdrawEvent`, `SweepPoolFeeEvent`, `CreatePoolEvent`, and the current `Pool` account layout.

The Borsh reader now supports signed `i128`, required for `Pool.virtual_quote_reserves` and the corresponding trade-event field. Older Pool accounts with omitted appended fields are decoded with safe zero / false defaults.

## 3. Pool discovery and history collection

The collector now follows this sequence:

1. Derive the Pump BondingCurve PDA from the mint.
2. Fetch the curve signature history and parse its Create / Trade / Complete / migration events.
3. Discover the canonical PumpSwap pool from `CreatePoolEvent` or `CompletePumpAmmMigrationEvent`.
4. Fetch the Pool account and its base / quote token vaults.
5. Collect signatures for each discovered Pool address.
6. Merge and deduplicate curve and pool signatures, then fetch each transaction and its block index once.
7. Parse the combined transaction stream with the resolved pool metadata.
8. Replay curve events and pool events separately.
9. Reconcile the final Pool account and both vault token balances against the replayed pool state.

The result contains separate curve and per-pool signature coverage, gaps, unresolved events, replay results, and current-account reconciliation.

## 4. PumpSwap event normalization

The parser normalizes:

- `BuyEvent` → `POOL_BUY_EXECUTED`
- `SellEvent` → `POOL_SELL_EXECUTED`
- `DepositEvent` → `POOL_LIQUIDITY_ADDED`
- `WithdrawEvent` → `POOL_LIQUIDITY_REMOVED`
- `SweepPoolFeeEvent` → `POOL_FEE_MOVEMENT`
- `BoostBuyAndBurnEvent` → `POOL_BOOST_BUY_BURN`

Trade events include the pool, actor, base / quote mints, base and quote amounts, execution price, fee components, pool vault addresses, raw reserve observations and the signed virtual-quote observation.

PumpSwap BuyEvent / SellEvent raw `pool_base_token_reserves` and `pool_quote_token_reserves` are treated as **pre-swap observations**, not post-swap balances. Post-state is reconstructed from the pool base / quote token-account deltas in transaction metadata. The collector does not infer post-state from the trader's gross quote amount because fees and fee transfers can make those amounts differ. The appended `virtual_quote_reserves` event value is checked against both the replayed pre-operation and post-operation values; the implementation does not assume which side of the state mutation the log captured.

Actor base / quote token deltas, pool base-vault deltas, and pool quote-vault direction are reconciled independently.

## 5. Pool replay

Pool replay starts from the observed `POOL_CREATED` event and applies transaction-level vault deltas once per transaction. Protocol-driven boost buy-and-burn events are applied as explicit post-reserve transitions and are not counted as user swap volume. It tracks:

- Raw base-vault and quote-vault reserves
- Virtual quote reserves
- Protocol and creator fees retained by V2 trades
- Fee sweeps
- Buy / sell quote volume and base-token volume
- Liquidity additions and removals

The current account reconciliation compares replayed state with:

- `Pool.protocol_fees`
- `Pool.creator_fees`
- `Pool.virtual_quote_reserves`
- The current base token vault amount
- The current quote token vault amount

The initial boost-reserve baseline is derived from the current-account invariant `boost_reserves = virtual_quote_reserves + protocol_fees + creator_fees`. The replay then subtracts protocol / creator fees retained by V2 trades from signed virtual quote reserves and adds them back when the corresponding fee bucket is swept. This preserves the boost-reserve invariant while the raw vault balance and virtual offset move in opposite directions.

Effective quote reserves are calculated as:

`effective_quote_reserves = quote_vault_amount + virtual_quote_reserves`

Raw quote-vault balance and effective quote reserves are kept as separate values.

## 6. Candles

One-minute candle generation now includes both:

- Pump curve buys / sells
- PumpSwap pool buys / sells

The market phase remains part of the candle market identity, so pre-graduation curve candles and post-graduation PumpSwap candles remain distinguishable.

Liquidity deposits, withdrawals, and fee sweeps do not count as swap volume.

## 7. Completeness rules

A full PumpSwap replay requires:

- Exhausted signature history for the pool address (or a reached explicit boundary)
- Every discovered transaction fetched
- Block transaction indexes available
- No unresolved PumpSwap market events
- Complete event ordering
- Pool vault token-account deltas available for every state-changing pool transaction
- Final replayed reserves and fee balances matching the current Pool account and vaults

If an event that can change pool state is not supported, the pool replay remains partial. The collector must not silently ignore a state-changing event and claim complete history.

## 8. Current limitations

- The Pump bonding-curve quote path remains SOL-paired only.
- PumpSwap pools with non-SOL quote mints can be decoded when pool metadata and mint decimals are available, but non-SOL bonding-curve replay is not enabled.
- Other unknown PumpSwap events are retained as unresolved; unknown market-changing events prevent a full-history claim.
- Historical FeeConfig resolution still requires a baseline snapshot before the replay window and complete update-event coverage.
- No confirmed mainnet Pump-to-PumpSwap fixture has yet been captured and checked in. The end-to-end integration test is deterministic and mocked; it is not presented as a real-chain fixture.

## 9. Verification

The V1.4 suite has 59 passing Node.js 22 tests and covers:

- Full official PumpSwap IDL event / instruction presence
- BuyEvent decoding and normalization
- Actor and pool-vault token delta reconciliation
- Pool account and SPL token-vault decoding
- Signed i128 Borsh decoding
- Pool reserve / fee replay and current snapshot reconciliation
- V2 fee retention and sweep invariants, including negative signed virtual quote reserves
- Boost buy-and-burn event decoding and post-reserve replay
- End-to-end mocked curve → migration → PumpSwap buy history collection

The real-chain acceptance gate remains: run the replay against an archive-capable Solana RPC for a confirmed migrated token, capture the raw transactions and current pool / vault accounts, and verify that the resulting replay and current-account reconciliation pass.

## 10. References

- PumpSwap IDL: https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump_amm.json
- PumpSwap trade V2 docs: https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/PUMP_SWAP_TRADE_V2.md
- PumpSwap pool and effective quote reserves: https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_SWAP_README.md
- Pump fee sweeps: https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/SWEEP_FEES.md
- Synthetic migration: https://github.com/pump-fun/pump-public-docs/blob/main/docs/SYNTHETIC_MIGRATION.md
- PumpSwap BuyEvent field reference: https://docs.rs/pumpswap-sdk/latest/pumpswap_sdk/events/struct.BuyEvent.html
