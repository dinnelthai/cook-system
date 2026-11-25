# Math model entrypoint review — 2026-11-25

Scope: sampled static review of the read-only accounting, historical evidence, risk and synthetic QA paths at dba43fe54978ae23ceeed47c68997b366d0995fb. This is not a complete call-graph or proof of all research equations being implemented. No live market execution or intervention model is reviewed for deployment.

| Canonical model | Existing consumer | Evidence boundary |
|---|---|---|
| Historical cost basis | historical-mvp-report → historical-dashboard → terminal-state | Supplied historical replay; allocation and ownership unattested |
| Financial identities | project-financial-close-review → project-treasury-review → project-interval-model-evidence | Arithmetic and supplied fields, not source authentication |
| Archived account and cash reconciliation | terminal-evidence → terminal-state | One declared localnet scope |
| Participant model metadata | unified-synthetic-review and project-interval-model-evidence | Synthetic metadata, unused parameters explicitly declared |
| Participant validation suite | review-math-models CLI → math-review-report; unified acceptance | Synthetic regression only |
| Historical calibration interval coverage | participant-calibration-readiness → math-review-report | Declared scope checks; no fitting or real-world accuracy |
| LP statement reconciliation and valuation | business-scenario-acceptance; unit tests | Synthetic-only; historical position evidence unavailable |
| Portfolio risk | business-scenario-acceptance | Synthetic configured limits; project runtime has no independently verified portfolio inputs |
| Historical market quality | project market evidence → runtime-market-state | Descriptive closed interval; no current venue or liquidity assessment |

Changes in this review: normalize localnet/local_sim only for read-only calibration comparisons with the same declared genesis, enforce u64 slot bounds, and explicitly expose math QA coverage separately from aggregate regression status. The existing formulas and artifact schema versions are retained. New fields do not authorize settlement or trading.

Remaining evidence gaps: historical LP statements and NAV inclusion, full real-world data coverage and independent parity, participant parameter calibration, all-page browser checks and long-duration soak. Do not replace missing evidence with synthetic figures or zero. This review does not certify that every research document has a corresponding implementation.
