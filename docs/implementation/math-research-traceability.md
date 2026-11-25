# Research-to-implementation traceability (reviewed 2026-11-25)

Reviewed baseline: 8ffbdefe282c435297f8a16bc4e5aba6f9459875. [CI 45612532646](https://github.com/dinnelthai/cook-system/actions/runs/45612532646) passed 735 tests, 19 checks and isolated Chromium recovery. Research documents are not an executable specification or evidence of production readiness. This review sampled seven research document outlines and checked the canonical retrospective accounting and QA implementation paths. It does not establish full equation-by-equation equivalence.

| Research or accounting family | Existing implementation / entry | Existing regression evidence | Scope |
|---|---|---|---|
| Market state, reserve and record consistency | src/core/market-state.mjs; src/inner-market/terminal-state.mjs | test/terminal-state.test.mjs | Retrospective observation, independent protocol parity pending |
| Financial balance and net cash identities | src/inner-market/project-accounting.mjs; financial-identity-audit.mjs; project-financial-close-review.mjs | test/project-financial-close-review.test.mjs; test/financial-identity-domain.test.mjs | Exact integer accounting, supplied evidence only |
| Historical inventory and acquisition basis | src/inner-market/historical-cost-basis-audit.mjs; historical-mvp-report.mjs | test/terminal-state.test.mjs | Partial when ordering or attribution is missing |
| Cash and fee receipt evidence | src/inner-market/terminal-evidence.mjs; creator-fee-accounting.mjs | test/terminal-evidence.test.mjs | Scope-bound; unauthenticated source |
| OHLCV and recorded event integrity | src/core/candle-builder.mjs; src/inner-market/terminal-candles.mjs | test/terminal-state.test.mjs | Historical records only |
| Participant regression and conservation | src/simulation/participant-validation-suite.mjs; math-validation-summary.mjs | test/math-review-report.test.mjs | Synthetic QA; not empirical accuracy |
| LP statement accounting | src/inner-market/lp-statement-reconciliation.mjs; lp-statement-valuation.mjs | test/lp-statement-valuation.test.mjs | Synthetic-only; no actual asset or NAV inclusion claim |
| Historical interval coverage | src/simulation/calibration-interval-audit.mjs | test/math-review-report.test.mjs | Declared scope; not independently authenticated |

## Remaining limitations

Research documents on heterogeneous participants, initial inventory and demand, adversarial detection and counterfactual attribution contain research assumptions and hypotheses, not verified empirical relationships. No market intervention or execution policy is part of this traceability review. Do not infer causal attribution, independence, actual demand, real participant behavior or actual liquidation values from the current synthetic checks.

The financial identity patch extends nonnegative-domain checks to cash endpoints, inventory quantity, other assets and gross income/expenses, including malformed standalone fields; signed net PnL and NAV remain valid. The existing 17 identity rows are unchanged for valid inputs. New regression results require CI confirmation. Missing data remain unknown. No new valuation or trading engine.
