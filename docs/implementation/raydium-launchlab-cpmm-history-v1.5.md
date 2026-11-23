# Raydium LaunchLab → CPMM Full Execution History — V1.5

- Status: Implemented; Node.js 22 CI green (68 / 68); MCAT mainnet replay pending
- Version: 1.5
- Date: 2026-11-23
- Parent: Pump / PumpSwap Full Replay V1.4
- Scope: Read-only Raydium LaunchLab curve history, graduation discovery, Raydium CPMM swap history, OHLCV normalization and pool-vault delta reconciliation

## 1. Why V1.5 exists

A token is not necessarily launched through Pump. The supplied MCAT mint is identified by Solscan as a Raydium Launchpad token, and its market records identify Raydium CPMM after graduation. Reusing the Pump BondingCurve PDA or PumpSwap parser for this mint would be incorrect.

V1.5 adds a separate Raydium adapter. Pump and Raydium remain independent protocol adapters; they share only the Borsh primitives and normalized candle schema.

## 2. Official program IDs and IDL provenance

| Program | Program ID | Official IDL source blob |
|---|---|---|
| Raydium LaunchLab | `LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj` | `raydium-io/raydium-idl` blob `70186e3f02c2bead7e5a9a92453104df853683ed` |
| Raydium CPMM | `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C` | `raydium-io/raydium-idl` blob `923d272a4e56643ef7fece05ca137c036b0295de` |

The vendored snapshots are stored in `src/adapters/raydium/idl/`. The shared Borsh reader now supports Anchor enum types required by LaunchLab event and account layouts.

## 3. PDA derivation

LaunchLab PoolState:

```text
PDA(
  seeds = ["pool", base_mint, quote_mint],
  program = LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj
)
```

Raydium CPMM PoolState:

```text
PDA(
  seeds = ["pool", amm_config, sorted(token_0_mint, token_1_mint)],
  program = CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C
)
```

The mint ordering is bytewise PublicKey order, not lexical string order.

## 4. Collector flow

1. Read the token mint and quote mint to obtain decimals.
2. Derive the LaunchLab PoolState PDA and verify its account owner and discriminator.
3. Fetch the LaunchLab pool's signature history and decode instructions / Anchor event-CPI records.
4. Discover `migrate_to_cpswap` from the actual transaction account mapping.
5. Read the CPMM config and verify the discovered CPMM pool against its derived PDA.
6. Verify the CPMM PoolState owner, discriminator, token mints and vault identities.
7. Fetch both address histories, deduplicate signatures, fetch transactions and resolve same-slot order with `getBlock` only where needed.
8. Normalize LaunchLab `TradeEvent` and CPMM `SwapEvent` into the shared observed-chain event schema.
9. Reconstruct raw vault balances from transaction `preTokenBalances` / `postTokenBalances` deltas.
10. Compare replayed raw vault balances with current SPL token-account amounts.
11. Refuse a full-history status when an instruction/event is unknown, an order is ambiguous, a signature/transaction is missing, a vault delta is unavailable, or a state-changing vault delta has no decoded protocol event/instruction explanation.

Unknown instructions and unknown events from either supported program are retained as unresolved evidence. They are not silently skipped.

## 5. Normalized execution events

### LaunchLab

- `TradeEvent` → `CURVE_BUY_EXECUTED` / `CURVE_SELL_EXECUTED`
- Quote/token amounts follow the event's trade direction.
- Per-trade protocol, platform, creator and share fees are preserved separately.
- Pre/post real reserves and virtual reserves are retained as raw event evidence.

### Raydium CPMM

- `SwapEvent` → `POOL_BUY_EXECUTED` / `POOL_SELL_EXECUTED`
- Direction is determined from the actual input/output mint pair, not from an assumed token ordering.
- Input/output amounts, transfer fees, trade fee, creator fee and creator-fee mode are preserved.
- `LpChangeEvent` is retained as a protocol event and is not counted as swap volume.
- Fee collection instructions are decoded; vault movements are independently reconciled from token balance deltas.

The Node.js 22 GitHub Actions run for V1.5 passed all 68 tests. The 1-minute and 5-minute candle outputs are market-phase specific. LaunchLab curve candles and post-graduation CPMM candles are not merged into one synthetic market.

## 6. Raw vault replay

For each pool vault, the collector sums transaction-level token balance deltas from the pool's complete address signature history:

```text
replayed_vault_balance = Σ(post_token_balance − pre_token_balance)
```

Newly created token accounts use a zero pre-balance when the pre-token-balance entry is absent and the post entry exists. A touched vault with neither pre nor post token-balance evidence is a gap, not zero.

A pass requires:
- Exhausted signature history (or an explicit replay boundary)
- Every transaction fetched
- Same-slot order resolved for all relevant transactions
- No unresolved program instructions or events
- Every non-zero pool-vault delta explained by a decoded protocol event or instruction
- Replayed raw balances equal current SPL token-account balances
- The latest signature is unchanged between history collection and final account snapshot

This is a raw vault-balance replay. It is not a historical LP ownership replay and does not yet reconstruct every historical fee bucket or Float fee-distribution cycle.

## 7. Target token acceptance case

Target mint:

`BzPyyYCTmQNq2BcfQ4ANAvCYk54rnmQEXMFvFT8RhWMi`

Preliminary public evidence identifies the on-chain launch program as Raydium LaunchLab (Solscan shows Raydium Launchpad Authority and the Raydium Launchpad tag). The supplied mint and WSOL quote mint derive to the following LaunchLab pool address:

`CUUso33BfcnWkVuWhZnMdWWJVj2SyVhJb7TMJnNg634e`

The public Raydium CPMM market record identifies:

- CPMM pool: `9pqo6WVjKvYNnRgvPVaoTe1zZvnhtB248ChKnUmKfHH4`
- AMM config: `9UQpPzgjju8DhHGcdnGDuXck4VGnHzGhRxT2NmEr6aS8`
- WSOL vault: `6yxjrn9RLSEsZev6CaP4YACyw3TdRZeMTNEygm4UnDVy`
- MCAT vault: `2VBQvti8ACZnCa8kPhj1QLmyU5ohxeuCa4T9DS5LJkuP`

The CPMM PDA derived from the AMM config and sorted mint pair matches the reported pool address. This is an identity/PDA cross-check, not yet a live RPC replay. Solscan identifies the token as a Raydium Launchpad asset; the word “Float” appearing in some market UI is not used as the on-chain program identifier.

Secondary Meteora DLMM pools are visible in the historical market snapshot but are outside V1.5. A Raydium-only replay must not be labelled as the token's complete cross-DEX volume history.

## 8. Commands

Configure an archive-capable RPC endpoint outside the repository:

```bash
export SOLANA_RPC_URL="https://your-archive-capable-solana-rpc"
export SOLANA_COMMITMENT="confirmed"
```

Run the target token:

```bash
npm run replay:raydium -- \
  --mint BzPyyYCTmQNq2BcfQ4ANAvCYk54rnmQEXMFvFT8RhWMi \
  --quote-mint So11111111111111111111111111111111111111112 \
  --limit 50000 \
  --out artifacts/mcat-raydium-history.json
```

Add `--include-transactions` to include fetched transaction parser output in the artifact. Do not commit RPC URLs, provider API keys, private keys or wallet secrets.

## 9. Explicit limitations

- No real mainnet replay artifact for MCAT has been captured yet; the RPC command must be run with an archive-capable endpoint.
- Historical state older than the RPC provider's retention window may be unavailable. Vault-delta reconciliation should fail rather than fabricate an initial reserve.
- Historical LaunchLab / CPMM fee buckets are preserved as per-trade evidence and current account fields, but not yet fully replayed through every fee collection / Float distribution path.
- Float program fee cycling and buyback/payout events are not yet decoded by this adapter. The Float reference-router IDL must not be mistaken for the deployed Float program IDL.
- Meteora DLMM and DAMM pool histories are not included. Cross-DEX aggregate volume remains out of scope until those adapters are implemented.
- This adapter is read-only. It does not build, sign, submit or simulate trading instructions.

## 10. References

- Official Raydium IDL repository: https://github.com/raydium-io/raydium-idl
- Raydium LaunchLab program: https://solscan.io/account/LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj
- Raydium CPMM program: https://solscan.io/account/CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C
- MCAT token page: https://solscan.io/token/BzPyyYCTmQNq2BcfQ4ANAvCYk54rnmQEXMFvFT8RhWMi
- MCAT CPMM pool: https://solscan.io/account/9pqo6WVjKvYNnRgvPVaoTe1zZvnhtB248ChKnUmKfHH4
- Raydium integration reference: https://github.com/floatdotxyz/float/blob/main/docs/developers/raydium-integration.md
