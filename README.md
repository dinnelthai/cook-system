# Cook System

A research and simulation project for adversarial market-quality analysis, beginning with the Pump.fun pre-graduation bonding-curve phase.

## V1 focus

**Inner Market Adversarial Simulator** — model adversarial and organic participant behavior in an isolated, reproducible simulation, then evaluate whether market-integrity signals can distinguish genuine demand from misleading activity.

This repository is for defensive research, data analysis, and offline simulation. It does not implement live market manipulation, wash trading, self-trading, deceptive volume generation, coordinated-wallet execution, or automated token distribution.

## V1 boundaries

- Market phase: Pump.fun bonding curve, before graduation.
- State: curve reserves, price, supply distribution, wallet-level inventory, transaction ordering, fees, and curve progress.
- Participants: issuer/dev, early holders, snipers, organic buyers/sellers, retail participants, KOL information sources, arbitrage/searcher bots, and MEV actors.
- Outputs: raw OHLCV, volume composition estimates, wallet-cluster evidence, price-impact diagnostics, execution-quality measures, and market-integrity alerts.
- Execution: offline simulation only; no mainnet signing or transaction submission.

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

### Machine-readable JSON Schemas

- [Market Identity](schemas/market-identity.schema.json)
- [Market Event](schemas/market-event.schema.json)
- [Market State](schemas/market-state.schema.json)
- [Agent State](schemas/agent-state.schema.json)
- [Action Intent](schemas/action-intent.schema.json)
- [Raw Candle](schemas/raw-candle.schema.json)
- [Market Alert](schemas/market-alert.schema.json)
- [Simulation Ground Truth — evaluation only](schemas/simulation-ground-truth.schema.json)

## Planned work

- [ ] Add automated JSON Schema validation and contract tests.
- [ ] Implement decimal-safe amount utilities.
- [ ] Verify the exact bonding-curve program adapter and reserve / fee semantics.
- [ ] Implement deterministic event replay and accounting invariants.
- [ ] Implement raw OHLCV construction from confirmed executions.
- [ ] Implement heterogeneous agents and public-information response.
- [ ] Add isolated adversarial and hard-negative scenarios.
- [ ] Implement explainable market-integrity and execution-quality features.
- [ ] Validate detection quality against held-out seeds and historical observations.
