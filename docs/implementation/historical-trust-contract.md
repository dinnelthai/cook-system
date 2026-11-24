# Historical trust contract

The unified terminal state and report export derive a shared trust object from recomputed checks, not imported trust labels. D2 means accepted input requires review; D3 means the implemented internal arithmetic and consistency checks passed. D3 does not establish complete evidence coverage. D0/D1 are pre-report states, and D4/D5 require independent authentication and audit capabilities not implemented here. They are never emitted by this module.

Metric metadata distinguishes SYNTHETIC_ONLY, PROVISIONAL, UNAVAILABLE and REVIEW_REQUIRED. Historical NAV endpoint arithmetic can be provisional; historical TWR and drawdown are unavailable without independent time-series evidence. Historical economic purpose, cost allocation and ownership remain unattested. Contradictory supplied candle evidence now blocks unified report readiness, suppresses financial results and appears in risk checks. Missing candle evidence remains distinct from contradiction.

This contract covers the unified terminal, its UI and report exports, and terminal CLI. The raw MVP builder remains a lower-level internal arithmetic report. No independent attestations, execution authorization, signing, trading or settlement capability are added.
