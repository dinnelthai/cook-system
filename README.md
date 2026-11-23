# Cook System

A research and simulation project for defensive market-quality analysis, beginning with the Pump.fun pre-graduation bonding-curve phase.

## V1 focus

**Inner Market Adversarial Simulator** — model organic and adverse market conditions in an isolated, reproducible simulation, then evaluate whether market-integrity signals can distinguish broad independent demand from concentrated or misleading activity.

This repository is for defensive research, data analysis, and offline simulation. It does not implement live market manipulation, wash trading, self-trading, deceptive volume generation, coordinated-wallet execution, or automated token distribution.

## V1 boundaries

- Market phase: Pump.fun bonding curve, before graduation.
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

## Implementation contracts

- [Canonical Schema Contract — V1](docs/implementation/canonical-schema-contract-v1.md)
- [Pump.fun Bonding Curve Adapter — V1.1](docs/implementation/pump-bonding-curve-adapter-v1.1.md)
- [Pump Decoder & Dynamic Fee Resolver — V1.2](docs/implementation/pump-decoder-fee-resolver-v1.2.md)

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
- [IDL-driven Borsh decoder](src/adapters/pump/borsh.mjs)
- [Pump instruction / event / account decoder](src/adapters/pump/pump-decoder.mjs)
- [Dynamic fee resolver and historical config timeline](src/adapters/pump/fee-resolver.mjs)
- [Core tests](test/core.test.mjs)
- [Pump adapter tests](test/pump-adapter.test.mjs)
- [Node.js 22 GitHub Actions workflow](.github/workflows/node-tests.yml)

## Next implementation steps

- [ ] Add automated JSON Schema validation and contract tests.
- [x] Add the initial IDL-driven Pump Legacy / V2 / V3 decoder and account / event decoders.
- [x] Add the initial FeeConfig tier resolver and stale-history guard.
- [x] Add deterministic event ordering, curve-state replay, and snapshot reconciliation for normalized inputs.
- [ ] Run and verify the Node.js 22 test suite in CI or locally.
- [ ] Differential-test quote calculations against the pinned Pump SDK and confirmed TradeEvent data.
- [ ] Implement exact-token-out buys and exact-token-in sells.
- [ ] Add the curve-completion and synthetic-migration quote boundary.
- [ ] Add heterogeneous organic agents and public-information response.
- [ ] Add isolated defensive scenarios and held-out evaluation.
