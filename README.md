# Cook System

A research and simulation project for defensive market-quality analysis, with read-only history adapters for Pump bonding curves, PumpSwap, Raydium LaunchLab and Raydium CPMM.

## V1 focus

**Inner Market Adversarial Simulator** — model organic and adverse market conditions in an isolated, reproducible simulation, then evaluate whether market-integrity signals can distinguish broad independent demand from concentrated or misleading activity.

This repository is for defensive research, data analysis, and offline simulation. It does not implement live market manipulation, wash trading, self-trading, deceptive volume generation, coordinated-wallet execution, or automated token distribution.

## V1 boundaries

- Market phase: Pump.fun bonding curve and Raydium LaunchLab / CPMM lifecycle; secondary DEX adapters remain staged.
- State: curve reserves, price, supply distribution, wallet-level inventory, transaction ordering, fees, and curve progress.
- Participants: issuer/dev, early holders, fast entrants, organic buyers/sellers, retail participants, KOL information sources, arbitrage/searcher bots, and abstract MEV ordering actors.
- Outputs: raw OHLCV, volume composition estimates, wallet-cluster evidence, price-impact diagnostics, execution-quality measures, and market-integrity alerts.
- Execution: offline simulation only; no mainnet signing or transaction submission.

## Runtime and tests

- Runtime: Node.js 22+
- No runtime dependencies in the initial core.
- Run tests: `npm test`

The first core slice currently includes:
- checked BigInt arithmetic for base-unit amounts;
- deterministic event ordering and duplicate-event checks;
- immutable OHLCV aggregation from confirmed curve execution events only;
- strict separation of observed-chain and synthetic event streams.

## Research principles

1. Preserve raw on-chain facts. Never rewrite or silently discard executed trades.
2. Separate observed facts from inferred wallet relationships and behavioral labels.
3. Treat wallet clustering as probabilistic evidence, not proof of common control.
4. Do not equate arbitrage with manipulation or gross volume with independent demand.
5. Make every simulation reproducible through explicit seeds and scenario metadata.
6. Keep synthetic data clearly labeled and separate from real chain data.

## V1 research documents

- [Inner Market Adversarial Simulator — V1](docs/research/inner-market-adversarial-simulator-v1.md)
- [Inner Market Mathematical Model — V1](docs/research/inner-market-math-model-v1.md)
- [Inner Market Participant Game Model — V1](docs/research/inner-market-agent-game-model-v1.md)
- [Initial Inventory & Demand Absorption Model — V1](docs/research/initial-inventory-demand-absorption-v1.md)
- [Adversarial Dev Model & Manipulation-Resistance Tests — V1](docs/research/adversarial-dev-manipulation-detection-v1.md)
- [Multi-Agent Inner Market Game Model — V1](docs/research/multi-agent-inner-market-game-model-v1.md)
- [Agent Impact Attribution & Counterfactual Replay — V1](docs/research/agent-impact-counterfactual-replay-v1.md)

## Business completeness baseline

- [Cook System Business Completeness Review & MVP Acceptance Baseline](docs/implementation/BUSINESS-COMPLETENESS-REVIEW.md)

## Project business core

- [Project Aggregate & Event Store — V1](docs/implementation/project-aggregate-v1.md)

## Implementation contracts

- [Canonical Schema Contract — V1](docs/implementation/canonical-schema-contract-v1.md)
- [Pump.fun Bonding Curve Adapter — V1.1](docs/implementation/pump-bonding-curve-adapter-v1.1.md)
- [Pump Decoder & Dynamic Fee Resolver — V1.2](docs/implementation/pump-decoder-fee-resolver-v1.2.md)
- [Pump Full Replay Engine — V1.3](docs/implementation/pump-full-replay-v1.3.md)
- [PumpSwap Full History Replay — V1.4](docs/implementation/pumpswap-full-history-v1.4.md)
- [Raydium LaunchLab → CPMM Full Execution History — V1.5](docs/implementation/raydium-launchlab-cpmm-history-v1.5.md)

### Machine-readable JSON Schemas

- [Market Identity](schemas/market-identity.schema.json)
- [Market Event](schemas/market-event.schema.json)
- [Market State](schemas/market-state.schema.json)
- [Curve Replay State](schemas/curve-replay-state.schema.json)
- [Agent State](schemas/agent-state.schema.json)
- [Action Intent](schemas/action-intent.schema.json)
- [Raw Candle](schemas/raw-candle.schema.json)
- [Market Alert](schemas/market-alert.schema.json)
- [Simulation Ground Truth — evaluation only](schemas/simulation-ground-truth.schema.json)

## Implemented core

- [Exact integer arithmetic](src/core/integer.mjs)
- [Deterministic event ordering](src/core/event-order.mjs)
- [Curve state replay and reconciliation](src/core/market-state.mjs)
- [Raw candle builder](src/core/candle-builder.mjs)
- [Pinned Pump / Pump Fees IDL snapshot](src/adapters/pump/pump-idl.snapshot.json)
- [Official Raydium LaunchLab / CPMM IDL snapshots](src/adapters/raydium/idl/)
- [IDL-driven Raydium decoder](src/adapters/raydium/raydium-decoder.mjs)
- [Raydium LaunchLab → CPMM history collector](src/adapters/raydium/raydium-history-collector.mjs)
- [Raydium mint history replay CLI](scripts/replay-raydium-mint.mjs)
- [IDL-driven Borsh decoder](src/adapters/pump/borsh.mjs)
- [Pump instruction / event / account decoder](src/adapters/pump/pump-decoder.mjs)
- [Dynamic fee resolver and historical config timeline](src/adapters/pump/fee-resolver.mjs)
- [Canonical Pump TradeEvent normalizer](src/adapters/pump/pump-event-normalizer.mjs)
- [Pump lifecycle / migration normalizer](src/adapters/pump/pump-lifecycle-normalizer.mjs)
- [PumpSwap trade / liquidity / fee normalizer](src/adapters/pump/pump-swap-normalizer.mjs)
- [PumpSwap pool and token vault account decoder](src/adapters/pump/pump-account-codec.mjs)
- [PumpSwap pool state replay](src/core/pool-state.mjs)
- [Solana RPC client](src/adapters/pump/solana-rpc.mjs)
- [Pump account codec](src/adapters/pump/pump-account-codec.mjs)
- [Pump transaction parser](src/adapters/pump/pump-transaction-parser.mjs)
- [Transaction balance reconciler](src/adapters/pump/transaction-reconciler.mjs)
- [Exact buy / sell / migration quote engine](src/adapters/pump/quote-engine.mjs)
- [Pump fee history collector](src/adapters/pump/pump-fee-history.mjs)
- [Pump mint history collector](src/adapters/pump/pump-history-collector.mjs)
- [Mint history replay CLI](scripts/replay-pump-mint.mjs)
- [Confirmed transaction fixture capture CLI](scripts/capture-pump-fixture.mjs)
- [SDK Node ESM compatibility patch](scripts/patch-pump-sdk-node-interop.mjs)
- [Core tests](test/core.test.mjs)
- [Pump adapter tests](test/pump-adapter.test.mjs)
- [Pump quote engine tests](test/pump-quote-engine.test.mjs)
- [Pump SDK differential tests](test/pump-sdk-differential.test.mjs)
- [Pump transaction parser tests](test/pump-transaction-parser.test.mjs)
- [Pump RPC / PDA tests](test/pump-rpc.test.mjs)
- [Pump fee history tests](test/pump-fee-history.test.mjs)
- [PumpSwap trade / vault reconciliation tests](test/pump-swap.test.mjs)
- [Pump + PumpSwap full history integration test](test/pump-pumpswap-history.test.mjs)
- [Pump full history collector tests](test/pump-history-collector.test.mjs)
- [Raydium LaunchLab / CPMM decoder tests](test/raydium-decoder.test.mjs)
- [Raydium LaunchLab → CPMM history / vault replay tests](test/raydium-history-collector.test.mjs)
- [Node.js 22 GitHub Actions workflow](.github/workflows/node-tests.yml)

## Next implementation steps

- [x] Add automated JSON Schema registry validation and contract tests (repository-supported keyword subset).
- [x] Add the initial IDL-driven Pump Legacy / V2 / V3 decoder and account / event decoders.
- [x] Add the initial FeeConfig tier resolver and stale-history guard.
- [x] Add deterministic event ordering, curve-state replay, and snapshot reconciliation for normalized inputs.
- [x] Verify the Node.js 22 test suite in GitHub Actions for V1.4: 59 passed, 0 failed.
- [x] Verify the Node.js 22 V1.5 branch suite: 68 passed, 0 failed.
- [x] Differential-test exact buy / sell and V3 migration quote calculations against Pump SDK 4.3.1.
- [ ] Validate captured confirmed TradeEvent and account-delta fixtures against mainnet history.
- [x] Implement exact-token-out buys and exact-token-in sells.
- [x] Add V3 synthetic-migration curve / PumpSwap pool quote legs and Mayhem partial-fill handling.
- [x] Add RPC history collection, transaction parsing, balance reconciliation and fixture capture tooling.
- [x] Discover PumpSwap pools from migration events and collect each pool's post-graduation signature history.
- [x] Decode PumpSwap buy / sell / liquidity / fee-sweep events and replay pool vault reserves.
- [x] Reconcile PumpSwap pool state, signed virtual quote reserves, retained fees and fee sweeps against current Pool / vault accounts.
- [x] Replay PumpSwap boost buy-and-burn transitions from explicit post-reserve observations.
- [ ] Capture and validate confirmed Pump curve → PumpSwap mainnet fixtures with an archive-capable RPC before claiming real-world parity.
- [x] Add official Raydium LaunchLab / CPMM IDL decoders and PDA derivation.
- [x] Add LaunchLab migration discovery, CPMM pool verification, trade-event normalization and OHLCV.
- [x] Reconcile LaunchLab / CPMM raw vault balances from transaction token-account deltas.
- [ ] Run the MCAT LaunchLab → CPMM replay against an archive-capable mainnet RPC and inspect the resulting artifact.
- [ ] Add Meteora DLMM / DAMM history adapters for cross-DEX token-wide volume.
- [x] Add deterministic heterogeneous offline agents and public-information response; keep ground truth separate from detector input.
- [x] Add isolated defensive regression scenarios and held-out seed evaluation (synthetic regression only; not real-market accuracy).


## Overnight implementation status (review branch)

The review branch adds DATA-04 chain-coordinate timeline auditing, DATA-05 candle recomputation, DATA-06 a rebuildable file-backed event index, DATA-07 source/genesis/capture provenance metadata, and DATA-08 regression/chaos coverage. Collector outputs now include per-market event-timeline checks, candle integrity reports, and source provenance observations. It also adds descriptive market-quality analytics, an offline heterogeneous participant simulator, synthetic held-out defensive regression, portfolio-risk evaluation, a hash-chained alert journal, and a paper-only quote-risk planner.

These additions do not complete real-chain acceptance. Mainnet archive-RPC fixtures for Pump/PumpSwap and the MCAT LaunchLab→CPMM replay remain pending; Meteora DLMM/DAMM IDL-driven history adapters remain pending. Independent source authentication, full historical coverage attestation, transactional multi-writer storage, notifications, live wallet signing/submission, and production operational acceptance are not implemented. See docs/implementation/overnight-completion-handoff.md before treating any result as production-ready.


## Unified Codex acceptance

After `npm ci`, run `npm run accept:all`. It checks Node/runtime prerequisites, syntax for tracked source modules, the complete automated test suite, JSON Schema registry validation, repository hygiene and deterministic held-out synthetic regression. It writes a machine-readable report under `.cook-system/acceptance/` (ignored by Git). This is a code-level gate, not proof of actual Localnet, wallet-funded transaction, browser, historical financial parity, or performance acceptance. See [Codex Unified Acceptance Playbook](docs/implementation/CODEX-ACCEPTANCE-PLAYBOOK.md) for the operator-side steps and required report format.
