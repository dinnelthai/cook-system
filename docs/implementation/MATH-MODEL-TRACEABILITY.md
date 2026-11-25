# Mathematical model traceability and non-duplicated implementation

Baseline 9f33e0b. Each mathematical family has a canonical owner. New work extends that owner or cross-checks its outputs; no second quote, ledger, NAV, candle, or simulator engine is introduced.

| Model family | Canonical existing implementation | Current evidence / gap |
|---|---|---|
| Curve pricing, fees, migration | src/adapters/pump/quote-engine.mjs, fee-resolver.mjs, test/pump-quote-engine.test.mjs | Existing deterministic SDK regression; external finalized receipt parity pending |
| Supply and reserve conservation | src/core/synthetic-ledger-audit.mjs, synthetic-record-numeric-audit.mjs | Internal QA; reserve-product diagnostic now surfaced in batch. Protocol invariant not certified |
| Project cash, PnL and receivables | src/inner-market/project-accounting.mjs, creator-fee-accounting.mjs | Existing engines, cross-output identity audit added to financial close report |
| Historical inventory and cost basis | src/inner-market/historical-inventory-audit.mjs, historical-cost-basis-audit.mjs | Internal closed-interval reconciliation; external basis and ownership unknown |
| NAV, TWR, sampled drawdown | src/inner-market/historical-nav.mjs, historical-nav-evidence.mjs | Existing arithmetic; independent endpoint valuation pending |
| Address concentration and descriptive turnover | src/core/market-quality-engine.mjs | Exact integer concentration sums, numeric overflow handling; addresses not independent actors |
| Candle integrity | src/core/candle-integrity-audit.mjs, candle-builder.mjs | Existing recomputation; source completeness unknown |
| Participant state and observation | src/simulation/participant-state-review.mjs, participant-observation-model.mjs | Synthetic asset and observation QA; not fitted behavior or actual strategy model |
| Adversarial detection | src/simulation/defensive-evaluation.mjs | Fixed synthetic regression templates, not empirical detector accuracy |
| Independent demand, depth and causal attribution | docs/research/initial-inventory-demand-absorption-v1.md, agent-impact-counterfactual-replay-v1.md | Evidence gaps remain. No ownership inference, intervention or tactical optimization |
| Empirical calibration | src/simulation/participant-calibration-readiness.mjs | Readiness only, no independent history connected |

The new financial identity audit is an independent verifier of the existing report output, not a substitute accounting engine. Its arithmetic checks are not provenance or full balance-sheet certification. A reserve-product decrease can be observed even when recorded asset flows reconcile: batch reporting does not equate either result to protocol parity. Existing synthetic behavior parameters remain uncalibrated. No market manipulation, coordinated wallet activity, attack policies or live execution logic is implemented.

Run npm test and npm run accept:all. The dedicated regression group includes financial identities, market numerical checks, and synthetic batch diagnostics. Real data, browser validation and historical calibration remain operator acceptance tasks.
