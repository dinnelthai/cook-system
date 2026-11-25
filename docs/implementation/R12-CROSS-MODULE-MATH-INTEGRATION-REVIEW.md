# R12 — cross-module historical accounting projection review

Baseline `b72c844f681978fe1fec41008d2415b216ba4024`; verified previous code baseline c003f26 passed CI 45626814027 with 802 tests, 201 business regressions and populated historical browser display checks. UI structure remains frozen.

Targeted inspection of canonical model owners and their project-level projections (not exhaustive research equation implementation or dynamic tracing).

| Canonical path | Review result |
|---|---|
| Accounting / inventory / creator fee / financial identity -> treasury review -> runtime | Existing computation retained; interval conflict status now shared by financial section and workflow |
| Historical close and treasury comparison -> continuity | Declared numeric comparison suppressed for a blocked interval |
| Operating income components -> project review | Unrecognized producer status no longer exposes amounts; aggregate status follows blocked rows |
| Candle / closed market quality -> scoped market evidence | Existing canonical computation retained; no new market model |
| Runtime -> business review -> audit bundle | Same blocked interval controls derived presentation; raw archive records remain available as audit evidence |
| Synthetic LP statement / participant QA | Existing offline scope only; no empirical calibration or independent parity |

Finding: prior implementation masked runtime asset amounts but could still expose positive declared comparison states and values through continuity, and section status could remain DECLARED_EVIDENCE_PRESENT. This change reuses the existing blocked interval set and preserves unrelated intervals and missing evidence. No new accounting formulas, data ingestion, UI edits, execution or parameter calibration.

Regression coverage includes an account-total contradiction, valid separate interval, missing market/close review, and unrecognized treasury producer status. New CI required; external operator gates remain pending. Remaining real-world model validity, source provenance, valuation and LP position evidence require independent historical records.
