# Cook System

A research and simulation project for adversarial market-quality analysis, beginning with the Pump.fun pre-graduation bonding-curve phase.

## V1 focus

**Inner Market Adversarial Simulator** — model adversarial and organic participant behavior in an isolated, reproducible simulation, then evaluate whether market-integrity signals can distinguish genuine demand from misleading activity.

This repository is for defensive research, data analysis, and offline simulation. It does not implement live market manipulation, wash trading, self-trading, deceptive volume generation, coordinated-wallet execution, or automated token distribution.

## V1 boundaries

- Market phase: Pump.fun bonding curve, before graduation.
- State: curve reserves, price, supply distribution, wallet-level inventory, transaction ordering, fees, and curve progress.
- Participants: issuer/dev, early holders, snipers, organic buyers/sellers, retail participants, arbitrage/searcher bots, and MEV actors.
- Outputs: raw OHLCV, volume composition estimates, wallet-cluster evidence, price-impact diagnostics, and market-integrity alerts.
- Execution: offline simulation only; no mainnet signing or transaction submission.

## Research principles

1. Preserve raw on-chain facts. Never rewrite or silently discard executed trades.
2. Separate observed facts from inferred wallet relationships and behavioral labels.
3. Treat wallet clustering as probabilistic evidence, not proof of common control.
4. Do not equate arbitrage with manipulation or gross volume with independent demand.
5. Make every simulation reproducible through explicit seeds and scenario metadata.
6. Keep synthetic events clearly labeled and separate from real chain data.

## V1 research documents

- [Inner Market Adversarial Simulator — V1](docs/research/inner-market-adversarial-simulator-v1.md)
- [Inner Market Mathematical Model — V1](docs/research/inner-market-math-model-v1.md)
- [Inner Market Participant Game Model — V1](docs/research/inner-market-agent-game-model-v1.md)
- [Initial Inventory & Demand Absorption Model — V1](docs/research/initial-inventory-demand-absorption-v1.md)

## Planned work

- [ ] Define the bonding-curve state adapter against the exact deployed program version.
- [ ] Implement a deterministic event-driven simulator.
- [ ] Add labeled adversarial and organic scenarios.
- [ ] Implement explainable market-integrity features.
- [ ] Validate detection quality against held-out synthetic scenarios and labeled historical observations.
