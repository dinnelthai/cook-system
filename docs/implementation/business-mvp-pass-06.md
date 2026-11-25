# B07/B08 — Creator Fee subledger and lifecycle dossier

B07 adds a detailed Creator Fee event ledger and one-to-one receipt-to-cash posting reconciliation. Accruals remain receivables; pool fee buckets are not cash receipts. Incomplete history, duplicate references, unverified events and amount mismatches withhold verified cash and closing receivable totals.

B08 combines the explicit Pump graduation history review, closed-interval financial review and Creator Fee subledger into one project dossier. It cross-checks token mint, network and quote mint only when each source explicitly provides those identity fields. Quote asset symbols are not treated as mint addresses. Missing cross-source identity is PARTIAL; contradiction is REVIEW_REQUIRED. No actual settlement, execution, ownership or source attestation is granted.

Also fixes B06: NAV endpoint values are exposed only after endpoint arithmetic is internally consistent. Regression coverage asserts that contradictory endpoint valuation is withheld.

Real RPC fixture coverage, independent source authentication, wallet ownership and browser acceptance remain pending.