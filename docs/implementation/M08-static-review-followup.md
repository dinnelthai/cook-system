# M08 — static review follow-up
Baseline: ae4597cb922708bae23c85138e1dd1f6541687b1. Retrospective/offline scope only. No transaction capability, permissions, simulated participant policies or execution changes.
- Catalogue: canonical object key ordering for duplicate comparison; use consistent declared nested identity for indexing; expose declared identity completeness without attestation. Different original records under the same interval still require explicit conflict review; incomplete identities remain provisional.
- Batch: shared raw-array boundary for CLI and browser; core still audits invalid rows individually in a raw batch. Derived reports rejected. CLI exit 1 for invalid envelope, 2 for audit review.
- Synthetic retrospective ledger: compare complete declared market identity with canonical JSON; separately check negative intermediate balances in supplied posting order. This does not verify execution semantics, real market behavior, or independent transaction order.
- Remaining: explicit trust-state consumer contracts, report recomputation profiling, actual browser M07, credential rotation confirmation, and branch protection. No production acceptance claimed.
