# R02 — mathematical model business call-path audit

Reviewed source baseline: 7f1ccd5257bf252b6a3c34e214bb9762f7225314.
Scope: inspected representative canonical owners and direct call sites; not an exhaustive call graph, runtime instrumentation, or verification of all research equations. No new execution logic or predictive strategy.

| Family | Canonical owner | Observed caller / entry | Integration class | Remaining limitation / next task |
|---|---|---|---|---|
| Curve pricing / fees | src/adapters/pump/quote-engine.mjs; fee-resolver.mjs | Existing SDK quote regression; project review uses terminal state, not a project quote call | ENGINE / TEST | No integrated project execution; independent protocol parity pending |
| Curve state | src/core/market-state.mjs | pump-history-collector.mjs → replayCurveEvents | HISTORICAL REPLAY | R06 unify scoped market state |
| Pool reserves | src/core/pool-state.mjs | graduation-history-review.mjs → reconcilePumpSwapPoolSnapshot → project-graduation-evidence.mjs; offline-risk-laboratory.mjs | HISTORICAL REPLAY / SYNTHETIC QA | R05/R06 ownership, pool position vs reserve separation |
| Cash and PnL | src/inner-market/project-accounting.mjs | ledger-audit.mjs → historical-mvp-report.mjs → historical-dashboard.mjs → terminal-state.mjs → project-financial-close-review.mjs → project-treasury-review.mjs | BUSINESS COMPUTATION | R04 complete scoped asset state |
| Cost basis / inventory | src/inner-market/historical-inventory-audit.mjs; historical-cost-basis-audit.mjs | historical-mvp-report.mjs → terminal state → treasury review → project-runtime.mjs (projection) | BUSINESS COMPUTATION / PROJECTION | R04 independent basis and endpoint coverage |
| Creator fees | src/inner-market/creator-fee-accounting.mjs | historical-mvp-report.mjs; creator-fee-ledger-report.mjs → project-treasury-review.mjs | BUSINESS COMPUTATION | R04 no wallet ownership attestation |
| NAV and drawdown | src/inner-market/historical-nav.mjs; historical-nav-evidence.mjs | historical-mvp-report.mjs → terminal-state.mjs → project-financial-close-review.mjs | BUSINESS COMPUTATION | R04 supplied historical endpoint only |
| Financial identities | src/inner-market/financial-identity-audit.mjs | project-financial-close-review.mjs → auditFinancialIdentities; math-review-report.mjs | CROSS-CHECK | Not an independent balance-sheet certification |
| Candles | src/core/candle-builder.mjs | terminal-candles.mjs → project-market-evidence-review.mjs → project-interval-model-evidence.mjs | BUSINESS COMPUTATION / PROJECTION | R06 independent history coverage |
| Market quality / concentration | src/core/market-quality-engine.mjs | scripts/analyze-market-quality.mjs; participant-validation-suite.mjs | STANDALONE / SYNTHETIC QA | R06 canonical market evidence integration; no ownership inference |
| Participant conservation and observation | src/simulation/participant-simulator.mjs; participant-state-review.mjs; participant-observation-model.mjs | participant-validation-suite.mjs → offline-risk-laboratory.mjs; project interval projection exposes model metadata only | SYNTHETIC QA | R03 behavioral validity and declared unused inputs |
| Portfolio risk | src/risk/portfolio-risk-engine.mjs | business-scenario-acceptance.mjs → assessPortfolioRisk | SYNTHETIC QA | R07 scoped risk inputs; not a production risk gate |
| LP statement | src/inner-market/lp-statement-reconciliation.mjs | business-scenario-acceptance.mjs → reconcileLpStatement | SYNTHETIC QA | R05 actual position identity, units, fees and valuation evidence |
| Historical calibration | src/simulation/participant-calibration-readiness.mjs | participant-validation-suite.mjs; math-review-report.mjs | READINESS ONLY | M51 deferred; no fitted model |
| Independent demand and causal attribution | research documents; project-governance-review.mjs explicitly leaves demand/causality unknown | No validated operational computation established in inspected paths | RESEARCH / UNKNOWN | R03/R08 defensive evaluation; not a manipulation or profit optimization model |

## Correctness finding

The canonical candle producer emits CONSISTENT, EMPTY, REVIEW, or UNAVAILABLE. The interval consumer previously treated PASS as the success state. The correction recognizes CONSISTENT and EMPTY, keeps absent/unrecognized states unknown, and propagates REVIEW as a conflict. A regression test covers all states. EMPTY means the declared interval contains no executions, not independent coverage or market health.

## Acceptance

R02 deliverables: documented canonical owners and inspected business call paths; integration classification; one consumer vocabulary correction and regression. R01 previous CI succeeded. R02 CI must be checked independently. R03 follows; no new participant behavior or actual-market assumptions introduced. No model coverage percentage asserted.
